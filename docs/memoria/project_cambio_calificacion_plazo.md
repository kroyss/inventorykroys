---
name: project-cambio-calificacion-plazo
description: Pendiente verificar cuántos días tarda ML en quitar una calificación con cambio pedido sin respuesta (¿5 corridos o hábiles?)
metadata:
  type: project
---

17-10-2026: dos pedidos de cambio de calificación (ALVARO80RODRIGUEZ negativa, PIKEKE, orden 2000018346839512; LUISGABRIELX neutral, SOLUCIONES_MC, 2000018459236372) se enviaron el 12-10 ~12:20 hora VE. ML (`/orders/{id}/feedback` → `purchase.change_request.status = pending`, `sent_date`) dice "5 días"; a las 12:34 del 17-10 seguían pending. Si son hábiles, vence el lunes 19-10. El usuario va a avisar qué pasa.

**Why:** Reputación (ReputacionClient) calcula "le quedan N días" con 5 días corridos; si ML usa hábiles o tarda en procesar, el conteo del sistema queda mal.
**How to apply:** cuando el usuario cuente el resultado, ajustar el texto/cálculo de `diasRespuesta` en components/preguntas/ReputacionClient.tsx.
