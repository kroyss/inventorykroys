# Día del cambio a multiempresa

Pasa `inventory.syncsora.com` de las dos bases por país (`inventory_db_ve`, `inventory_db_co`)
a la base compartida `inventory` (contenedor nuevo `inventory_db`). Tiempo fuera de servicio
estimado: **15 a 20 minutos**. Las bases viejas no se tocan: son la vuelta atrás.

El script de migración es el mismo que se ensaya en staging (`scripts/multiempresa-migrar.sh`):
copia VE y CO, arma la base nueva y corre los controles; si un solo control falla, se detiene.

## Antes (el día anterior)

- [ ] Ensayo final con datos de ese día, en staging:
      `cd /opt/inventory_staging && ./scripts/multiempresa-migrar.sh staging` → debe terminar en `✓ … verificada`.
- [ ] Captura del dashboard de VE y de CO (ventas del mes, ganancia, stock) para comparar después.
- [ ] Sin despachos a medio generar ni facturas a medio emitir.

## El día (sábado en la tarde)

| # | Quién | Paso |
|---|---|---|
| 1 | tú | Avisar a los usuarios: el sistema se detiene ~20 min, no cargar nada. |
| 2 | VPS | `docker stop inventory_next` — nadie escribe desde aquí. |
| 3 | VPS | `cd /opt/inventory_next && ./scripts/backup-db.sh antes-multiempresa` → `2 ok, 0 fallidos`. |
| 4 | yo | Merge de `multiempresa` a `main` con la etiqueta `pre-multiempresa` en el commit anterior, y push. |
| 5 | VPS | `git pull --ff-only origin main` (solo trae el código; nada se reinicia). |
| 6 | VPS | Claves nuevas (una sola vez): `/opt/inventory_next/.env` con `INVENTORY_DB_PASSWORD=<openssl rand -hex 24>` y en `.env.production` la línea `DATABASE_URL=postgresql://inventory_app:<otra clave>@inventory_db:5432/inventory`. Las `DATABASE_URL_VE/CO` se dejan (vuelta atrás). |
| 7 | VPS | `docker compose -f docker-compose.prod.yml up -d inventory_db` → esperar `healthy`. |
| 8 | VPS | `./scripts/multiempresa-migrar.sh produccion --confirmar` → **debe** terminar en `0 FALLAS` y `✓ … verificada`. Si no: vuelta atrás. |
| 9 | VPS | `./deploy.sh` (construye la app nueva y la levanta). |
| 10 | tú | Revisión (abajo). Si todo bien: avisar que el sistema volvió. |

Los pasos de VPS los puedo correr yo con tu autorización en ese momento.

## Revisión después del cambio

- [ ] Entrar con tu usuario (VE) y con `wilmer`.
- [ ] Dashboard VE y CO iguales a las capturas del día anterior.
- [ ] Selector VE / CO cambia de empresa.
- [ ] Crear una venta borrador y borrarla.
- [ ] Despachos: se ve la jornada; el Reportador de escritorio sigue conectado (su token se migró).
- [ ] Facturas y Finanzas abren.
- [ ] Al día siguiente: el cron de tasas actualizó (`/tasa`) y el respaldo de las 3:30 incluye `inventory`.

## Vuelta atrás

Mientras no se haya cargado nada importante en el sistema nuevo:

1. Yo reviso el merge en `main` (git revert) y hago push.
2. VPS: `./deploy.sh` → la app vuelve a las bases viejas (sus `DATABASE_URL_VE/CO` siguen en `.env.production`).

Sin mí: `cd /opt/inventory_next && git checkout pre-multiempresa && docker compose -f docker-compose.prod.yml up -d --build inventory_next`
(deja el repo en un commit suelto; después hay que volver a `main`).

Lo cargado en la base nueva después del cambio NO pasa solo a las viejas: por eso la
revisión se hace en el momento, antes de volver a operar.

## Después

- Las bases viejas quedan detenidas-pero-intactas 30 días; después se archivan con un respaldo final.
- `staging-refrescar.sh` debe copiar desde `inventory_db` / `inventory` (ajuste pendiente al cambio).
