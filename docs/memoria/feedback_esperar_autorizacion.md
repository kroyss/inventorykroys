---
name: esperar-autorizacion
description: No elaborar ni cambiar código/sistema por iniciativa propia; responder lo preguntado y esperar autorización
metadata:
  node_type: memory
  type: feedback
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-09T12:08:30.878Z
---

Si el usuario cuenta un problema o hace una consulta (p. ej. "Ruben se trabó al conectar"), responder eso y, como mucho, PROPONER en una línea. No editar código, ni hacer commit, ni subir a staging sin que lo pida explícitamente.

**Why:** 2026-10-09 cambié las instrucciones de "Cómo conectar" y lo subí a staging por mi cuenta; el usuario se molestó ("no hagas eso, espera mi autorización para elaborar cosas") y se revirtió.
**How to apply:** ante un comentario o problema, primero respuesta/diagnóstico y pregunta "¿lo hago?"; recién con su OK, implementar. Relacionado: [[staging-primero]] [[commit-push-yo]].
