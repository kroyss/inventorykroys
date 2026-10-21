---
name: no-pgrep-espera
description: "Para esperar un deploy en el VPS no usar pgrep/pkill -f con el nombre del script: se encuentra a sí mismo y se cuelga o mata la propia sesión ssh"
metadata:
  node_type: memory
  type: feedback
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-13T10:53:43.520Z
---

No esperar con `until ! pgrep -f deploy-staging ...` ni limpiar con `pkill -f "<patrón>"` por ssh: la línea de comando de la propia sesión contiene el patrón, así que pgrep nunca da vacío (se colgó 10 min) y pkill cortó la conexión (exit 255). Pasó dos veces (12-10 y 13-10).

**Why:** pérdida de tiempo y deploys a staging que no salen.
**How to apply:** lanzar el deploy en primer plano y, si hay otro en curso, esperar la notificación de la tarea en segundo plano y recién ahí correr el siguiente. Ver [[staging-primero]].
