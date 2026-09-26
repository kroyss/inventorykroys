"""
Conexión con el sistema (inventario) y datos locales del equipo.

Datos locales en %APPDATA%\\SyncsoraReportador\\:
  config.json          servidor, token del equipo, perfiles de Chrome por cuenta
  resultados_pendientes.json
                       resultados que no se pudieron informar (sin internet). Se informan
                       ANTES de volver a tomar la cola: si no, esos envíos volverían como
                       pendientes y el comprador recibiría el mensaje dos veces.
  historial\\AAAA\\MM\\  log de cada corrida
  diagnostico\\        capturas cuando algo falla sin explicación
"""
import json
import os
import re
import socket
import threading

import requests

VERSION = "1.0.0"
SERVIDOR_DEFAULT = "https://inventory.syncsora.com"

BASE = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "SyncsoraReportador")
CONFIG = os.path.join(BASE, "config.json")
PENDIENTES = os.path.join(BASE, "resultados_pendientes.json")
PERFILES = os.path.join(os.environ.get("LOCALAPPDATA") or BASE, "SyncsoraReportador", "perfiles")
DIAGNOSTICO = os.path.join(BASE, "diagnostico")
HISTORIAL = os.path.join(BASE, "historial")

_lock = threading.Lock()


class ErrorServidor(Exception):
    pass


# ── Config local ────────────────────────────────────────────────────────────
def leer_config():
    try:
        with open(CONFIG, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def guardar_config(cfg):
    os.makedirs(BASE, exist_ok=True)
    tmp = CONFIG + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    os.replace(tmp, CONFIG)


def perfil_de(cfg, cuenta):
    """Carpeta del perfil de Chrome de una cuenta (guarda la sesión de ML).
    Se puede apuntar a un perfil existente (p.ej. C:/selenium_profile_marcos)."""
    propio = (cfg.get("perfiles") or {}).get(cuenta)
    if propio:
        return propio
    slug = re.sub(r"[^A-Za-z0-9_-]+", "_", cuenta).strip("_") or "cuenta"
    return os.path.join(PERFILES, slug)


# ── Resultados pendientes de informar ───────────────────────────────────────
def _leer_pendientes():
    try:
        with open(PENDIENTES, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _guardar_pendientes(items):
    os.makedirs(BASE, exist_ok=True)
    tmp = PENDIENTES + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False)
    os.replace(tmp, PENDIENTES)


def hay_pendientes():
    return len(_leer_pendientes()) > 0


# ── Cliente ─────────────────────────────────────────────────────────────────
class Servidor:
    def __init__(self, url, token=None):
        self.url = url.rstrip("/")
        self.token = token
        self.s = requests.Session()
        self.s.headers["X-Reportador-Version"] = VERSION

    def _req(self, metodo, ruta, **kw):
        headers = kw.pop("headers", {})
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        try:
            r = self.s.request(metodo, self.url + ruta, headers=headers, timeout=30, **kw)
        except requests.RequestException as e:
            raise ErrorServidor(f"No hay conexión con el sistema ({type(e).__name__})") from e
        try:
            data = r.json()
        except ValueError:
            data = {}
        if not r.ok:
            raise ErrorServidor(data.get("error") or f"El sistema respondió {r.status_code}")
        return data

    # Vinculación: canjea el código de Despachos por un token propio del equipo.
    def vincular(self, codigo):
        nombre = socket.gethostname()[:60]
        data = self._req("POST", "/api/reportador/vincular",
                         json={"codigo": codigo.strip(), "nombre": nombre, "version": VERSION})
        self.token = data["token"]
        return data

    def config(self):
        return self._req("GET", "/api/reportador/config")

    def estado(self):
        return self._req("GET", "/api/reportador/estado")

    def tomar(self, cuenta):
        return self._req("POST", "/api/reportador/tomar", json={"cuenta": cuenta})["envios"]

    def liberar(self):
        try:
            self._req("POST", "/api/reportador/liberar", json={})
        except ErrorServidor:
            pass  # la reserva vence sola

    def informar(self, etiqueta_id, estado, detalle=None):
        """Informa un resultado. Si no hay conexión lo guarda localmente (no se pierde)."""
        item = {"etiqueta_id": etiqueta_id, "estado": estado, "detalle": (detalle or "")[:500]}
        try:
            self._req("POST", "/api/reportador/resultado", json=item)
            return True
        except ErrorServidor:
            with _lock:
                items = _leer_pendientes()
                items.append(item)
                _guardar_pendientes(items)
            return False

    def informar_pendientes(self):
        """Informa lo guardado localmente. Devuelve cuántos quedan sin informar."""
        with _lock:
            items = _leer_pendientes()
            restantes = []
            for i, item in enumerate(items):
                try:
                    self._req("POST", "/api/reportador/resultado", json=item)
                except ErrorServidor:
                    restantes = items[i:]
                    break
            _guardar_pendientes(restantes)
            return len(restantes)
