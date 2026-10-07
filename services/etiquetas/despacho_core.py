"""
Núcleo de etiquetas para el módulo Despachos.

Las funciones de armado están COPIADAS TAL CUAL de
D:\\Script Etiquetas Venezuela\\etiquetas_ml.py (versión 17/09/2026): mismas
constantes, misma grilla, mismo pegado vectorial. No modificar el armado sin
repetir la comparación de la Fase 0 (pixel a pixel + lectura de códigos).

Diferencias con el script, solo de "fontanería":
  - recibe los PDFs como bytes y los datos de venta como dict (vienen de la base,
    no de datos.xlsx) y devuelve el PDF como bytes, sin tocar disco;
  - abre las etiquetas desde memoria, así no hay límite de archivos abiertos
    (el script falla pasadas ~500 etiquetas por "Too many open files").
"""
import re
import unicodedata

import fitz  # PyMuPDF

import tealca

# ===== Constantes: idénticas a etiquetas_ml.py =====
OUTPUT_PAPER = "a4"
PAGE_MARGIN_PT = 18
CELL_GAP_PT = 12
SCALE_CAP = 0.80
TEXT_FONT = "helv"
TEXT_SIZE = 9
TEXT_MARGIN_LEFT_PT = 10
TEXT_MARGIN_BOTTOM_PT = 55
TEXT_MAX_CHARS = 70  # antes 55; lo que no cabe en el ancho lo resuelve ajustar_lineas
NOTE_LINE_OFFSET_PT = 12
NOTE_TEXT_SIZE_DELTA = 1
PRODUCT_LINE_STEP_PT = 11
MAX_PRODUCT_LINES = 4
# Texto del producto/nota en ZOOM: si no cabe en el ancho de la etiqueta, se achica hasta
# TEXT_SIZE_MIN y, si aun no cabe, se corta con "...". Solo texto: no toca los códigos.
TEXT_SIZE_MIN = 6.5
# Solo aparece con más de 4 productos en una venta (máx. real observado: 4). Texto,
# no toca los códigos.
OVERFLOW_HINT = "(ver sistema)"


# ===== Copiadas de etiquetas_ml.py =====
def compute_grid(page_rect, margin=PAGE_MARGIN_PT, gap=CELL_GAP_PT):
    """4 celdas (2x2) dentro de la página final."""
    usable = fitz.Rect(page_rect.x0 + margin, page_rect.y0 + margin,
                       page_rect.x1 - margin, page_rect.y1 - margin)
    cell_w = (usable.width - gap) / 2.0
    cell_h = (usable.height - gap) / 2.0

    r1 = fitz.Rect(usable.x0,                usable.y0,
                   usable.x0 + cell_w,       usable.y0 + cell_h)
    r2 = fitz.Rect(usable.x0 + cell_w + gap, usable.y0,
                   usable.x1,                usable.y0 + cell_h)
    r3 = fitz.Rect(usable.x0,                usable.y0 + cell_h + gap,
                   usable.x0 + cell_w,       usable.y1)
    r4 = fitz.Rect(usable.x0 + cell_w + gap, usable.y0 + cell_h + gap,
                   usable.x1,                usable.y1)
    return [r1, r2, r3, r4]


def place_rect(src_w, src_h, cell_rect, cap=SCALE_CAP):
    """Ajusta manteniendo aspecto. Nunca supera cap (0.80)."""
    max_scale = min(cell_rect.width / src_w, cell_rect.height / src_h)
    scale = min(max_scale, cap)

    w = src_w * scale
    h = src_h * scale
    x0 = cell_rect.x0 + (cell_rect.width - w) / 2.0
    y0 = cell_rect.y0 + (cell_rect.height - h) / 2.0
    return fitz.Rect(x0, y0, x0 + w, y0 + h)


def find_label_border_rect(page):
    """Encuentra el rectángulo del borde de la etiqueta (recuadro)."""
    drawings = page.get_drawings()
    candidates = []
    for d in drawings:
        if d.get("type") == "s":
            r = d.get("rect")
            if r:
                candidates.append(r)

    if candidates:
        return max(candidates, key=lambda r: r.get_area())
    return page.rect  # fallback


def extract_sale_number(page):
    text = page.get_text("text") or ""
    m = re.search(r"\b2000\d{9,}\b", text)
    return m.group() if m else None


def extract_guia(page):
    text = page.get_text("text") or ""
    m = re.search(r"ZOOM\s+(\d{8,})", text)
    return m.group(1) if m else None


def extract_destinatario(page):
    text = page.get_text("text") or ""
    m = re.search(r"Destinatario:\s*(.+)", text)
    if not m:
        return None
    full = m.group(1).strip()
    name = full.split("-")[0].strip()
    return re.sub(r"\s+", " ", name)


def extract_remitente(page):
    text = page.get_text("text") or ""
    m = re.search(r"Remitente:\s*(.+)", text)
    if not m:
        return None
    full = m.group(1).strip()
    name = full.split("-")[0].strip()
    return re.sub(r"\s+", " ", name)


def clean_text(text):
    """Texto que va al manifiesto/CSV: sin acentos ni caracteres raros (copiada)."""
    if text is None:
        return ""
    text = str(text)
    text = unicodedata.normalize('NFKD', text)
    text = text.encode('ascii', 'ignore').decode('ascii')
    text = re.sub(r"[^A-Za-z0-9\s\.\-_/]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def clip_text(s, max_chars=TEXT_MAX_CHARS):
    s = re.sub(r"\s+", " ", str(s)).strip()
    if len(s) <= max_chars:
        return s
    return s[:max_chars - 3].rstrip() + "..."  # "…" no existe en la fuente helv (salía "·")


def ajustar_lineas(lineas, ancho, fs=TEXT_SIZE, fs_min=TEXT_SIZE_MIN):
    """Mismo tamaño para todas las líneas: el mayor que hace caber la más larga (mínimo
    fs_min); la que aun así no cabe se corta con "...". Devuelve (lineas, tamaño)."""
    largo = lambda t, f: fitz.get_text_length(t, fontname=TEXT_FONT, fontsize=f)
    while fs > fs_min and any(largo(l, fs) > ancho for l in lineas):
        fs -= 0.5
    salida = []
    for l in lineas:
        if largo(l, fs) > ancho:
            while len(l) > 1 and largo(l.rstrip(" .…") + "...", fs) > ancho:
                l = l[:-1]
            l = l.rstrip(" .…") + "..."
        salida.append(l)
    return salida, fs


# ===== API del servicio =====
def leer_etiqueta(pdf_bytes, nombre=None):
    """Datos de una etiqueta (primera página, como el script). `nombre` es el del archivo:
    las etiquetas Tealca no traen el número de venta, solo el nombre."""
    with fitz.open(stream=pdf_bytes, filetype="pdf") as src:
        sp = src[0]
        if tealca.es_tealca(sp):
            return tealca.leer(sp, src.page_count, nombre)
        return {
            "carrier": "ZOOM",
            "paginas": src.page_count,
            "venta": extract_sale_number(sp),
            "guia": extract_guia(sp),
            "remitente": extract_remitente(sp),
            "destinatario": extract_destinatario(sp),
        }


def armar_sales_map(filas):
    """filas: [{venta, producto, cantidad, nota}] — una por producto, como el Excel.
    Devuelve { venta: (lineas_producto, nota) }, igual que load_sales_map()."""
    sales_map = {}
    for f in filas:
        venta = str(f["venta"]).strip()
        lineas, nota_previa = sales_map.get(venta, ([], ""))
        lineas.append(f"{str(f['cantidad']).strip()} - {clip_text(f['producto'])}")
        nota = (f.get("nota") or "").strip()
        sales_map[venta] = (lineas, nota_previa or nota)
    return sales_map


def armar_pdf(etiquetas, sales_map, ventas=None):
    """etiquetas: [pdf_bytes] en el orden de impresión. Devuelve el PDF 4xA4 en bytes.
    Cuerpo del Paso 2/3 de etiquetas_ml.py main(), sin cambios en el armado ZOOM.
    Las etiquetas Tealca (ver tealca.py) ocupan su celda con otro dibujo; como no traen
    número de venta, `ventas` (una por etiqueta, en el mismo orden) lo da."""
    ventas = ventas or []
    out = fitz.open()
    out_rect = fitz.paper_rect(OUTPUT_PAPER)
    grid = compute_grid(out_rect)
    fuentes = []  # se cierran después de guardar: show_pdf_page las referencia
    hay_tealca = False

    i = 0
    while i < len(etiquetas):
        out_page = out.new_page(width=out_rect.width, height=out_rect.height)

        for cell_idx in range(4):
            if i >= len(etiquetas):
                break
            src = fitz.open(stream=etiquetas[i], filetype="pdf")
            fuentes.append(src)
            i += 1
            sp = src[0]

            if tealca.es_tealca(sp):
                hay_tealca = True
                lineas_producto, linea_nota = sales_map[ventas[i - 1]]
                tealca.celda(out_page, grid[cell_idx], etiquetas[i - 1],
                             lineas_producto, linea_nota, fuentes)
                continue

            clip = find_label_border_rect(sp)
            dest = place_rect(clip.width, clip.height, grid[cell_idx])

            # Pegar vectorial (NO rasteriza)
            out_page.show_pdf_page(dest, src, 0, clip=clip)

            venta = extract_sale_number(sp)
            lineas_producto, linea_nota = sales_map[venta]

            x = dest.x0 + TEXT_MARGIN_LEFT_PT
            y = dest.y1 - TEXT_MARGIN_BOTTOM_PT
            ancho = dest.width - 2 * TEXT_MARGIN_LEFT_PT

            lineas = list(lineas_producto)
            if len(lineas) > MAX_PRODUCT_LINES:
                ocultos = len(lineas) - (MAX_PRODUCT_LINES - 1)
                lineas = lineas[:MAX_PRODUCT_LINES - 1]
                lineas.append(f"... y {ocultos} producto(s) mas {OVERFLOW_HINT}")
            lineas, fs = ajustar_lineas(lineas, ancho)

            for k, linea in enumerate(lineas):
                out_page.insert_text(
                    (x, y + k * PRODUCT_LINE_STEP_PT),
                    linea,
                    fontsize=fs,
                    fontname=TEXT_FONT,
                )

            if linea_nota:
                y_nota = y + (len(lineas) - 1) * PRODUCT_LINE_STEP_PT + NOTE_LINE_OFFSET_PT
                [nota_aj], fs_nota = ajustar_lineas([linea_nota], ancho, TEXT_SIZE - NOTE_TEXT_SIZE_DELTA)
                out_page.insert_text(
                    (x, y_nota),
                    nota_aj,
                    fontsize=max(4, fs_nota),
                    fontname=TEXT_FONT,
                )

    # El logo de Tealca pesa ~800 KB y se repetiría en cada etiqueta: garbage=4 junta los
    # duplicados (sin pérdida). Con solo ZOOM se guarda como siempre.
    data = out.tobytes(garbage=4, deflate=True) if hay_tealca else out.tobytes()
    out.close()
    for s in fuentes:
        s.close()
    return data
