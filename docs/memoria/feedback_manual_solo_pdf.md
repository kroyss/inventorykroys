---
name: feedback-manual-solo-pdf
description: "Al modificar el Manual de Fundadores (u otros documentos), entregar solo PDF, no Word."
metadata:
  node_type: memory
  type: feedback
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-04T22:26:55.496Z
---

Cuando actualice el Manual de Fundadores (D:\ComercianteDigital), entregar **solo el PDF**; el .docx queda como intermedio en el scratchpad, no en la carpeta del usuario.

**Why:** el usuario lo pidió explícitamente (04-10-2026): "crea siempre pdf cuando hagas modificación, no hagas word, mejor solo pdf".

**How to apply:** generar con manual.js (docx-js) en el scratchpad y exportar a PDF con Word por COM (PowerShell `Word.Application` → `ExportAsFixedFormat(dst, 17)`; LibreOffice no está instalado). Si el PDF destino está abierto, usar otro nombre. Relacionado: [[project-programa-fundadores]].
