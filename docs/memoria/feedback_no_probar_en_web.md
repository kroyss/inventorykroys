---
name: no-probar-en-web
description: "No verificar en el navegador (Chrome/staging) por mi cuenta: gasta muchos tokens; solo si el usuario lo pide o preguntando antes"
metadata:
  node_type: memory
  type: feedback
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-12T15:43:24.884Z
---

No abrir el navegador para revisar pantallas (staging, ML, etc.) por iniciativa propia. Solo cuando el usuario lo pida, o si lo veo necesario, preguntarle antes.

**Why:** el usuario lo pidió el 2026-10-12: las pruebas en web gastan muchos tokens; él revisa en staging.
**How to apply:** verificar con typecheck, SQL y pruebas en servidor; al terminar, decirle qué revisar en staging. Prima sobre la regla general de "verificar en el navegador".
