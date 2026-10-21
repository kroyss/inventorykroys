# Traspaso de contexto — El Comerciante Digital (estado al 20-10-2026)

> Para cualquier agente o cuenta que siga este proyecto. Léelo entero antes de tocar nada.
> La memoria detallada (una nota por tema) está en [`docs/memoria/`](memoria/) — empieza por `MEMORY.md`.
> El funcionamiento técnico general está en `D:\kroys_inventory\CLAUDE.md`.

---

## 1. Cómo trabaja el dueño (reglas firmes)

1. **Siempre en español.** Sin excepción.
2. **Proponer antes de implementar.** Ante un problema o comentario: diagnóstico + propuesta escrita **completa en el mensaje** (qué cambia, con ejemplos) y preguntar "¿lo armo?". No editar, commitear ni subir a staging sin su OK. El recuadro de cierre solo lleva la pregunta, nunca la propuesta.
3. **Staging primero, producción solo con frase explícita** ("pásalo a producción", "publícalo"). "Está bien, continúa" NO es OK para producción.
4. **Deploy arrastra main:** `./deploy.sh` publica todo `main`. Antes de cada deploy: `git log origin/main..origin/importar-ml` para ver qué se va; si hay cosas sin su OK, preguntar. Migraciones nuevas **antes** del deploy, con respaldo (`./scripts/backup-db.sh antes-XXX`).
5. **Revisar a fondo antes de producción** lo que toca flujos que ya funcionan (Despachos, Reportador, Pagos): diff completo, consultas reales en staging con `SET ROLE inventory_app` + `SET app.empresa_id`, dentro de `BEGIN … ROLLBACK`. "No quiero romper nada."
6. **¿Para todos o solo para mí?** Cada cambio: núcleo (todas las empresas) o solo SolucionesMC (módulo / inventario). Una sola base de código.
7. **Novedades:** cada cambio que noten los Fundadores → insertar BORRADOR en `novedades` al subir a producción (`INSERT INTO novedades (titulo, texto, modulo, enlace)` sin `publicada_at`) y avisarle. Textos cortos y simples. Lo exclusivo del dueño (inventario, Promociones, Plataforma, Pagos ME mientras ningún cliente lo tenga) no va.
8. **Privacidad de clientes:** nunca "revisé tu cuenta" ni cifras de sus datos en mensajes a clientes. Mirar datos solo para orientar al dueño.
9. **No abrir el navegador para verificar** por iniciativa propia (gasta tokens). Verificar con typecheck, SQL y logs.
10. **Commit y push los hago yo** (agente), con el trailer de coautoría. Rama de trabajo: `importar-ml`; producción = `main` (`git push origin importar-ml:main`).
11. Nunca `docker compose down` ni `prune --volumes` en el VPS. No esperar deploys con `pgrep -f` (se encuentra a sí mismo).

## 2. Infraestructura y deploy

- **VPS Contabo 85.239.249.43** (`ssh root@85.239.249.43`).
- **Producción:** `/opt/inventory_next` → `./deploy.sh` (rolling, dos copias `inventory_ecd` :8504 e `inventory_ecd_b` :8505). Base `inventory_db` / `inventory`.
- **Staging:** `/opt/inventory_staging` → `./deploy-staging.sh importar-ml`. Base `inventory_db_staging` / `inventory_multi`. En staging lo que habla con MercadoLibre NO funciona (tokens vencidos): lo de ML se prueba en producción.
- **Migración:** `docker exec -i inventory_db psql -U postgres -d inventory -v ON_ERROR_STOP=1 < db/migrations/1XX_….sql` (staging: `inventory_db_staging` / `inventory_multi`). Última aplicada en los dos: **110**.
- Typecheck: `npx tsc --noEmit -p .` · Lint: comparar contra lo que ya había (varios archivos tienen errores viejos de `react-hooks`).
- **⚠️ Desde el 20-10 ~16:30 el dominio pasa por Cloudflare** (registros A de elcomerciantedigital.com en *Proxied*, SSL Full). Motivo: caída de la red IPv4 de Contabo (el servidor seguía vivo). Ver `memoria/project_caida_ipv4_cloudflare.md`. La IP real del visitante viene en `cf-connecting-ip`. Pendiente decidir con el dueño si se queda así (probablemente sí).

## 3. Lo que se hizo esta semana (14 al 20-10)

**Despachos / Reportador**
- **En espera** (mig 107): botón junto a Historial (y "Apartar una guía…" en el Reportador). Apartar un envío = no entra al manifiesto ni lo reporta el Reportador. "Todavía no sale" o "No se enviará" (cancelado, con confirmación). Liberar = **"Sale en el próximo manifiesto"** (pregunta antes; si su jornada ya cerró, pasa a la jornada abierta en un lote "ya impreso" sin PDF). Aviso arriba, rojo a los 2 días y en Telegram. `lib/despachosApartados.ts`, `app/api/despachos/apartados`, `components/despachos/EnEspera.tsx`. La regla del Reportador es `SQL_PENDIENTE` (`lib/reportador.ts`), que ahora excluye apartados.

**Ventas (solo empresas con inventario = SolucionesMC)**
- **Corregir pedido** (mig 108, `venta_ajustes`): cambio de última hora sobre la misma venta ya procesada; inventario por la diferencia, costo/comisión congelados de lo nuevo, total recalculado, nota antes/después; aviso de factura emitida y "después de enviado". Acceso desde la venta y desde En espera.
- **Por confirmar:** buscador; botón **"🏦 Comprobar con el banco"** (cualquier usuario); línea del banco en cada venta y junto a "Verificar pago".
- **Nueva venta:** si el pago de MercadoEnvíos ya está verificado, no hay casilla: "✓ Pago verificado · por X" y se procesa al guardar ("No procesar todavía").

**Comprobador de pagos con el banco** (`lib/conciliacionBanco.ts`, mig 110 `me_pagos.banco_*`)
- El cruce corre en el navegador; los estados de cuenta no se suben al servidor; solo se guarda el movimiento que le corresponde a cada pago.
- Bancos: Bancamiga, Banesco, Mercantil (referencia + monto), Provincial (sin referencia: banco de origen + monto + fecha), Plaza (formato leído, cruce sin probar con pagos reales). **Banco de Venezuela fuera** (no exporta).
- Embalaje opcional: un pago está bien si llegó hasta +margen (700 Bs, `app_settings.conciliacion_margen_embalaje`). Varias ventas con la misma referencia se suman.
- Niveles: seguro / probable / revisar / no_aparece / sin_estado. Nada se aprueba solo.
- Muestra "Ya en Ventas · Borrador → Abrir venta" si la venta ya está cargada.

**Vincular con ML** (mig 109): pantalla `/vincular-ml`; cada variante (color/modelo) = un producto. Todo manual con clic (la sugerencia es texto + "Sí, es este" con confirmación; NO vincular gemelas ni limpiar códigos en lote sin OK). Empleados con permiso `vincular_ml` (pestaña "Vincular ML", sin precios); el dueño entra por Productos. Dudas: "No sé, para Marcos".

**Plataforma (solo el dueño)**
- Clientes: a la vista solo los que pueden entrar; inactivos plegados con motivo y "Reactivar"; Pausar; Historia (mig 106 `organizacion_eventos`). Hoy, Fundadores y Cursos sin inactivos. "Qué usa" con Telegram y Pagos ME.
- **Cortes de Fundadores** por tanda (`lib/fundadoresCortes.ts`): corte 1 corrió el 19-10 23:00 (salieron 11). **Corte 2: domingo 25-10 23:00** para los creados del 19 al 23-10 sin MercadoLibre (hoy: INVERSIONES VILROD, Ainy Chicz, FERRE FERMANCA). Desde el sábado 24: sin corte definido.

**Otros**
- Mensajes: quién mandó cada mensaje; nota de la venta visible al instante ("✓ guardada").
- Promociones: varias campañas seguidas en la misma ventana.
- Calificaciones: ventas que ML ya no deja calificar ("order has expired") salen de la lista (`cal_vendedor = 'cerrada_ml'`).
- Facturas: corregir ("¿Salió mal?"), membrete por empresa. Etiquetas de inventario (Code 128). Tablas de envío ZOOM/TEALCA en Ajustes. Espacio renombrado a "Automatiza".
- Pagos ME: programa 1.3.6 oficial; extensión de Chrome publicada (no listada); versión para Fundadores sin inventario (apagada; solo SolucionesMC tiene el módulo).

## 4. Pendientes

1. **Banco Plaza:** el dueño debe pasar un estado de cuenta **con pagos recibidos** (el primero solo traía 2 débitos) para probar el cruce y reconocer el banco solo.
2. **Cloudflare:** decidir si queda Proxied. Si queda: revisar cualquier lógica por IP; uploads ≤100 MB; webhooks de ML/Telegram y programas de la PC pasan por Cloudflare (ya probado que responden).
3. **Corte 2 (25-10 23:00):** después del corte, si no hay un corte 3, proponer borrar el aviso temporal (`AvisoCorte.tsx`, `corteQueLeToca`).
4. **Novedades en borrador** que el dueño publica: «Mensajes» (nota al instante, id 22) y «Calificaciones» (id 23).
5. Ideas aparcadas (no hacer sin OK): mejora del comprobador para varias ventas del mismo comprador; recordatorio de calificación; bloquear compradores (la API de ML no lo permite); reimprimir etiqueta corregida.
6. **Vincular con ML:** el dueño se equivocó 2 veces por el botón grande (ya corregido). Deshecha la Capturadora (COD-0079); falta que diga cuál fue la otra (posibles: Ruedas COD-0552, Hub COD-0168, Higrómetro COD-0170).

## 5. Gente y empresas

- **Dueño:** Marcos (kroys). Empresa **SolucionesMC VE** (id 1, con inventario). Empleados: **wilmer**, **jose**.
- **Fundadores** (clientes, sin inventario): p. ej. **BUYBOOK_SHOP** (Beto, empresa 14, calificación automática a las 7:00), SHOPIT_VE (Gerardo), RUBENPICO, CONTAORIENTE91, PANDA PARTS, Maikel, TECHNOSMART…
- Soporte por Telegram: https://t.me/elcomerciantedigital
