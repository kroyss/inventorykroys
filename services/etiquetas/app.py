"""
Servicio de etiquetas del módulo Despachos (uso interno: solo lo llama
inventory_next dentro de la red de Docker; no publica puertos).

  POST /leer        PDFs de Mercado Envíos -> venta, guía, remitente, destinatario
  POST /armar       PDFs + productos/nota por venta -> PDF 4xA4 + verificación de códigos
  POST /manifiesto  envíos de la jornada -> PDF del manifiesto
  GET  /salud
"""
import base64

import fitz
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from despacho_core import armar_pdf, armar_sales_map, clean_text, leer_etiqueta
from manifiesto import armar_manifiesto
from verificar import verificar

app = FastAPI(title="Etiquetas Despachos")


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _bytes(b64: str) -> bytes:
    return base64.b64decode(b64)


class LeerIn(BaseModel):
    pdfs: list[str]  # base64


@app.post("/leer")
def leer(body: LeerIn):
    out = []
    for b64 in body.pdfs:
        try:
            d = leer_etiqueta(_bytes(b64))
            d["remitente_limpio"] = clean_text(d["remitente"])
            d["destinatario_limpio"] = clean_text(d["destinatario"])
            d["error"] = None
        except Exception as e:  # PDF corrupto / no es PDF
            d = {"error": f"No se pudo abrir el PDF: {e}"}
        out.append(d)
    return {"etiquetas": out}


class Fila(BaseModel):
    venta: str
    producto: str
    cantidad: int
    nota: str = ""


class ArmarIn(BaseModel):
    pdfs: list[str]  # base64, en orden de impresión
    filas: list[Fila]


@app.post("/armar")
def armar(body: ArmarIn):
    etiquetas = [_bytes(b) for b in body.pdfs]
    sales_map = armar_sales_map([f.model_dump() for f in body.filas])
    try:
        pdf = armar_pdf(etiquetas, sales_map)
    except KeyError as e:
        raise HTTPException(400, f"Venta sin productos: {e}")
    with fitz.open(stream=pdf, filetype="pdf") as d:
        paginas = d.page_count
    return {
        "pdf": _b64(pdf),
        "paginas": paginas,
        "verificacion": verificar(etiquetas, pdf),
    }


class EnvioManifiesto(BaseModel):
    fecha: str
    remitente: str
    venta: str
    guia: str
    destinatario: str


class ManifiestoIn(BaseModel):
    remitente: str
    fecha_hoy: str
    envios: list[EnvioManifiesto]


@app.post("/manifiesto")
def manifiesto(body: ManifiestoIn):
    if not body.envios:
        raise HTTPException(400, "Sin envíos")
    pdf = armar_manifiesto([e.model_dump() for e in body.envios], body.remitente, body.fecha_hoy)
    return {"pdf": _b64(pdf)}


@app.get("/salud")
def salud():
    return {"ok": True, "pymupdf": fitz.VersionBind}
