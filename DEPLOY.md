# Deploy en paralelo al legacy (Contabo VPS)

Levantar la nueva app Next.js en el mismo VPS donde corre el legacy, compartiendo `inventory_db_ve` e `inventory_db_co`. El legacy queda intacto.

## 1. Copia los archivos al VPS

Desde tu máquina local, en `D:\kroys_inventory\migracion`:

```bash
# Sube todo el proyecto (excluyendo node_modules y .next por el .dockerignore)
rsync -avz --exclude node_modules --exclude .next --exclude .env* \
  ./ root@TU_IP_VPS:/opt/inventory_next/
```

O con `scp` si no tienes rsync:
```bash
scp -r ./migracion root@TU_IP_VPS:/opt/inventory_next
```

## 2. Conéctate al VPS y prepara variables

```bash
ssh root@TU_IP_VPS
cd /opt/inventory_next
cp .env.production.example .env.production

# Genera un secret para NextAuth
openssl rand -base64 32
# Pega el resultado en NEXTAUTH_SECRET dentro de .env.production
nano .env.production
```

Ajusta también `NEXTAUTH_URL` con la IP del VPS y puerto que vayas a usar (default `8502`).

## 3. Descubre el nombre real de la red docker del legacy

Es donde viven los contenedores `inventory_db_ve` e `inventory_db_co`. Para que el nuevo container los pueda llamar por nombre, tiene que unirse a la misma red.

```bash
docker inspect inventory_db_ve -f '{{json .NetworkSettings.Networks}}'
```

Verás algo como:
```json
{"inventory_web_default": {...}}
```

El nombre de la red es el de la izquierda — en este ejemplo `inventory_web_default`.

**Edita `docker-compose.prod.yml`** (líneas finales) y reemplaza el `name:` con el valor real que viste:
```yaml
networks:
  inventory_net:
    external: true
    name: inventory_web_default   # ← AQUÍ
```

## 4. Build y arranque

```bash
cd /opt/inventory_next
docker compose -f docker-compose.prod.yml up -d --build
```

El primer build tarda unos minutos (npm ci + next build). Luego:

```bash
docker compose -f docker-compose.prod.yml logs -f inventory_next
```

Deberías ver `▲ Next.js 16.2.6 - Local: http://localhost:3000` dentro del contenedor.

## 5. Probar acceso

Abre `http://TU_IP_VPS:8502` en el navegador. Te aparece el login. Usa tus credenciales habituales (la tabla `users` es la misma, así que el login con tu usuario admin de toda la vida funciona).

## 6. Convivencia con el legacy

| Sistema  | URL                     | Función                       |
|----------|-------------------------|-------------------------------|
| Legacy   | `http://TU_IP_VPS:8501` | Producción normal             |
| Nuevo    | `http://TU_IP_VPS:8502` | Pruebas en paralelo           |
| DB VE    | `:5434` (host)          | Compartida entre ambos        |
| DB CO    | `:5435` (host)          | Compartida entre ambos        |

Si el legacy crea una venta → el nuevo la ve (refresca pantalla).
Si el nuevo crea una venta → el legacy la ve.
**No hay corrupción posible** porque ambos usan SQL contra el mismo Postgres con las mismas constraints (PK, FK, unique ml_order_number).

## 7. Actualizaciones futuras

Cuando hagas cambios localmente:

```bash
# Local
rsync -avz --exclude node_modules --exclude .next --exclude .env* \
  ./ root@TU_IP_VPS:/opt/inventory_next/

# VPS
ssh root@TU_IP_VPS "cd /opt/inventory_next && docker compose -f docker-compose.prod.yml up -d --build"
```

## 8. Si algo falla — diagnóstico

```bash
# Logs en vivo
docker compose -f docker-compose.prod.yml logs -f inventory_next

# Entrar al contenedor a inspeccionar
docker exec -it inventory_next sh

# Probar conexión a la DB desde adentro del contenedor
docker exec -it inventory_next sh -c "wget -qO- http://inventory_db_ve:5432 ; echo"
# (esperás un error de protocolo HTTP — eso ya confirma que el host resuelve)
```

**Errores comunes:**

- `getaddrinfo ENOTFOUND inventory_db_ve` → la red docker no coincide. Revisa paso 3.
- `password authentication failed` → revisa que la pass del .env.production sea la real (paso 1 de la guía de SQL: `docker exec inventory_backend env | grep DB_PASS`).
- `NEXTAUTH_URL warning` → asegúrate que la URL del .env.production sea la IP real del VPS, no localhost.

## 9. Limpieza si quieres bajar el sistema nuevo

```bash
docker compose -f docker-compose.prod.yml down
```

El legacy sigue corriendo, las DBs intactas.
