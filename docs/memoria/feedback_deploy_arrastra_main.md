---
name: deploy-arrastra-main
description: "deploy.sh de producción publica TODO main: no subir a prod un arreglo puntual si hay cambios en main esperando el OK del usuario"
metadata:
  node_type: memory
  type: feedback
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-10T20:12:41.565Z
---

`./deploy.sh` en /opt/inventory_next hace `git pull` de main completo: un arreglo urgente arrastra a producción todo lo que esté en main esperando revisión en staging (y sus migraciones NO se aplican solas).

**Why:** 10-10-2026 subí un ajuste de Pagos ME y salieron a producción, sin su OK, los cambios de Preguntas/Mensajes que estaban solo en staging; además faltaba la migración 077 (columnas nuevas) y hubo que aplicarla de urgencia.

**How to apply:** antes de cada deploy a prod, `git log origin/main` vs lo que hay en prod (`git log -1` en el VPS): si hay commits pendientes del OK del usuario, preguntarle o desplegar solo cuando apruebe todo; y aplicar las migraciones pendientes (con respaldo) ANTES del deploy. Relacionado: [[staging-primero]], [[esperar-autorizacion]].
