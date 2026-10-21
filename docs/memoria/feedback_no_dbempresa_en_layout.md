---
name: feedback-no-dbempresa-en-layout
description: "Caída del 06-10 (20:25-21:46): dbEmpresa en Navbar agotó el pool. Nada global toca la base por petición; nunca esconder errores; vigilar conexiones tras deploy"
metadata:
  node_type: memory
  type: feedback
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-07T01:52:59.585Z
---

El 06-10-2026 tumbé producción ~1h20 (login y APIs 504): puse `esDemo(dbDeSesion(session))` en el Navbar (layout, corre en todas las páginas) con `.catch(() => false)`. dbEmpresa devuelve la conexión con `after()`, que en el layout no corre: cada vista dejaba una conexión tomada hasta agotar el pool (10). Afectó a Cristhian (chevrochacao) al conectar ML y a wilmer. El usuario se enojó mucho ("puedes arruinar mi negocio").

**Why:** lo que corre en todas las páginas multiplica cualquier error; el catch silencioso lo escondió y el chequeo post-deploy (solo "responde 200") no lo vio.
**How to apply:**
- En layout/Navbar/server components globales: usar `conEmpresa` (se libera solo) o dbGlobal, nunca dbEmpresa/dbDeSesion.
- No tragar errores con catch vacío en código nuevo de producción.
- Tras cada deploy a prod: vigilar `pg_stat_activity` (usename inventory_app, idle viejas) ~10 min con uso real, no solo el healthcheck.
- Cambios que corren en TODAS las páginas = riesgo alto: probarlos navegando varias páginas en staging.
Ver [[project-cuenta-demo]].
