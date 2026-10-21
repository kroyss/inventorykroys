---
name: project-aviso-corte-fundadores
description: "Corte 1 (19-10 23:00) programado en código; PENDIENTE 20-10: armar 2º corte (creados 19–23/10, sin ML al dom 25/10 23:00) reusando el aviso, en vez de borrarlo"
metadata:
  type: project
---

Corte 1: lunes 19-10 23:00 (lib/fundadoresCorte.ts, HORA_CORTE), Fundadores en prueba creados hasta el 18/10 sin ML → 'vencido', motivo 'corte_fundadores'. Aviso temporal: components/layout/AvisoCorte.tsx + `saleEnElCorte`/`CORTE_ISO`, llamado en components/layout/AvisoCuenta.tsx.

Corte 2 (acordado 19-10, implementar el 20-10, staging primero y prod con OK): Fundadores en prueba creados entre el 19/10 y el viernes 23/10 (p. ej. Inversiones Vilrod, org 25) sin ninguna cuenta ML al domingo 25/10 23:00 hora VE → mismo trato (pausa + texto de cupo liberado + Telegram al dueño con la lista). Mismo aviso (franja + ventana) con su fecha, visible desde que entran. Propuesta: la config pasa a lista de cortes {fecha, desde, hasta}, sin tocar el corte 1. Los creados del sábado 24 en adelante NO entran: serán de otro corte aún no definido.

**Why:** el dueño ingresa la lista de espera en tandas, cada tanda con su plazo.

**How to apply:** el 20-10 implementar el corte 2. Borrar AvisoCorte/saleEnElCorte solo cuando no queden cortes pendientes (después del 25-10, salvo que haya un 3º). Ver [[project-programa-fundadores]].
