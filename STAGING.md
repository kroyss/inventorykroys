# Staging — copia de pruebas

Etapa 1 del plan multiempresa. Staging es una segunda instalación del sistema en el mismo
VPS, con **su propia base** y **su propia red**, alimentada con una copia de producción.
Todo cambio grande (y todo el trabajo multiempresa) se prueba aquí antes de tocar
`inventory.syncsora.com`.

| | Producción | Staging |
|---|---|---|
| Carpeta | `/opt/inventory_next` | `/opt/inventory_staging` |
| Compose | `docker-compose.prod.yml` | `docker-compose.staging.yml` |
| Contenedores | `inventory_next`, `inventory_etiquetas` | `*_staging` + `inventory_db_staging` |
| Base | `inventory_db_ve` / `inventory_db_co` | `inventory_db_staging` (ambas bases adentro) |
| Puerto | 8501 | 127.0.0.1:8511 |
| URL | inventory.syncsora.com | staging.elcomerciantedigital.com (con clave) |
| Reportador | activo | **apagado** (`APP_ENV=staging`) |

Staging **no puede** escribir en producción: su red no incluye las bases reales y su
`.env.staging` apunta solo a `inventory_db_staging`. El único script que toca las bases
reales es `scripts/staging-refrescar.sh`, y solo las **lee** (`pg_dump`).

## Instalación (una vez)

```bash
# 1. Versión de Postgres de producción (staging debe usar la misma versión mayor)
docker exec inventory_db_ve postgres -V

# 2. Segundo clon del repo
git clone git@github.com:kroyss/inventorykroys.git /opt/inventory_staging
cd /opt/inventory_staging

# 3. Variables
cp .env.staging.example .env.staging
nano .env.staging          # claves NUEVAS, distintas a producción
nano .env                  # STAGING_DB_PASSWORD=... y STAGING_PG_IMAGE=postgres:<versión>-alpine

# 4. Levantar y copiar los datos
chmod +x deploy-staging.sh scripts/*.sh
./deploy-staging.sh
./scripts/staging-refrescar.sh --con-archivos
```

`staging-refrescar.sh` termina comparando la cantidad de filas de cada tabla entre
producción y staging: es la prueba de que un respaldo se puede restaurar.

## Dominio y clave (nginx)

DNS: registro `A` de `staging` → `85.239.249.43`. Luego:

```bash
apt install -y apache2-utils
htpasswd -c /etc/nginx/.htpasswd_staging kroys
```

```nginx
server {
    server_name staging.elcomerciantedigital.com;
    auth_basic "Staging";
    auth_basic_user_file /etc/nginx/.htpasswd_staging;
    client_max_body_size 50m;
    location / {
        proxy_pass http://127.0.0.1:8511;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
nginx -t && systemctl reload nginx
certbot --nginx -d staging.elcomerciantedigital.com
```

## Uso diario

```bash
cd /opt/inventory_staging
./deploy-staging.sh                 # main
./deploy-staging.sh multiempresa    # la rama del trabajo multiempresa
./scripts/staging-refrescar.sh      # datos frescos de producción
```

Las migraciones se prueban aquí primero, igual que en producción pero contra
`inventory_db_staging`:

```bash
docker exec -i inventory_db_staging psql -U postgres -d inventory_ve < db/migrations/0XX_nombre.sql
```

## Respaldos de producción

`scripts/backup-db.sh` (en `/opt/inventory_next`):

- Sin argumentos: respaldo de VE y CO en `/opt/backups/kroys`, se borran solos a los 14 días.
  Cron diario: `0 3 * * * /opt/inventory_next/scripts/backup-db.sh >> /var/log/kroys_backup.log 2>&1`
- **Antes de cada migración:** `./scripts/backup-db.sh antes-031` → queda en
  `/opt/backups/kroys/antes-de-migrar/` y no se borra solo.
- Cada respaldo se verifica (se descomprime y no está vacío); si falla, el script sale con error.
