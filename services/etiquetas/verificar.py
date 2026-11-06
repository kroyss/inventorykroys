"""
Verificación de códigos: cada código de barras / Data Matrix de la etiqueta
ORIGINAL tiene que leerse igual en su página del PDF armado.

Se simula la impresión a 300 dpi (impresora A4 láser/tinta). Validado en la
Fase 0 sobre 1022 etiquetas reales: 3 códigos por etiqueta, 1022/1022 legibles.

06-11-2026: a 300 dpi el lector a veces "ve" en la ORIGINAL un código fantasma
(una lectura equivocada del mismo Code 128: 1720596385AAABAAABC]E en vez de
1720756385AAABAAABCZE) que no existe y por eso no aparece en el armado, y el lote
se bloqueaba. Ahora se exige solo lo que se lee a 300 dpi Y también a 200 o
400 dpi: los códigos reales se leen en todas, el fantasma en una sola. El armado
se sigue verificando a 300 dpi, igual que antes.
"""
import fitz
import numpy as np
import zxingcpp

DPI = 300
DPI_CONFIRMAR = (200, 400)


def _codigos(page, dpi=DPI):
    pix = page.get_pixmap(dpi=dpi)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
    return {(str(b.format), b.text) for b in zxingcpp.read_barcodes(img)}


def _esperados(page):
    """Códigos de la original leídos a 300 dpi y confirmados a otra resolución."""
    pendientes = _codigos(page)
    confirmados = set()
    for dpi in DPI_CONFIRMAR:
        if not pendientes:
            break
        otra = _codigos(page, dpi)
        confirmados |= pendientes & otra
        pendientes -= otra
    return confirmados


def verificar(etiquetas, pdf_armado):
    """etiquetas: [pdf_bytes] en el orden de armado (4 por página).
    Devuelve [{indice, esperados, faltan}] con una entrada por etiqueta."""
    resultado = []
    with fitz.open(stream=pdf_armado, filetype="pdf") as out:
        leidos_por_pagina = {}
        for i, data in enumerate(etiquetas):
            with fitz.open(stream=data, filetype="pdf") as src:
                esperados = _esperados(src[0])
            pag = i // 4
            if pag not in leidos_por_pagina:
                leidos_por_pagina[pag] = _codigos(out[pag])
            faltan = sorted(t for _, t in esperados - leidos_por_pagina[pag])
            resultado.append({
                "indice": i,
                "esperados": len(esperados),
                "faltan": faltan,
            })
    return resultado
