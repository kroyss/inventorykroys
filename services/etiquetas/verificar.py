"""
Verificación de códigos: cada código de barras / Data Matrix de la etiqueta
ORIGINAL tiene que leerse igual en su página del PDF armado.

Se simula la impresión a 300 dpi (impresora A4 láser/tinta). Validado en la
Fase 0 sobre 1022 etiquetas reales: 3 códigos por etiqueta, 1022/1022 legibles.
"""
import fitz
import numpy as np
import zxingcpp

DPI = 300


def _codigos(page):
    pix = page.get_pixmap(dpi=DPI)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
    return {(str(b.format), b.text) for b in zxingcpp.read_barcodes(img)}


def verificar(etiquetas, pdf_armado):
    """etiquetas: [pdf_bytes] en el orden de armado (4 por página).
    Devuelve [{indice, esperados, faltan}] con una entrada por etiqueta."""
    resultado = []
    with fitz.open(stream=pdf_armado, filetype="pdf") as out:
        leidos_por_pagina = {}
        for i, data in enumerate(etiquetas):
            with fitz.open(stream=data, filetype="pdf") as src:
                esperados = _codigos(src[0])
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
