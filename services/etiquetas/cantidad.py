"""
Cantidad resaltada en la etiqueta (12-11-2026, pedido del dueño: evitar errores al armar paquetes).

Con 1 unidad la línea queda como siempre: "1 - Producto". Con 2 o más, el número va en un círculo negro con el número
en blanco y en negrita, seguido de la cantidad en palabras y en negrita: "(2) DOS - Producto" se dibuja como
"❷ DOS - Producto". Así, a simple vista se nota que ese paquete lleva varias unidades, y una palabra no se confunde
como un 3 y un 8 mal impresos.

Solo es texto debajo de la guía: no toca el pegado vectorial ni los códigos de barras.
"""
import re

import fitz  # PyMuPDF

PALABRAS = {
    2: "DOS", 3: "TRES", 4: "CUATRO", 5: "CINCO", 6: "SEIS", 7: "SIETE", 8: "OCHO", 9: "NUEVE", 10: "DIEZ",
    11: "ONCE", 12: "DOCE", 13: "TRECE", 14: "CATORCE", 15: "QUINCE", 16: "DIECISEIS", 17: "DIECISIETE",
    18: "DIECIOCHO", 19: "DIECINUEVE", 20: "VEINTE",
}
# La marca que deja armar_sales_map y reconoce dibujar_linea: "(n) PALABRA resto".
MARCA = re.compile(r"^\((\d+)\) (\S+)(.*)$")
FUENTE = "helv"
NEGRITA = "hebo"


def palabra(n):
    return PALABRAS.get(n, "UNIDADES")


def linea_producto(cantidad, producto):
    """El texto de una línea. Con 2 o más lleva la marca "(n) PALABRA" que después se dibuja resaltada."""
    try:
        n = int(str(cantidad).strip())
    except ValueError:
        n = 1
    if n < 2:
        return f"{str(cantidad).strip()} - {producto}" if producto else f"{str(cantidad).strip()} und."
    return f"({n}) {palabra(n)} - {producto}" if producto else f"({n}) {palabra(n)} UNIDADES"


def dibujar_linea(page, punto, linea, fontsize, rotate=0):
    """Escribe la línea; si trae la marca, círculo + número + palabra en negrita y después el resto.
    rotate 0 (ZOOM) o 90 (TEALCA, texto hacia arriba)."""
    m = MARCA.match(linea)
    if not m:
        page.insert_text(punto, linea, fontsize=fontsize, fontname=FUENTE, rotate=rotate)
        return
    num, pal, resto = m.group(1), m.group(2), m.group(3)
    # Direcciones del texto: a lo largo (base) y hacia arriba de la letra.
    base, arriba = ((1, 0), (0, -1)) if rotate == 0 else ((0, -1), (-1, 0))
    x, y = punto

    def mover(d, dx, dy=0.0):
        return (d[0] + base[0] * dx + arriba[0] * dy, d[1] + base[1] * dx + arriba[1] * dy)

    # Del alto de la letra (12-11: el dueño lo prefirió al mismo tamaño que el texto).
    r = fontsize * 0.56
    centro = mover((x, y), r, fontsize * 0.34)
    page.draw_circle(centro, r, color=(0, 0, 0), fill=(0, 0, 0), width=0)
    fs_num = fontsize * (0.78 if len(num) == 1 else 0.62)
    ancho_num = fitz.get_text_length(num, fontname=NEGRITA, fontsize=fs_num)
    page.insert_text(mover(centro, -ancho_num / 2, -fs_num * 0.35), num, fontsize=fs_num, fontname=NEGRITA,
                     color=(1, 1, 1), rotate=rotate)
    p = mover((x, y), 2 * r + fontsize * 0.25)
    page.insert_text(p, pal, fontsize=fontsize, fontname=NEGRITA, rotate=rotate)
    p = mover(p, fitz.get_text_length(pal, fontname=NEGRITA, fontsize=fontsize))
    page.insert_text(p, resto, fontsize=fontsize, fontname=FUENTE, rotate=rotate)
