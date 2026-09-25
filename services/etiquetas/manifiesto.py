"""
Manifiesto de la jornada.

Diseño COPIADO de D:\\Script Etiquetas Venezuela\\generar_manifiesto.py
(generar_pdf): mismo papel, márgenes, título, columnas, estilos y pie de firmas.
Cambia solo la fontanería: recibe las filas en vez de leer ENVIO_ACTIVO.csv y
devuelve el PDF en bytes.
"""
import io

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def short_remitente(nombre):
    return str(nombre)[:20]


def armar_manifiesto(filas, remitente, fecha_hoy):
    """filas: [{fecha, remitente, venta, guia, destinatario}] (texto ya limpio).
    Se ordenan por REMITENTE y FECHA, como el script."""
    filas = sorted(filas, key=lambda f: (f["remitente"], f["fecha"]))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        topMargin=15,
        bottomMargin=15,
        leftMargin=15,
        rightMargin=15
    )
    styles = getSampleStyleSheet()

    elements = []

    elements.append(Paragraph("<b>REPORTE DE ENVÍOS</b>", styles["Title"]))
    elements.append(Spacer(1, 5))

    fecha_min = min(f["fecha"] for f in filas)
    fecha_max = max(f["fecha"] for f in filas)

    header_text = f"Fecha: {fecha_hoy} &nbsp;&nbsp; | &nbsp;&nbsp; Remitente: {remitente} &nbsp;&nbsp; | &nbsp;&nbsp; Rango: {fecha_min} → {fecha_max}"

    style_center = styles["Normal"].clone("centered")
    style_center.alignment = TA_CENTER

    elements.append(Paragraph(header_text, style_center))
    elements.append(Spacer(1, 8))

    data = [["#", "REMITENTE", "FECHA", "VENTA", "GUIA", "DESTINATARIO", "✔"]]

    for contador, f in enumerate(filas, 1):
        data.append([
            contador,
            short_remitente(f["remitente"]),
            f["fecha"],
            f["venta"],
            f["guia"],
            f["destinatario"],
            ""
        ])

    table = Table(data, repeatRows=1)

    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (-1, 1), (-1, -1), "CENTER"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    elements.append(table)
    elements.append(Spacer(1, 10))

    elements.append(Paragraph(f"Total envíos: <b>{len(filas)}</b>", style_center))

    footer_text = "Recibido por: _____________________ &nbsp;&nbsp; | &nbsp;&nbsp; Firma: _____________________ &nbsp;&nbsp; | &nbsp;&nbsp; Sello: _____________________"
    elements.append(Spacer(1, 15))
    elements.append(Paragraph(footer_text, styles["Normal"]))

    doc.build(elements)
    return buf.getvalue()
