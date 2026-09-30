"""
Etiquetas TEALCA (pre-guía generada por Mercado Envíos) para el módulo Despachos.

Diferencias con ZOOM:
  - el PDF NO trae el número de venta: se toma del NOMBRE del archivo
    (guide-2000018687469074.pdf, también "guide-2000018687469074 (1).pdf");
  - la guía es el "NRO. PRE-GRUIA" (6 dígitos, es el mismo que el código de barras);
  - la etiqueta es apaisada (734x524 pt) y trae títulos/líneas como ANOTACIONES, que
    show_pdf_page ignora: por eso se aplanan (bake) en una copia antes de pegar.

Armado (celda de la grilla 2x2 de despacho_core): la etiqueta va girada 90°, sin las
recomendaciones, el recuadro OBSERVACIONES, el RIF ni la web; "Valor declarado" + código
de barras se mueven junto a "Datos del Envío" y en la franja que queda libre (a la
derecha de la celda) van productos y nota a 11/10 pt, con línea de corte. Todo vectorial:
los códigos nunca se rasterizan; verificar.py los lee igual que con ZOOM.
"""
import re

import fitz  # PyMuPDF

# ===== Lectura =====
# Zonas de los datos en la etiqueta original (puntos, origen arriba-izquierda).
ZONA_PREGUIA = fitz.Rect(120, 48, 260, 80)
ZONA_REMITENTE = fitz.Rect(115, 128, 412, 152)
ZONA_DESTINATARIO = fitz.Rect(470, 128, 722, 152)

RE_VENTA = re.compile(r"(?<!\d)2000\d{9,}(?!\d)")


def es_tealca(page):
    text = page.get_text("text") or ""
    return "TEALCA" in text.upper() and "PRE-GRUIA" in text.upper()


def _texto_zona(page, rect):
    palabras = page.get_text("words", clip=rect)
    palabras.sort(key=lambda w: (round(w[1]), w[0]))
    return re.sub(r"\s+", " ", " ".join(w[4] for w in palabras)).strip() or None


def extract_preguia(page):
    t = _texto_zona(page, ZONA_PREGUIA)
    m = re.search(r"\d{4,}", t or "")
    return m.group() if m else None


def extract_venta(page, nombre):
    """Del contenido si alguna vez lo trae; si no, del nombre del archivo."""
    m = RE_VENTA.search(page.get_text("text") or "")
    if m:
        return m.group()
    m = RE_VENTA.search(nombre or "")
    return m.group() if m else None


def leer(page, paginas, nombre):
    return {
        "paginas": paginas,
        "carrier": "TEALCA",
        "venta": extract_venta(page, nombre),
        "guia": extract_preguia(page),
        "remitente": _texto_zona(page, ZONA_REMITENTE),
        "destinatario": _texto_zona(page, ZONA_DESTINATARIO),
    }


# ===== Armado =====
BLOQUE = fitz.Rect(10, 430, 228, 504)          # "Valor declarado" + código de barras
MOVER = (372 - 10, 342 - 430)                  # a la derecha de "Datos del Envío"
BLANCO = [
    fitz.Rect(368, 336, 722, 434),             # recomendaciones 1-5
    fitz.Rect(268, 434, 745, 530),             # OBSERVACIONES, RIF y web
    BLOQUE + (-2, -2, 2, 30),                  # dónde estaba el bloque movido
]
CLIP = fitz.Rect(0, 0, 724, 430)               # etiqueta ya sin la franja inferior

FS_PROD, FS_NOTA, FS_MIN = 11, 10, 9.5
PASO_PROD, PASO_NOTA = 13, 12
MAX_PRODUCT_LINES = 4
OVERFLOW_HINT = "(ver sistema)"
SCALE_CAP = 0.80


def _limpia(pdf_bytes):
    """Copia de una página con las anotaciones aplanadas y la zona de texto liberada."""
    src = fitz.open(stream=pdf_bytes, filetype="pdf")
    src.bake(annots=True, widgets=True)
    out = fitz.open()
    pg = out.new_page(width=src[0].rect.width, height=src[0].rect.height)
    pg.show_pdf_page(pg.rect, src, 0)
    for r in BLANCO:
        pg.draw_rect(r, color=None, fill=(1, 1, 1))
    nuevo = BLOQUE + (MOVER[0], MOVER[1], MOVER[0], MOVER[1])
    pg.show_pdf_page(nuevo, src, 0, clip=BLOQUE)   # vectorial, 1:1
    data = out.tobytes()
    out.close()
    src.close()
    return data


def _ajusta(texto, fs, largo):
    while fs > FS_MIN and fitz.get_text_length(texto, fontname="helv", fontsize=fs) > largo:
        fs -= 0.5
    return fs


def _parte(texto, fs, largo, max_lineas=2):
    lineas, cur = [], ""
    for p in texto.split():
        t = (cur + " " + p).strip()
        if fitz.get_text_length(t, fontname="helv", fontsize=fs) <= largo:
            cur = t
        else:
            lineas.append(cur)
            cur = p
    lineas.append(cur)
    if len(lineas) > max_lineas:
        lineas = lineas[:max_lineas]
        lineas[-1] = lineas[-1].rstrip(" .") + "..."
    return lineas


def celda(out_page, cell, pdf_bytes, lineas_producto, nota, fuentes):
    """Dibuja una etiqueta Tealca en la celda. `fuentes` recibe el documento intermedio
    (show_pdf_page lo referencia hasta guardar)."""
    largo = cell.height - 8
    lineas = list(lineas_producto)
    if len(lineas) > MAX_PRODUCT_LINES:
        ocultos = len(lineas) - (MAX_PRODUCT_LINES - 1)
        lineas = lineas[:MAX_PRODUCT_LINES - 1]
        lineas.append(f"... y {ocultos} producto(s) mas {OVERFLOW_HINT}")
    lineas_nota = _parte(nota, FS_NOTA, largo) if nota else []

    banda = 6 + PASO_PROD * len(lineas) + PASO_NOTA * len(lineas_nota)
    s = min(cell.height / CLIP.width, (cell.width - banda) / CLIP.height, SCALE_CAP)
    w, h = CLIP.height * s, CLIP.width * s         # girada 90°
    dest = fitz.Rect(cell.x0, cell.y0, cell.x0 + w, cell.y0 + h)

    src = fitz.open(stream=_limpia(pdf_bytes), filetype="pdf")
    fuentes.append(src)
    out_page.show_pdf_page(dest, src, 0, clip=CLIP, rotate=90)

    # Línea de corte: lo de la derecha se recorta antes de pegar la etiqueta en el paquete.
    out_page.draw_line((dest.x1 + 2, cell.y0), (dest.x1 + 2, cell.y1),
                       color=(0.5, 0.5, 0.5), width=0.5, dashes="[3 3] 0")

    # Texto girado igual que la etiqueta (se lee de abajo hacia arriba).
    x, y0 = dest.x1 + 6, dest.y1 - 2
    for l in lineas:
        f = _ajusta(l, FS_PROD, largo)
        out_page.insert_text((x + 9, y0), l, fontsize=f, fontname="helv", rotate=90)
        x += PASO_PROD
    for l in lineas_nota:
        out_page.insert_text((x + 9, y0), l, fontsize=FS_NOTA, fontname="helv", rotate=90)
        x += PASO_NOTA
