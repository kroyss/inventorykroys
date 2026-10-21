---
name: project-cuenta-demo
description: "Cuenta demo para videos (06-10-2026): alta \"Demo\" en Plataforma, ML simulado en mlFetch, restaurar por sección en /demo, 50 PDFs en Demo videos/Despachos"
metadata:
  node_type: memory
  type: project
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-06T23:30:31.916Z
---

Cuenta DEMO para grabar videos y demos en vivo (en prod desde 2026-10-06). Tienda ficticia "Tecnova Store" con 2 cuentas ML ficticias (TECNOVA_STORE / TECNOVA_OUTLET) y todo pendiente.

- Se crea en Plataforma → Empresas → Nueva → Cuenta "🎬 Demo" (VE). La clave la genera el sistema (yo no la escribo).
- Cuenta ML demo = access_token_enc 'demo' (TOKEN_DEMO): mlFetch la responde con lib/demoML.ts (simulador sobre la base). Nada sale a ML. Cron y sincronizaciones la saltan (esDemo).
- Datos: lib/demoDatos.ts (rangos de venta 2000099991…/92…/93…/94…/95… por sección; jornadas sembradas con manifest_path 'demo:<sección>'). lib/demo/datos.json + 50 etiquetas PDF salen de scripts/demo/generar.py → D:\ComercianteDigital\Demo videos\Despachos.
- Restaurar: menú de la cuenta → "Demo · restaurar" (/demo), por sección o todo.
- Prueba: scripts/demo/probar.ts corre contra staging en una transacción con ROLLBACK (contenedor node temporal en la red de inventory_next_staging).

**Why:** el usuario quiere videos donde se vea pasar de muchos pendientes a cero en pocos clics, repitiendo tomas.
**How to apply:** si cambia un flujo que llama a ML, revisar que lib/demoML.ts responda esa ruta; si cambian las etiquetas, regenerar con generar.py. Ver [[project-modo-sin-inventario]].
