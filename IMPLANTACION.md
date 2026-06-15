# Implantación — reemplazo del legacy por el sistema nuevo

> Ventaja clave: **ambos sistemas usan la misma base de datos** (sin cambios de schema).
> No hay migración de datos y el rollback es instantáneo (volver al legacy :8501).

## Estrategia recomendada: corte por momento, no por usuario

El nuevo y el legacy manejan algunos campos de forma distinta (`total_received_qty`,
movimientos de inventario). Si dos personas operan **la misma orden** en sistemas
distintos a la vez, se producen inconsistencias.

➡️ Elige un día/hora de poca actividad y **todos pasan al nuevo a la vez**. El legacy
queda como respaldo de **solo lectura / rollback**, no para seguir operando en paralelo.

---

## Antes del corte

- [ ] **Respaldo de ambas DB** (`scripts/backup-db.sh`). Verificar que los `.sql.gz` existen y pesan > 0.
- [ ] **Fotos de importaciones migradas** al volumen del nuevo:
      `mkdir -p /opt/inventory_next/uploads && docker cp inventory_backend:/app/uploads/. /opt/inventory_next/uploads/`
- [ ] **Permisos del volumen de uploads** — el contenedor corre como uid 1001 (`nextjs`); si la carpeta es de root no podrá subir archivos (EACCES):
      `chown -R 1001:1001 /opt/inventory_next/uploads`
      Verificar: `docker exec inventory_next sh -c 'touch /app/uploads/_t && rm /app/uploads/_t && echo ESCRIBIBLE'`
- [ ] Variables `.env.production` correctas (DBs VE/CO, `NEXTAUTH_SECRET`, `UPLOAD_DIR=/app/uploads`).
- [ ] Red docker correcta: `inventory_web_inventory_network` (mismo que las DB).
- [ ] Legacy sigue corriendo intacto en :8501.

## Checklist de humo (probar en :8502, contra DB real, en **VE y CO**)

### Auth
- [ ] Login VE y login CO; usuario admin y usuario normal.
- [ ] La sesión dura ~12h (no expira mientras se usa).

### Ventas
- [ ] Crear venta normal → Verificar pago → Procesar → Exportar Excel (marca DESCARGADA).
- [ ] Crear venta **LOCAL** (checkbox naranja) → Verificar y entregar → descuenta inventario.
- [ ] Reabrir una venta procesada → revierte correctamente.
- [ ] Campo cliente: buscar existente y crear uno nuevo escribiendo.
- [ ] Campos numéricos no aceptan letras (e, +, -).

### Inventario
- [ ] Lista con estados (OK/BAJO/SIN_STOCK). Ajuste IN/OUT/ADJUST. Movimientos.

### Compras locales
- [ ] Crear → Pagada → En camino → Recibir **completa** → Finalizar (carga inventario).
- [ ] Crear → ... → Recibir **parcial** → Recibir más → Finalizar (inventario correcto).
- [ ] Marcar Inconsistente (con nota). Reabrir (revierte inventario).
- [ ] Historial: contadores correctos, columna "Inconsistente", cantidades recibidas (no 0/X).

### Importaciones
- [ ] Flujo de estados completo (12) incl. ESPERANDO_FOTOS (exige archivo) y EN_CAMINO (envío+cajas).
- [ ] Pagos 50% / 100%. Subir y descargar archivo (JPG/PDF). Recepción parcial y completa.

### Productos (admin)
- [ ] Calculadora de precios (VE con tasas, CO sin). Precio sugerido ML. Códigos ML por cuenta.
- [ ] Crear producto (crea inventory + pricing). Editar (código inmutable). Ajustar precio (sin error ON CONFLICT).

### Tasas (VE, admin)
- [ ] Fetch BCV automático. Entrada manual. Ajuste % exceso. Historial.

### Reportes (admin)
- [ ] Ventas · Compras · Inventario · Stock (reposición/remate) · Top productos · En tránsito.
- [ ] Cambiar de pestaña **rápido** no deja pantalla en blanco (bug ya corregido).

### Dashboard
- [ ] Admin: tasa+spread, bono pipeline, gráfico, listas. Usuario: cards de ventas/recepciones.

---

## Día del corte

1. Avisar al equipo: hora del corte, URL nueva (:8502), que el legacy queda de respaldo.
2. Respaldo final de ambas DB.
3. Confirmar que :8502 está al día (`docker exec inventory_next ls public/logo.jpg`).
4. Dejar una terminal con `docker logs -f inventory_next` durante las primeras horas.
5. Todos empiezan a usar el nuevo. Nadie opera en legacy.

## Arrancar Colombia (CO) — pendiente, aún sin uso

La base `inventory_co` está **vacía** (0 tablas); el legacy tampoco la inicializó.
Mientras CO no se use, no pasa nada. **Antes de que alguien entre a Colombia** hay que
crearle el esquema, o el sistema dará error (login CO, productos, etc.).

Forma segura: clonar **solo el esquema** de VE (sin datos) hacia CO — ambas bases deben
ser idénticas:

```bash
# 1) Copiar SOLO la estructura (tablas + triggers, sin datos) de VE a CO:
docker exec inventory_db_ve pg_dump -U postgres -d inventory_ve --schema-only --no-owner \
  | docker exec -i inventory_db_co psql -U postgres -d inventory_co

# 2) Cargar los datos iniciales que CO necesita (idénticos a VE):
#    - profit_categories: ULTRA 101% · SUPER 91% · ALTO 81% · BIEN 71% · MEDIO 61% · BAJO 51% · REMATE 31% · MUERTE 11%
#    - usuario admin (admin / admin123)
#    (copiar estas filas desde VE o insertarlas a mano)

# 3) Verificar:
docker exec inventory_db_co psql -U postgres -d inventory_co -c "\dt"
docker exec inventory_db_co psql -U postgres -d inventory_co -c "SELECT name, profit_percentage FROM profit_categories ORDER BY display_order;"
```

`--schema-only` no copia ningún dato de VE; solo crea las tablas vacías en CO. Cero riesgo para VE.

> Nota: el backfill de `total_cost` (`UPDATE product_pricing ...`) **solo aplica a VE**.
> En CO no hace falta: el API ya calcula `total_cost` al crear/editar productos.

---

## Rollback (si algo grave)

- Mandar a todos de vuelta a **:8501** (legacy). Cero pérdida de datos (misma DB).
- Reportar el error encontrado para corregirlo antes del siguiente intento.

## Después (estabilización)

- [ ] Mantener legacy corriendo **≥ 2 semanas** como red de seguridad.
- [ ] Revisar logs diariamente los primeros días.
- [ ] Tras periodo estable, apagar legacy (`docker compose stop` del proyecto legacy) y, más tarde, desinstalar.
