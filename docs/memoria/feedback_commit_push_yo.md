---
name: feedback-commit-push-yo
description: "En el proyecto de inventario, el usuario quiere que yo haga el commit y el push a origin main sin que me lo repita; solo el paso del VPS lo hace él"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 36603bf2-6af8-43fe-88b1-558307eec3b7
  modified: 2026-09-30T14:41:27.511Z
---

Cuando termine un cambio en `migracion/` (Syncsora Inventory), hago yo el `git add` + `git commit` + `git push origin main`. El usuario lo confirmó explícitamente ("hazlo tú siempre ese"): no darle el comando para que lo corra él.

**Why:** el paso del PC es rutina para él y le estorba tener que pedirlo; lo que sí queda de su lado es el VPS (`git pull`, migraciones con `docker exec ... psql`, `./deploy.sh`) y instalar el Reportador de escritorio, porque yo no tengo acceso al server.

**How to apply:** al terminar y con `npx tsc --noEmit` en 0, commitear (solo `app components lib db services reportador`, nunca `.claude/`) con el trailer de coautoría y pushear; después darle solo los comandos del VPS. Sigue valiendo confirmar antes de cualquier cosa destructiva (force push, reset).

Actualización 2026-09-30: tengo acceso SSH al VPS (`ssh root@85.239.249.43`, llave de la PC funciona). El usuario me pidió instalar staging ("¿puedes hacerlo tú?") y lo hice. Para producción (deploy, migraciones en inventory_db_ve/co, nginx de sitios reales) sigo pidiendo permiso explícito cada vez; staging (/opt/inventory_staging, inventory_db_staging) y respaldos sí puedo operarlos cuando el trabajo lo pida.
