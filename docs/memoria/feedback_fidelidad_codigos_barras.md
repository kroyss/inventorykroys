---
name: feedback-fidelidad-codigos-barras
description: Códigos de barras/QR de las etiquetas ML son lo más sensible; no alterar el método que funciona (PyMuPDF show_pdf_page vectorial)
metadata:
  node_type: memory
  type: feedback
  originSessionId: 1b751e9a-f7ec-4a71-aa5c-72f882407443
  modified: 2026-09-25T12:42:29.542Z
---

Los QR y códigos de barras de las etiquetas de Mercado Envíos se dañaron en el pasado al transformar los PDF (hace >6 meses, causa exacta olvidada). Costó muchas pruebas llegar al método actual de `etiquetas_ml.py`: pegado VECTORIAL con PyMuPDF `show_pdf_page` + `clip` al borde + escala máx 0.80, sin rasterizar. El usuario validaba escaneando el resultado con lector de QR y de código de barras.

**Why:** un código ilegible = paquete que no se puede despachar; el método actual funciona perfecto.
**How to apply:** en cualquier migración (módulo Despachos, ver [[project-despacho-ml-api]]) copiar esas funciones TAL CUAL, misma versión de PyMuPDF (1.27.1 en la PC de desarrollo), nunca convertir a imagen/OCR/comprimir. Validar con decodificación automática (zxing-cpp) + escaneo físico con lector antes de dar por bueno.
