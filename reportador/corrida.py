"""
Una corrida del Reportador: por cada cuenta, toma su cola del sistema y le escribe a
cada comprador. Misma lógica que run_cuenta() de main_reportador.py (pausas, pausa
larga cada 10, cortacircuito por caja vacía, un reintento al final), con dos cambios:
  - cada resultado se informa al sistema APENAS termina ese mensaje;
  - si la sesión de ML está cerrada, se detiene esa cuenta con un aviso claro.
"""
import os
import random
import traceback
from datetime import datetime
from urllib.parse import urlparse

import servidor as srv
from motor import (
    MAX_FALLOS_CAJA_SEGUIDOS, ESPERA_INICIO_NAVEGADOR, URL_ML,
    CajaNoRecibeTexto, ChatNoDisponible, Detenido, MensajeRechazado, Motor, SesionCerrada,
)


def rellenar(plantilla, bloque, pagina, guia):
    return (plantilla + bloque).replace("{pagina}", pagina).replace("{guia}", guia)


def es_local(url):
    return (urlparse(url).hostname or "") in ("localhost", "127.0.0.1")


class Corrida:
    """emit(evento, datos): 'log' (nivel, texto) · 'envio' (dict) · 'resumen' (dict)"""

    def __init__(self, servidor, cfg_local, emit, detener, simular=False):
        self.srv = servidor
        self.cfg = cfg_local
        self.emit = emit
        self.detener = detener
        # Simulación: sin Chrome y sin escribirle a nadie. SOLO contra un servidor local,
        # porque informa resultados ENVIADO que no ocurrieron.
        self.simular = simular and es_local(servidor.url)
        hoy = datetime.now()
        carpeta = os.path.join(srv.HISTORIAL, hoy.strftime("%Y"), hoy.strftime("%m"))
        os.makedirs(carpeta, exist_ok=True)
        self.log_path = os.path.join(carpeta, f"corrida_{hoy.strftime('%Y-%m-%d_%H%M%S')}.txt")
        self.motor = Motor(self.log, detener, srv.DIAGNOSTICO)

    def log(self, nivel, texto):
        try:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(f"{datetime.now():%H:%M:%S} | {nivel.upper():5} | {texto}\n")
        except OSError:
            pass
        self.emit("log", (nivel, texto))

    def informar(self, envio, estado, detalle=None):
        ok = self.srv.informar(envio["etiqueta_id"], estado, detalle)
        if not ok:
            self.log("warn", f"Sin conexión: el resultado de {envio['order_id']} se guardó en el equipo y se informará después.")
        self.emit("envio", {**envio, "estado": estado, "detalle": detalle or "", "hora": datetime.now().strftime("%H:%M")})

    # ── corrida completa ────────────────────────────────────────────────────
    def ejecutar(self):
        resumen = {"ENVIADO": 0, "SIN_CHAT": 0, "RECHAZADO": 0, "ERROR": 0}
        try:
            quedan = self.srv.informar_pendientes()
            if quedan:
                self.log("error", f"Hay {quedan} resultado(s) de una corrida anterior que no se pudieron informar "
                                  "(sin conexión). Para no repetir mensajes, no se reporta nada hasta informarlos. "
                                  "Revisa internet y vuelve a intentar.")
                return resumen
            config = self.srv.config()
            if config.get("problemas"):
                self.log("error", "La configuración de mensajes tiene problemas: " + " · ".join(config["problemas"]) +
                         ". Corrígela en el sistema (Despachos → Reportador → Mensajes y cuentas).")
                return resumen
            if self.simular:
                self.log("warn", "MODO SIMULACIÓN: no se abre Chrome ni se le escribe a nadie.")

            for cuenta in config["cuentas"]:
                if self.detener.is_set():
                    break
                parcial = self.ejecutar_cuenta(cuenta, config)
                for k in resumen:
                    resumen[k] += parcial.get(k, 0)
        except Detenido:
            self.log("warn", "Detenido por el operador. Lo que no se alcanzó a enviar sigue pendiente.")
        except srv.ErrorServidor as e:
            self.log("error", str(e))
        except Exception:
            self.log("error", "Error inesperado:\n" + traceback.format_exc())
        finally:
            self.srv.liberar()
            self.emit("resumen", resumen)
        return resumen

    # ── una cuenta (run_cuenta) ─────────────────────────────────────────────
    def ejecutar_cuenta(self, cuenta, config):
        nombre = cuenta["nombre"]
        res = {"ENVIADO": 0, "SIN_CHAT": 0, "RECHAZADO": 0, "ERROR": 0}
        envios = self.srv.tomar(nombre)
        if not envios:
            self.log("info", f"[{nombre}] Sin envíos pendientes — no se abre Chrome.")
            return res
        self.log("info", f"[{nombre}] {len(envios)} envío(s) para reportar.")

        driver = None
        try:
            if not self.simular:
                driver = self.motor.crear_driver(srv.perfil_de(self.cfg, nombre))
                driver.get(URL_ML)
                self.log("info", f"[{nombre}] Navegador abierto. No uses el teclado ni el mouse en esa ventana. "
                                 f"Empieza en {ESPERA_INICIO_NAVEGADOR}s…")
                self.motor.pausa(ESPERA_INICIO_NAVEGADOR)

            fallos_caja_seguidos = 0
            corte_por_caja = False
            desde_ultima_pausa = 0
            con_error = []

            for envio in envios:
                if self.detener.is_set():
                    raise Detenido()
                resultado = self.enviar_uno(driver, envio, cuenta, config)
                if resultado == "SESION":
                    return res
                res[resultado] += 1
                if resultado == "ENVIADO":
                    desde_ultima_pausa += 1
                    fallos_caja_seguidos = 0
                elif resultado == "ERROR":
                    con_error.append(envio)
                    if envio.get("_caja_vacia"):
                        fallos_caja_seguidos += 1
                        if fallos_caja_seguidos >= MAX_FALLOS_CAJA_SEGUIDOS:
                            corte_por_caja = True
                            self.log("error", f"[{nombre}] CORRIDA DETENIDA: {fallos_caja_seguidos} ventas seguidas sin poder "
                                              "escribir el mensaje. Causas habituales: un aviso de ML encima del chat, ML "
                                              "limitó los mensajes de la cuenta, o alguien usó el teclado/mouse. Mira las "
                                              f"capturas en {srv.DIAGNOSTICO} y vuelve a intentar en unas horas. "
                                              "No se perdió nada: lo no enviado sigue pendiente.")
                            break
                if resultado in ("SIN_CHAT", "RECHAZADO") or (resultado == "ERROR" and envio.get("_caja_vacia")):
                    self.pausa_corta(3, 6)
                    continue
                self.pausa_entre(desde_ultima_pausa)
                if desde_ultima_pausa >= 10:
                    desde_ultima_pausa = 0

            # Un reintento al final para los errores comunes (no para caja vacía).
            if con_error and not corte_por_caja:
                self.log("info", f"[{nombre}] Reintentando {len(con_error)} envío(s) con error…")
                self.pausa_corta(10, 20)
                for envio in con_error:
                    if self.detener.is_set():
                        raise Detenido()
                    resultado = self.enviar_uno(driver, envio, cuenta, config, reintento=True)
                    if resultado == "SESION":
                        return res
                    if resultado != "ERROR":
                        res["ERROR"] -= 1
                        res[resultado] += 1
                    if envio.get("_caja_vacia"):
                        self.log("error", f"[{nombre}] Reintento cortado: la caja sigue sin aceptar el mensaje.")
                        break
                    self.pausa_corta(10, 20)

            self.log("info", f"[{nombre}] Enviados {res['ENVIADO']} · sin chat {res['SIN_CHAT']} · "
                             f"rechazados {res['RECHAZADO']} · con error {res['ERROR']}")
            if res["RECHAZADO"]:
                self.log("error", f"[{nombre}] ML RECHAZÓ {res['RECHAZADO']} mensaje(s): el comprador NO los recibió. "
                                  "Causa habitual: un link no permitido. Corrige las plantillas en el sistema.")
            return res
        finally:
            if driver is not None:
                try:
                    driver.quit()
                except Exception:
                    pass

    def enviar_uno(self, driver, envio, cuenta, config, reintento=False):
        """Envía un mensaje, informa el resultado y devuelve su estado ('SESION' si hay que parar)."""
        envio.pop("_caja_vacia", None)
        order_id, guia = envio["order_id"], envio["guia"]
        mensaje = rellenar(random.choice(config["plantillas"]), config.get("bloque", ""), cuenta.get("pagina", ""), guia)
        pref = "Reintento " if reintento else ""
        try:
            if self.simular:
                self.motor.pausa(random.uniform(0.3, 0.8))
                r = random.random()
                if r < 0.08:
                    raise ChatNoDisponible("venta cancelada (simulado)")
                if r < 0.12:
                    raise RuntimeError("TimeoutException (simulado)")
            else:
                self.motor.enviar_mensaje(driver, order_id, mensaje)
            self.informar(envio, "ENVIADO", "reintento" if reintento else None)
            self.log("ok", f"{pref}ENVIADO | {order_id} | guía {guia}")
            return "ENVIADO"
        except SesionCerrada:
            self.log("error", f"[{cuenta['nombre']}] La cuenta no tiene sesión iniciada en MercadoLibre. "
                              "Toca \"Iniciar sesión\" para esa cuenta y vuelve a reportar.")
            return "SESION"
        except CajaNoRecibeTexto as e:
            envio["_caja_vacia"] = True
            self.informar(envio, "ERROR", e.motivo)
            self.log("error", f"{pref}NO ENTRA EL TEXTO | {order_id} | {e.motivo}")
            return "ERROR"
        except MensajeRechazado as e:
            self.informar(envio, "RECHAZADO", e.motivo)
            self.log("error", f"{pref}RECHAZADO POR ML | {order_id} | {e.motivo}")
            return "RECHAZADO"
        except ChatNoDisponible as e:
            self.informar(envio, "SIN_CHAT", e.motivo)
            self.log("warn", f"{pref}SIN CHAT | {order_id} | {e.motivo}")
            return "SIN_CHAT"
        except Detenido:
            raise
        except Exception as e:
            detalle = f"{type(e).__name__}: {str(e).strip()[:120]}"
            self.informar(envio, "ERROR", detalle)
            self.log("error", f"{pref}ERROR | {order_id} | {detalle}")
            return "ERROR"

    def pausa_corta(self, a, b):
        self.motor.pausa(random.uniform(a, b) / (20 if self.simular else 1))

    def pausa_entre(self, desde_ultima_pausa):
        if desde_ultima_pausa >= 10:
            s = random.uniform(45, 90)
            self.log("info", f"Pausa larga ({s:.0f}s) cada 10 envíos…")
        else:
            s = random.uniform(10, 20)
        self.motor.pausa(s / (20 if self.simular else 1))
