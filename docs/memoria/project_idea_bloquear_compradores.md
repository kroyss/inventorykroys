---
name: project-idea-bloquear-compradores
description: "Idea aparcada 14-10-2026: bloquear compradores (comprar/preguntar) vía API ML; NO armar hasta que lo pida"
metadata:
  node_type: memory
  type: project
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-19T14:29:45.788Z
---

Idea aparcada el 2026-10-14: bloquear compradores desde Mensajes/Preguntas/Calificaciones.
API ML (documentada, NO probada en MLV): `/users/{seller_id}/order_blacklist` y `/users/{seller_id}/questions_blacklist` (POST user_id, GET lista, DELETE /{user_id}); es por cuenta.
Propuesta hecha: botón "Bloquear" (comprar/preguntar/ambos, esta cuenta o todas), motivo, lista con Desbloquear en Configuración, permiso propio.

**Why:** el usuario preguntó si la API lo permitía y dijo "aún no armemos ese tema".
**How to apply:** no implementar hasta que lo pida; ver [[feedback-esperar-autorizacion]].

**19-10, propuesta de botón "🚫 Bloquear en ML" (link, sin API) — el dueño dijo "dejemos así de momento":** la página de cada venta `https://www.mercadolibre.com.ve/ventas/{order_id}/detalle` tiene el botón "Bloquear comprador" a la vista (→ Confirmar); mensajes de la venta: `/ventas/nueva/mensajeria/{order_id}`; Preguntas NO tiene página por pregunta (solo bandeja `vendedores.mercadolibre.com.ve/preguntas/vendedor`, hover sobre el comprador → Bloquear). Requiere la sesión de esa cuenta en el navegador. Chip "Bloqueado" descartado (no hace falta).

**Probado 17-10 (PIKEKE bloqueando a SOLUCIONES_MC, nada cambió):** la API NO sirve para nuestra app en MLV: GET `/users/{id}/order_blacklist` → 405; GET `questions_blacklist`, POST y DELETE de ambas → 403 de nginx (bloqueado en el borde, como el PolicyAgent). No se puede bloquear desde el sistema; habría que hacerlo en la web/app de ML. Lo que sí se armó (pedido de Gerardo/SHOPIT_VE): en Calificaciones, marca "💬 Escribió" y botón "Ver mensajes" por venta (ba2f175). El contador de no concretadas por comprador se descartó (el dueño: no es común).
