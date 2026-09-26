"""
Motor de envío de mensajes en MercadoLibre (Selenium).

COPIADO de D:\\Script Etiquetas Venezuela\\main_reportador.py (versión 11/09/2026,
con el arreglo del falso "ML RECHAZÓ"): humanización, detección de chat bloqueado,
detección de rechazo por conteo de avisos, caja que no recibe texto, diagnóstico.
Los tiempos y la rotación de plantillas son la estrategia anti-bot: no tocarlos.

Cambios, solo de fontanería:
  - las plantillas, el texto final y la página llegan del sistema (no están en el código);
  - las esperas largas miran un Event para poder DETENER entre mensajes;
  - logging por callback (lo muestra la ventana) en vez de print/consola.
"""
import os
import random
import shutil
import time
import unicodedata
from datetime import datetime

import undetected_chromedriver as uc
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

# ===== Parámetros: idénticos a main_reportador.py =====
ESPERA_INICIO_NAVEGADOR = 15
TIMEOUT_CAJA = 12
MAX_FALLOS_CAJA_SEGUIDOS = 3
URL_ML = "https://www.mercadolibre.com.ve"
URL_MENSAJERIA = URL_ML + "/ventas/nueva/mensajeria/{order_id}"

FRASES_CHAT_BLOQUEADO = [
    "no puedes contactarte",
    "no puedes enviarle mensajes",
    "no puedes enviar mensajes",
    "no podras enviar mensajes",
    "podras iniciar la conversacion",
    "no es posible enviar mensajes",
    "venta cancelada",
    "esta venta fue cancelada",
    "la venta fue cancelada",
    "conversacion finalizada",
    "la conversacion ha finalizado",
    "la conversacion esta cerrada",
    "ya no puedes responder",
    "ya no puedes escribir",
    "el comprador no esta disponible",
]

FRASES_MENSAJE_RECHAZADO = [
    "no enviamos tu mensaje",
    "no pudimos enviar tu mensaje",
    "contiene links externos",
    "contiene enlaces externos",
    "no se pudo enviar el mensaje",
]


# ===== Excepciones (copiadas) =====
class MensajeRechazado(Exception):
    """ML aceptó el clic pero rechazó el contenido (links externos, datos de contacto)."""
    def __init__(self, motivo):
        super().__init__(motivo)
        self.motivo = motivo


class CajaNoRecibeTexto(Exception):
    """Se escribió el mensaje y la caja quedó VACÍA: algo intercepta el teclado
    (aviso encima del chat, o límite de mensajes de ML). Corta la corrida."""
    def __init__(self, motivo="la caja de texto no recibio ningun caracter"):
        super().__init__(motivo)
        self.motivo = motivo


class ChatNoDisponible(Exception):
    """El comprador no se puede contactar (venta cancelada, conversación cerrada)."""
    def __init__(self, motivo):
        super().__init__(motivo)
        self.motivo = motivo


class SesionCerrada(Exception):
    """ML mandó a la pantalla de login: la cuenta no tiene sesión iniciada en su perfil."""


class Detenido(Exception):
    """El operador tocó Detener."""


# ===== Motor =====
class Motor:
    def __init__(self, log, detener, carpeta_diagnostico):
        self.log = log                    # log(nivel, texto)
        self.detener = detener            # threading.Event
        self.carpeta_diagnostico = carpeta_diagnostico

    # --- esperas (las largas se pueden cortar con Detener) ---
    def espera(self, min_s, max_s):
        time.sleep(random.uniform(min_s, max_s))

    def pausa(self, segundos):
        if self.detener.wait(segundos):
            raise Detenido()

    # --- humanización (copiada) ---
    def escribir_humano(self, elemento, texto):
        for letra in texto:
            elemento.send_keys(letra)
            delay = random.uniform(0.03, 0.09)
            if random.random() < 0.04:
                delay += random.uniform(0.2, 0.6)
            if letra in (" ", ".", ","):
                delay += random.uniform(0.05, 0.15)
            time.sleep(delay)

    def mover_mouse_natural(self, driver, elemento):
        try:
            actions = ActionChains(driver)
            actions.move_by_offset(random.randint(-30, 30), random.randint(-20, 20))
            actions.pause(random.uniform(0.1, 0.3))
            actions.move_to_element(elemento)
            actions.pause(random.uniform(0.1, 0.4))
            actions.perform()
        except Exception:
            pass

    def hacer_scroll_suave(self, driver):
        scroll_amount = random.randint(100, 300)
        driver.execute_script(f"window.scrollBy(0, {scroll_amount});")
        self.espera(0.3, 0.8)
        driver.execute_script(f"window.scrollBy(0, -{scroll_amount});")
        self.espera(0.2, 0.5)

    # --- driver (copiado) ---
    @staticmethod
    def detectar_chrome_major():
        try:
            import winreg
            for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
                try:
                    k = winreg.OpenKey(hive, r"Software\Google\Chrome\BLBeacon")
                    version, _ = winreg.QueryValueEx(k, "version")
                    winreg.CloseKey(k)
                    return int(version.split(".")[0])
                except FileNotFoundError:
                    continue
        except Exception:
            pass
        return None

    def limpiar_driver_cache(self):
        appdata = os.environ.get("APPDATA")
        if not appdata:
            return
        cache_dir = os.path.join(appdata, "undetected_chromedriver")
        if os.path.isdir(cache_dir):
            shutil.rmtree(cache_dir, ignore_errors=True)

    def crear_driver(self, perfil):
        self.limpiar_driver_cache()
        options = uc.ChromeOptions()
        options.add_argument(f"--user-data-dir={perfil}")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument(f"--window-size={random.randint(1200,1400)},{random.randint(700,900)}")
        version = self.detectar_chrome_major()
        self.log("info", f"Chrome detectado: versión {version}")
        return uc.Chrome(options=options, version_main=version)

    # --- detección (copiada) ---
    @staticmethod
    def normalizar(texto):
        texto = unicodedata.normalize("NFKD", texto)
        texto = "".join(c for c in texto if not unicodedata.combining(c))
        return texto.lower()

    def motivo_chat_bloqueado(self, driver):
        try:
            cuerpo = driver.find_element(By.TAG_NAME, "body").text
        except Exception:
            return None
        cuerpo = self.normalizar(cuerpo)
        for frase in FRASES_CHAT_BLOQUEADO:
            if frase in cuerpo:
                return frase
        return None

    def contar_avisos_rechazo(self, driver):
        """Se CUENTA: el aviso rojo de ML queda en el historial para siempre; solo un
        aviso NUEVO (uno más que antes de enviar) es un rechazo de este mensaje."""
        try:
            cuerpo = self.normalizar(driver.find_element(By.TAG_NAME, "body").text)
        except Exception:
            return 0, None
        total, vista = 0, None
        for frase in FRASES_MENSAJE_RECHAZADO:
            n = cuerpo.count(frase)
            if n:
                total += n
                vista = frase
        return total, vista

    def guardar_diagnostico(self, driver, order_id, etiqueta):
        os.makedirs(self.carpeta_diagnostico, exist_ok=True)
        sello = datetime.now().strftime("%Y%m%d_%H%M%S")
        base = os.path.join(self.carpeta_diagnostico, f"{etiqueta}_{order_id}_{sello}")
        try:
            driver.save_screenshot(base + ".png")
        except Exception:
            pass
        try:
            cuerpo = driver.find_element(By.TAG_NAME, "body").text
            with open(base + ".txt", "w", encoding="utf-8") as f:
                f.write(f"URL: {driver.current_url}\n" + "=" * 60 + "\n" + cuerpo)
        except Exception:
            pass
        self.log("warn", f"Diagnóstico guardado: {base}.png")
        return base

    @staticmethod
    def caja_bloqueada(caja):
        try:
            if not caja.is_enabled():
                return True
            if caja.get_attribute("disabled") or caja.get_attribute("readonly"):
                return True
        except Exception:
            pass
        return False

    @staticmethod
    def es_login(driver):
        url = (driver.current_url or "").lower()
        return "/lgz/" in url or "/login" in url or "registration" in url

    # --- envío (copiado; + detección de sesión cerrada) ---
    def enviar_mensaje(self, driver, order_id, mensaje):
        wait = WebDriverWait(driver, TIMEOUT_CAJA)

        driver.get(URL_MENSAJERIA.format(order_id=order_id))
        self.espera(2.5, 4.5)
        if self.es_login(driver):
            raise SesionCerrada()
        self.hacer_scroll_suave(driver)

        motivo = self.motivo_chat_bloqueado(driver)
        if motivo:
            raise ChatNoDisponible(motivo)

        try:
            caja = wait.until(EC.visibility_of_element_located((By.TAG_NAME, "textarea")))
        except TimeoutException:
            if self.es_login(driver):
                raise SesionCerrada()
            motivo = self.motivo_chat_bloqueado(driver)
            if motivo:
                raise ChatNoDisponible(motivo)
            raise

        if self.caja_bloqueada(caja):
            raise ChatNoDisponible("caja de texto deshabilitada")

        self.mover_mouse_natural(driver, caja)
        self.espera(0.3, 0.7)
        caja.click()
        self.espera(0.5, 1.2)

        try:
            tope = caja.get_attribute("maxlength")
            if tope and int(tope) > 0 and len(mensaje) > int(tope):
                self.log("warn", f"La caja admite {tope} caracteres y el mensaje tiene {len(mensaje)}")
        except (TypeError, ValueError):
            pass

        self.escribir_humano(caja, mensaje)
        self.espera(1.0, 2.5)

        try:
            escrito = caja.get_attribute("value") or ""
        except Exception:
            escrito = mensaje

        if len(escrito) == 0:
            self.guardar_diagnostico(driver, order_id, "caja_vacia")
            raise CajaNoRecibeTexto()

        if len(escrito) < len(mensaje):
            self.log("warn", f"Mensaje cortado: entraron {len(escrito)} de {len(mensaje)} caracteres")

        driver.execute_script("""
            arguments[0].dispatchEvent(new Event('input', { bubbles: true }));
            arguments[0].dispatchEvent(new Event('change', { bubbles: true }));
        """, caja)
        self.espera(1.5, 2.5)

        try:
            boton = wait.until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(@aria-label, 'Enviar mensaje')]"))
            )
        except TimeoutException:
            motivo = self.motivo_chat_bloqueado(driver)
            if motivo:
                raise ChatNoDisponible(motivo)
            raise

        avisos_previos, _ = self.contar_avisos_rechazo(driver)

        self.mover_mouse_natural(driver, boton)
        self.espera(0.3, 0.8)
        boton.click()

        self.espera(2.0, 4.0)

        despues, frase = self.contar_avisos_rechazo(driver)
        if despues > avisos_previos:
            raise MensajeRechazado(frase or "aviso de rechazo nuevo en el chat")
        return True
