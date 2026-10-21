---
name: feedback-staging-primero
description: Todo cambio del inventario pasa primero por staging (staging.elcomerciantedigital.com) y recién con el visto bueno del usuario va a producción
metadata:
  node_type: memory
  type: feedback
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-12T11:12:35.969Z
---

Desde 2026-09-30 existe staging: https://staging.elcomerciantedigital.com (clave nginx en /root/staging_clave.txt del VPS; carpeta /opt/inventory_staging, base inventory_db_staging, Reportador apagado). El usuario lo adoptó como regla: "primero aplico aquí y si todo bien allí sí voy a la oficial".

**Why:** evitar romper producción (inventory.syncsora.com) con cambios que no se probaron con datos reales.

**How to apply:** commit+push → `./deploy-staging.sh [rama]` en el VPS (lo puedo correr yo) + migraciones contra inventory_db_staging → le pido que revise en staging → con su OK: respaldo `./scripts/backup-db.sh antes-XXX`, migración y `./deploy.sh` en producción. Refrescar datos con `./scripts/staging-refrescar.sh` ANTES de pedirle que revise algo en staging (07-10: le costó entrar porque staging tenía sus claves viejas). Es seguro: staging usa otro ML_TOKEN_KEY y no puede usar los tokens de ML copiados. Tras subir a producción: UNA sola revisión inmediata (pg_stat_activity + errores del log + tiempo de /login); el usuario pidió el 07-10 no hacer la segunda a los 10 min (ahorra tokens). **Ojo (2026-10-12):** "sí está bien, continúa" después de revisar en staging NO es OK para producción: quería decir "sigue con los cambios" (lo siguiente del plan). Subí permisos a producción sin querer. A producción solo con una frase explícita ("súbelo a producción", "pásalo a la oficial"); si es ambiguo, preguntar. Relacionado: [[feedback-commit-push-yo]], [[project-comerciantedigital-multiempresa]].
