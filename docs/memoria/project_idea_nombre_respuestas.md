---
name: idea-nombre-respuestas
description: "Aparcada 13-10: {nombre} del comprador en respuestas rápidas de Mensajes (botón \"+ Nombre del comprador\" en el editor); no hacer hasta que otro cliente lo pida"
metadata:
  node_type: memory
  type: project
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-14T00:34:34.616Z
---

Un cliente pidió saludar con el nombre. Propuesta aceptada en idea pero APARCADA por el usuario (2026-10-13), hasta que más clientes lo pidan:
- Solo Mensajes (respuestas rápidas): `{nombre}` → primer nombre; sin nombre, se quita limpio ("Hola, …"). Misma variable que Recordatorios de pago.
- Botón "+ Nombre del comprador" en el editor de respuestas rápidas; nada nuevo en la pantalla de responder.
- Preguntas NO: verificado en prod que la API (/questions `from` y /users/{id}) no da el nombre, solo apodo (la web de ML sí lo muestra).
- No usar `@`: ML lo modera como mención de redes.

**Why:** pedido de un solo cliente; no recargar la pantalla.
**How to apply:** si otro lo pide, implementar tal cual; ver [[esperar-autorizacion]].
