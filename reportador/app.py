"""
Reportador de guías — ventana (tkinter) + ícono en la bandeja.

Uso normal: doble clic en ReportadorConectado.exe. Queda en la bandeja (junto al reloj)
esperando órdenes del sistema: cada CONSULTA_SEG pregunta si desde Despachos pidieron
"▶ Reportar" y, si hay, reporta solo. Cerrar la ventana lo esconde; "Salir" en el menú
de la bandeja lo cierra de verdad.

  --bandeja   arranca escondido (lo usa el acceso de inicio de Windows)
  --simular   sin Chrome ni mensajes reales; solo contra un servidor local
"""
import ctypes
import os
import queue
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

try:
    import pystray
    from PIL import Image, ImageDraw
except ImportError:          # sin bandeja: la ventana funciona igual, pero cerrar = salir
    pystray = None

import servidor as srv
from corrida import Corrida, es_local
from motor import Motor, URL_ML

SIMULAR = "--simular" in sys.argv
BANDEJA = "--bandeja" in sys.argv
CONSULTA_SEG = 30          # cada cuánto pregunta si hay una orden (en espera)
REFRESCO_CADA = 10         # cada tantas consultas, refresca también los pendientes

# Una sola copia abierta: la segunda (p.ej. doble clic en el escritorio con el programa ya
# en la bandeja) solo le avisa a la primera que se muestre, y se cierra.
_SUFIJO = "_simular" if SIMULAR else ""
MUTEX = "Local\\SyncsoraReportador" + _SUFIJO
EVENTO_MOSTRAR = "Local\\SyncsoraReportadorMostrar" + _SUFIJO


def _kernel32():
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    # HANDLE es de 64 bits: sin esto ctypes lo trunca a int de 32.
    for f in (k32.CreateMutexW, k32.CreateEventW, k32.OpenEventW):
        f.restype = ctypes.c_void_p
    k32.SetEvent.argtypes = k32.CloseHandle.argtypes = [ctypes.c_void_p]
    k32.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    return k32


def ya_abierto():
    if os.name != "nt":
        return False
    k32 = _kernel32()
    k32.CreateMutexW(None, False, MUTEX)
    if ctypes.get_last_error() != 183:  # ERROR_ALREADY_EXISTS
        return False
    ev = k32.OpenEventW(0x0002, False, EVENTO_MOSTRAR)  # EVENT_MODIFY_STATE
    if ev:
        k32.SetEvent(ev)
        k32.CloseHandle(ev)
    return True


def imagen_icono(trabajando=False):
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((2, 2, 62, 62), radius=14, fill=(29, 78, 216) if trabajando else (23, 23, 23))
    # Sobre de mensaje
    d.rectangle((14, 20, 50, 44), outline="white", width=4)
    d.line((14, 20, 32, 34, 50, 20), fill="white", width=4)
    return img


COLOR = {"ok": "#15803d", "error": "#b91c1c", "warn": "#b45309", "info": "#404040"}
ESTADO_TXT = {"ENVIADO": "✓ enviado", "SIN_CHAT": "– sin chat", "RECHAZADO": "✗ rechazado por ML", "ERROR": "✗ error"}


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Reportador de guías" + ("  [SIMULACIÓN]" if SIMULAR else ""))
        self.geometry("860x620")
        self.minsize(720, 520)
        self.eventos = queue.Queue()
        self.detener = threading.Event()
        self.hilo = None
        self.cfg = srv.leer_config()
        self.srv = None
        self.config_srv = None
        self.contenido = None
        self.consultando = False
        self.consultas = 0
        self.orden_actual = None
        self.icono = None
        self.aviso_bandeja = False
        self.protocol("WM_DELETE_WINDOW", self.esconder)
        self.after(150, self.procesar_eventos)
        self.mostrar()
        self.iniciar_bandeja()
        self.escuchar_mostrar()
        if BANDEJA and self.icono:
            self.withdraw()
        self.after(5000, self.consultar_orden)
        if not SIMULAR and Motor.detectar_chrome_major() is None:
            self.after(300, lambda: messagebox.showwarning("Falta Google Chrome", (
                "Este programa usa Google Chrome para escribir en MercadoLibre y no se encontró en el equipo.\n\n"
                "Instálalo desde https://www.google.com/chrome/ y vuelve a abrir el Reportador.")))

    # ── pantallas ───────────────────────────────────────────────────────────
    def mostrar(self):
        if self.contenido:
            self.contenido.destroy()
        self.contenido = ttk.Frame(self, padding=16)
        self.contenido.pack(fill="both", expand=True)
        if self.cfg.get("token"):
            self.srv = srv.Servidor(self.cfg.get("servidor", srv.SERVIDOR_DEFAULT), self.cfg["token"])
            self.pantalla_principal()
        else:
            self.srv = None  # sin vincular: no consulta órdenes
            self.pantalla_vincular()

    def pantalla_vincular(self):
        f = self.contenido
        ttk.Label(f, text="Vincular este equipo", font=("Segoe UI", 14, "bold")).pack(anchor="w")
        ttk.Label(f, wraplength=640, justify="left", text=(
            "1. En el sistema entra a Despachos → Reportador → \"+ Vincular equipo\".\n"
            "2. Escribe aquí el código que aparece (por ejemplo ABC-123). Vence en 15 minutos.")).pack(anchor="w", pady=(6, 14))

        fila = ttk.Frame(f); fila.pack(anchor="w", pady=4)
        ttk.Label(fila, text="Código:", width=10).pack(side="left")
        codigo = ttk.Entry(fila, width=14, font=("Consolas", 14)); codigo.pack(side="left")
        codigo.focus_set()

        fila2 = ttk.Frame(f); fila2.pack(anchor="w", pady=4)
        ttk.Label(fila2, text="Sistema:", width=10).pack(side="left")
        url = ttk.Entry(fila2, width=44); url.pack(side="left")
        url.insert(0, self.cfg.get("servidor", srv.SERVIDOR_DEFAULT))

        estado = ttk.Label(f, foreground=COLOR["error"], wraplength=640); estado.pack(anchor="w", pady=8)

        def vincular():
            s = srv.Servidor(url.get().strip() or srv.SERVIDOR_DEFAULT)
            try:
                s.vincular(codigo.get())
            except srv.ErrorServidor as e:
                estado.config(text=str(e)); return
            self.cfg.update({"servidor": s.url, "token": s.token})
            srv.guardar_config(self.cfg)
            self.mostrar()

        ttk.Button(f, text="Vincular", command=vincular).pack(anchor="w", pady=6)
        codigo.bind("<Return>", lambda _e: vincular())

    def pantalla_principal(self):
        f = self.contenido
        cab = ttk.Frame(f); cab.pack(fill="x")
        ttk.Label(cab, text="Reportador de guías", font=("Segoe UI", 14, "bold")).pack(side="left")
        self.lbl_conexion = ttk.Label(cab, text="Conectando…", foreground=COLOR["info"])
        self.lbl_conexion.pack(side="right")

        self.frame_cuentas = ttk.LabelFrame(f, text="Cuentas de MercadoLibre", padding=10)
        self.frame_cuentas.pack(fill="x", pady=(12, 8))

        botones = ttk.Frame(f); botones.pack(fill="x", pady=4)
        self.btn_reportar = ttk.Button(botones, text="▶  Reportar ahora", command=self.reportar)
        self.btn_reportar.pack(side="left")
        self.btn_detener = ttk.Button(botones, text="■  Detener", command=self.pedir_detener, state="disabled")
        self.btn_detener.pack(side="left", padx=8)
        ttk.Button(botones, text="↻  Actualizar", command=self.actualizar).pack(side="left")
        self.lbl_resumen = ttk.Label(botones, text="")
        self.lbl_resumen.pack(side="right")

        ttk.Label(f, foreground=COLOR["warn"], text=(
            "Mientras reporta, no uses el teclado ni el mouse en la ventana de Chrome que se abre.")).pack(anchor="w", pady=(6, 2))

        caja = ttk.Frame(f); caja.pack(fill="both", expand=True, pady=4)
        self.txt = tk.Text(caja, height=16, wrap="word", font=("Consolas", 9), state="disabled", relief="solid", borderwidth=1)
        barra = ttk.Scrollbar(caja, command=self.txt.yview)
        self.txt.configure(yscrollcommand=barra.set)
        self.txt.pack(side="left", fill="both", expand=True); barra.pack(side="right", fill="y")
        for k, c in COLOR.items():
            self.txt.tag_configure(k, foreground=c)

        pie = ttk.Frame(f); pie.pack(fill="x", pady=(6, 0))
        ttk.Button(pie, text="Abrir carpeta de registros", command=lambda: self.abrir(srv.BASE)).pack(side="left")
        ttk.Button(pie, text="Desvincular este equipo", command=self.desvincular).pack(side="right")
        self.actualizar()

    # ── bandeja ─────────────────────────────────────────────────────────────
    def iniciar_bandeja(self):
        if pystray is None:
            self.protocol("WM_DELETE_WINDOW", self.cerrar)
            return
        ev = lambda nombre: (lambda *_: self.eventos.put((nombre, None)))
        menu = pystray.Menu(
            pystray.MenuItem("Abrir", ev("mostrar"), default=True),
            pystray.MenuItem("Reportar ahora", ev("reportar")),
            pystray.MenuItem("Salir", ev("salir")),
        )
        self.icono = pystray.Icon("SyncsoraReportador", imagen_icono(), "Reportador de guías — en espera", menu)
        self.icono.run_detached()

    def estado_bandeja(self, texto, trabajando=False):
        if not self.icono:
            return
        try:
            self.icono.title = ("Reportador de guías — " + texto)[:120]
            self.icono.icon = imagen_icono(trabajando)
        except Exception:
            pass

    def notificar(self, texto):
        if self.icono and not self.winfo_viewable():
            try:
                self.icono.notify(texto, "Reportador de guías")
            except Exception:
                pass

    def escuchar_mostrar(self):
        """Otra copia del programa pidió mostrarse: se muestra esta."""
        if os.name != "nt":
            return
        k32 = _kernel32()
        ev = k32.CreateEventW(None, False, False, EVENTO_MOSTRAR)

        def esperar():
            while True:
                if k32.WaitForSingleObject(ev, 0xFFFFFFFF) == 0:
                    self.eventos.put(("mostrar", None))
        threading.Thread(target=esperar, daemon=True).start()

    def mostrar_ventana(self):
        self.deiconify()
        self.lift()
        self.focus_force()

    def esconder(self):
        if not self.icono:
            return self.cerrar()
        self.withdraw()
        if not self.aviso_bandeja:
            self.aviso_bandeja = True
            try:
                self.icono.notify("Sigue funcionando junto al reloj, esperando órdenes del sistema. "
                                  "Para cerrarlo del todo: clic derecho en el ícono → Salir.", "Reportador de guías")
            except Exception:
                pass

    # ── órdenes desde el sistema ────────────────────────────────────────────
    def consultar_orden(self):
        """En espera, pregunta cada CONSULTA_SEG si desde Despachos pidieron reportar."""
        self.after(CONSULTA_SEG * 1000, self.consultar_orden)
        if not self.srv or self.hilo or self.consultando:
            return
        self.consultando = True
        self.consultas += 1
        refrescar = self.consultas % REFRESCO_CADA == 0

        def trabajo():
            try:
                orden = self.srv.orden_pendiente()
                self.eventos.put(("orden", orden))
                if refrescar or orden:
                    self.eventos.put(("conectado", (self.srv.config(), self.srv.estado())))
            except srv.ErrorServidor as e:
                self.eventos.put(("sin_conexion", str(e)))
            finally:
                self.consultando = False
        threading.Thread(target=trabajo, daemon=True).start()

    def atender_orden(self, orden):
        if self.hilo:  # carrera rara: ya se estaba reportando; se da por cubierta
            threading.Thread(target=self.srv.terminar_orden, args=(orden["id"], {}), daemon=True).start()
            return
        quien = f" por {orden['pedida_por']}" if orden.get("pedida_por") else ""
        origen = "al cerrar la jornada" if orden.get("origen") == "AUTO" else "desde el sistema"
        self.escribir("info", f"Orden recibida {origen}{quien}.")
        self.notificar(f"Empezó a reportar ({origen}{quien}).")
        self.reportar(orden_id=orden["id"])

    # ── acciones ────────────────────────────────────────────────────────────
    def actualizar(self):
        def trabajo():
            try:
                self.eventos.put(("conectado", (self.srv.config(), self.srv.estado())))
            except srv.ErrorServidor as e:
                self.eventos.put(("sin_conexion", str(e)))
        threading.Thread(target=trabajo, daemon=True).start()

    def pintar_cuentas(self, config, estado):
        self.config_srv = config
        for w in self.frame_cuentas.winfo_children():
            w.destroy()
        pend = estado.get("pendientes", {})
        for i, c in enumerate(config.get("cuentas", [])):
            nombre = c["nombre"]
            ttk.Label(self.frame_cuentas, text=nombre, font=("Segoe UI", 10, "bold"), width=18).grid(row=i, column=0, sticky="w")
            n = pend.get(nombre, 0)
            ttk.Label(self.frame_cuentas, text=f"{n} pendiente(s)", width=16,
                      foreground=COLOR["ok"] if n == 0 else COLOR["info"]).grid(row=i, column=1, sticky="w")
            ttk.Button(self.frame_cuentas, text="Iniciar sesión en ML",
                       command=lambda n=nombre: self.iniciar_sesion(n)).grid(row=i, column=2, padx=4, pady=2)
            ttk.Button(self.frame_cuentas, text="Usar perfil existente…",
                       command=lambda n=nombre: self.elegir_perfil(n)).grid(row=i, column=3, padx=4)
            ttk.Label(self.frame_cuentas, text=srv.perfil_de(self.cfg, nombre), foreground="#737373",
                      font=("Segoe UI", 8)).grid(row=i, column=4, sticky="w", padx=4)
        total = sum(pend.values())
        extras = []
        if estado.get("sin_cuenta"):
            extras.append(f"{estado['sin_cuenta']} sin cuenta asignada (revisa las cuentas en el sistema)")
        if config.get("problemas"):
            extras.append("config con problemas: " + " · ".join(config["problemas"]))
        self.lbl_resumen.config(text=f"Total pendientes: {total}" + (f"   ⚠ {' · '.join(extras)}" if extras else ""),
                                foreground=COLOR["warn"] if extras else COLOR["info"])
        if not self.hilo:
            self.btn_reportar.config(state="normal" if total and not config.get("problemas") else "disabled")

    def reportar(self, orden_id=None):
        if self.hilo or not self.srv:
            return
        if SIMULAR and not es_local(self.srv.url):
            if orden_id is not None:
                self.srv.terminar_orden(orden_id, {})
            messagebox.showerror("Simulación", "La simulación solo funciona contra un servidor local."); return
        self.detener.clear()
        self.btn_reportar.config(state="disabled"); self.btn_detener.config(state="normal")
        self.escribir("info", "─" * 60)
        self.estado_bandeja("reportando…", trabajando=True)
        corrida = Corrida(self.srv, self.cfg, lambda ev, d: self.eventos.put((ev, d)), self.detener,
                          simular=SIMULAR, orden_id=orden_id)
        self.hilo = threading.Thread(target=corrida.ejecutar, daemon=True)
        self.hilo.start()

    def pedir_detener(self):
        self.detener.set()
        self.btn_detener.config(state="disabled")
        self.escribir("warn", "Deteniendo después del mensaje en curso…")

    def iniciar_sesion(self, cuenta):
        if self.hilo:
            messagebox.showinfo("Reportador", "Espera a que termine el reporte."); return
        perfil = srv.perfil_de(self.cfg, cuenta)
        os.makedirs(perfil, exist_ok=True)
        motor = Motor(lambda n, t: self.eventos.put(("log", (n, t))), self.detener, srv.DIAGNOSTICO)
        try:
            driver = motor.crear_driver(perfil)
            driver.get(URL_ML)
        except Exception as e:
            messagebox.showerror("Chrome", f"No se pudo abrir Chrome: {e}"); return
        messagebox.showinfo("Iniciar sesión — " + cuenta, (
            f"Se abrió Chrome para la cuenta {cuenta}.\n\n"
            "Inicia sesión en MercadoLibre con ESA cuenta y marca que recuerde el equipo.\n\n"
            "Cuando termines, toca Aceptar (Chrome se cierra y la sesión queda guardada)."))
        try:
            driver.quit()
        except Exception:
            pass
        self.escribir("ok", f"[{cuenta}] Sesión guardada en {perfil}")

    def elegir_perfil(self, cuenta):
        carpeta = filedialog.askdirectory(title=f"Carpeta del perfil de Chrome para {cuenta} (p.ej. C:/selenium_profile_...)")
        if not carpeta:
            return
        self.cfg.setdefault("perfiles", {})[cuenta] = carpeta
        srv.guardar_config(self.cfg)
        self.actualizar()

    def desvincular(self):
        if self.hilo:
            return
        if messagebox.askyesno("Desvincular", "¿Olvidar la vinculación de este equipo? Tendrás que vincularlo de nuevo con un código."):
            self.cfg.pop("token", None)
            srv.guardar_config(self.cfg)
            self.mostrar()

    @staticmethod
    def abrir(carpeta):
        os.makedirs(carpeta, exist_ok=True)
        os.startfile(carpeta)

    def cerrar(self):
        """Salir de verdad (menú de la bandeja). Deja de recibir órdenes del sistema."""
        if self.hilo:
            self.mostrar_ventana()
            if not messagebox.askyesno("Salir", "Está reportando. ¿Detener y salir? Lo que falte queda pendiente."):
                return
            self.detener.set()
            self.after(500, self.esperar_y_salir)
            return
        self.salir()

    def esperar_y_salir(self):
        if self.hilo and self.hilo.is_alive():
            self.after(500, self.esperar_y_salir)
        else:
            self.salir()

    def salir(self):
        if self.icono:
            try:
                self.icono.stop()
            except Exception:
                pass
        self.destroy()

    # ── eventos del hilo ────────────────────────────────────────────────────
    def escribir(self, nivel, texto):
        if not hasattr(self, "txt"):
            return
        self.txt.configure(state="normal")
        self.txt.insert("end", texto + "\n", nivel)
        self.txt.see("end")
        self.txt.configure(state="disabled")

    def procesar_eventos(self):
        try:
            while True:
                ev, d = self.eventos.get_nowait()
                if ev == "log":
                    self.escribir(*d)
                elif ev == "envio":
                    pass  # ya va al log con su color
                elif ev == "actividad":
                    self.estado_bandeja("reportando " + d, trabajando=True)
                elif ev == "orden":
                    if d:
                        self.atender_orden(d)
                elif ev == "mostrar":
                    self.mostrar_ventana()
                elif ev == "reportar":
                    self.reportar()
                elif ev == "salir":
                    self.cerrar()
                elif ev == "conectado":
                    config, estado = d
                    equipo = config.get("equipo") or "este equipo"
                    if self.srv and hasattr(self, "lbl_conexion") and self.lbl_conexion.winfo_exists():
                        self.lbl_conexion.config(text=f"✓ Conectado ({equipo}) · esperando órdenes del sistema",
                                                 foreground=COLOR["ok"])
                        self.pintar_cuentas(config, estado)
                elif ev == "sin_conexion":
                    if self.srv and hasattr(self, "lbl_conexion") and self.lbl_conexion.winfo_exists():
                        self.lbl_conexion.config(text=f"✗ {d}", foreground=COLOR["error"])
                    if "desvinculado" in d.lower() or "no vinculado" in d.lower():
                        self.cfg.pop("token", None); srv.guardar_config(self.cfg); self.mostrar()
                elif ev == "resumen":
                    self.hilo = None
                    self.btn_detener.config(state="disabled")
                    self.estado_bandeja("en espera")
                    self.notificar(f"Terminó: {d['ENVIADO']} enviado(s), {d['ERROR'] + d['RECHAZADO']} con problema.")
                    self.escribir("ok" if not d["ERROR"] and not d["RECHAZADO"] else "warn",
                                  f"Terminado: {d['ENVIADO']} enviado(s) · {d['SIN_CHAT']} sin chat · "
                                  f"{d['RECHAZADO']} rechazado(s) · {d['ERROR']} con error")
                    self.actualizar()
        except queue.Empty:
            pass
        self.after(150, self.procesar_eventos)


if __name__ == "__main__":
    if not ya_abierto():
        App().mainloop()
