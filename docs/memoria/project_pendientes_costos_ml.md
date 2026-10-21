---
name: pendientes-costos-ml
description: "Pendientes aparcados 12-10-2026 en Ajustes: MercadoEnvíos cambió políticas (arreglar para dueño y Fundadores) y comisión ML automática desde las ventas reales"
metadata:
  node_type: memory
  type: project
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-12T15:38:52.620Z
---

Dos temas que el usuario dejó "para después" el 2026-10-12 (no hacer hasta que lo pida):
1. **MercadoEnvíos cambió sus políticas**: la Tabla MercadoEnvíos / envío gratis de Ajustes (lib/mlShipping.ts) hay que actualizarla, para el dueño y para Fundadores.
2. **Comisión ML automática**: hoy es un número fijo en Ajustes (ml_comision 12%); ML informa lo cobrado en cada orden (sale_fee), se podría calcular con las ventas reales. Cambia el margen en todo el sistema.

**Why:** salió revisando Ajustes para Inventario simple; el usuario no sabía que esos parámetros existían (estaban dentro del Simulador).
**How to apply:** recordárselo cuando se vuelva a tocar Ajustes o márgenes; no implementarlo sin su OK ([[feedback_esperar_autorizacion]]).
