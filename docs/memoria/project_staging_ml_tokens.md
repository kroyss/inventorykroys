---
name: staging-ml-tokens
description: "En staging las cuentas de MercadoLibre son copias viejas de producción (tokens vencidos): lo que consulta ML no funciona ahí y no hay que forzarlo"
metadata:
  node_type: memory
  type: project
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-11T17:59:07.051Z
---

Staging (`inventory_db_staging`/`inventory_multi`) tiene `ml_conexiones` copiadas de producción al refrescar (PIKEKE, SOLUCIONES_MC, etc., vencidas desde 2026-10-08). Los refresh tokens de ML se rotan al usarse: si staging lograra refrescar con una copia vigente, podría invalidar el de producción.

**Why:** visto el 2026-10-11 al subir "Lo que se habló" (Nueva venta), que consulta ML.
**How to apply:** probar en staging solo lo que no depende de ML (o con la empresa Demo, ML simulado); lo que llama a ML se prueba en producción con cuidado. Para ver UI de Pagos ME en staging se puede insertar un pago ficticio (orden 2000099999990001 ya creada). Ver [[staging-primero]].
