---
name: project-comprobador-pagos-banco
description: "Pendiente 19-10: comprobador masivo de Pagos ME contra estados de cuenta (Bancamiga/Banesco/Mercantil); cruce de prueba dio ~80 % automático"
metadata:
  type: project
---

Idea del dueño (19-10): subir los reportes del banco y cruzarlos con Pagos ME. Primero en modo sugerencia (aprobar con un clic) y más adelante automático. Pendiente de implementar: proponer pantalla y esperar su OK.

Hallazgos del cruce de prueba (scripts en el scratchpad: cruce_bancos.py y cruce_bancamiga2.py):
- Bancamiga recibe la mayoría de los pagos. Su .xls es HTML: leer con pandas `read_html(thousands='.', decimal=',')`.
- Banesco: .xls en HTML. Mercantil: .xlsx con las referencias rellenas con ceros.
- **Embalaje opcional:** el comprador a veces suma ~Bs 400 (puede subir a 500 o 600 con el tiempo), en la misma transferencia o aparte. Regla: es correcto si el banco recibió desde el monto de la orden hasta la orden + un margen configurable en Ajustes. Si llegó menos, va a revisión.
- **Cómo cruzar:** buscar en TODOS los bancos (el comprador pone mal el banco). Por referencia (últimos 4–6 dígitos) + monto, o por monto + fecha ±1.
- **Varias ventas juntas:** comparten la misma referencia, así que se suma.
- **Banco de Venezuela:** la referencia del comprobante no coincide con la que muestra Bancamiga. 17 de 26 no encontrados eran de BDV. Se le pidió al dueño un ejemplo (venta …1754418, Bs 5.577,15 del 19/10) para ver qué referencia muestra Bancamiga.
- **Resultado:** ~76 % automático, ~80 % con la regla del embalaje.

- **Provincial (20-10):** .xls HTML con Fecha | Descripción | Monto | Saldo, SIN referencia. La descripción trae el teléfono y el código del banco de origen ("DR OB 0412… 102BAN", "CR.I/REC 0134 V…"; "ABO.DRV…" = desde otra cuenta Provincial). Se cruza por banco de origen + monto (o embalaje) + fecha, solo contra pagos a Provincial: 8 de 8. Los créditos desde el teléfono del dueño (0414-7133665) son traspasos propios, no ventas. Lógica en lib/conciliacionBanco.ts (sin pantalla).

- **Decidido 20-10:** Banco de Venezuela NO exporta movimientos (solo pantalla) → queda fuera; sus casos van a revisión manual. Banesco: la lógica ya está (el archivo de prueba era incompleto, no hace falta otro). **Solo falta el archivo de Banco Plaza** para validar su formato; después, proponer la pantalla.

- **En producción 20-10:** Pagos ME → pestaña "Comprobar con el banco" (components/pagosme/ComprobarBanco.tsx, /api/pagos-me/comprobar). El cruce corre en el navegador: los archivos NO se suben. Aprobar = Pago correcto con nota del movimiento. Margen embalaje en app_settings 'conciliacion_margen_embalaje' (700 por defecto).

- **20-10 (mig 110):** se movió a **Ventas → Por confirmar** (botón "🏦 Comprobar con el banco", cualquier usuario: "todos usamos Por confirmar"); el equipo NO usa Pagos ME (solo el admin lo ve). El resultado de cada pago se guarda en me_pagos.banco_* (solo el movimiento que le corresponde) y se ve en cada venta de Por confirmar y dentro de la venta junto a "Verificar pago" (LineaBanco). La pestaña de Pagos ME se quitó. Fundadores lo tendrán en Pagos ME → Ventas cuando se les active el módulo (se avisa solo a los elegidos).

**How to apply:** al retomarlo, partir de estas reglas. Ver [[project-pagos-me]].
