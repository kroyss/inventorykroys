---
name: project-comerciantedigital-multiempresa
description: "Plan 2026-09-30 de llevar el inventario a clientes en comerciantedigital.com; opción B (base compartida + empresa_id + RLS), solo VE, Despachos+Reportador como gancho"
metadata:
  node_type: memory
  type: project
  originSessionId: 36603bf2-6af8-43fe-88b1-558307eec3b7
  modified: 2026-09-30T16:02:32.426Z
---

Decisión del usuario (2026-09-30): el mismo código de `migracion/` (Syncsora Inventory) se ofrecerá a clientes vendedores de Mercado Libre en **comerciantedigital.com** (dominio por comprar), junto al Radar (`D:\AnalisisMercadoML`, radar.syncsora.com).

- **Separación de clientes: opción B** — una base compartida con `empresa_id` en todas las tablas + Row Level Security de Postgres. Descartada A (base por cliente) por no escalar a 50–100 clientes (conexiones, migraciones ×N).
- El usuario quiere que SUS datos (VE/CO actuales) vivan en esa misma base desde el inicio: un solo sistema para todos. Orden acordado: su negocio se migra PRIMERO como empresa #1 (ensayo en staging con copia de sus datos, bases viejas quedan de respaldo) y recién después entran clientes. Por eso la empresa necesita país (VE y CO, este último con pesos+TRM) desde el día uno.
- Modelo confirmado: organización (SolucionesMC) → varias empresas (SolucionesMC VE, SolucionesMC CO); un usuario accede a varias y cambia sin salir. Dominio `elcomerciantedigital.com` (app. y radar.). Clientes los crea el usuario; cobro fuera del sistema por ahora. Plan en el doc https://claude.ai/code/artifact/4e76f8ea-a970-4343-837c-8bf706e3c5f4 . El usuario pidió MUCHO cuidado con los riesgos (aislamiento, migración, deploys): son condiciones de paso.
- Personalizaciones pagadas: nunca código aparte por cliente. Se construye como módulo general y se prende/apaga por empresa (flags/planes).
- **Clientes: solo Venezuela** (sin el modelo CO pesos+TRM).
- **Módulos para clientes:** núcleo (inventario, productos, ventas, compras, dashboard/reportes) + **Despachos y Reportador** como gancho comercial (unión de guías 4×hoja + mensaje de guía al comprador).

**Why:** un solo código para su negocio y para clientes; cada mejora llega a ambos.
**How to apply:** al diseñar cambios de esquema pensar en `empresa_id`; no hardcodear datos de su negocio (cuentas PIKEKE/SOLUCION-MC, remitente, bonos, marca Syncsora). Relacionado: [[feedback-commit-push-yo]], [[project-despacho-ml-api]].

Avance 2026-09-30: etapa 1 (staging) y 2 (esquema, 94/94 controles) listas; etapa 3 en rama `multiempresa` desplegada en staging (lib/db.ts dbGlobal/dbEmpresa, sesión con empresa, módulos por empresa, tasas solo dueño plataforma). Pendiente: exceso % por empresa, pantalla de alta de clientes, ensayo de migración real (etapa 4).
Idea del usuario (pendiente de decidir): cuentas únicas para todo El Comerciante Digital (inventario + Radar + lo que venga), con acceso por producto. Propuse: `users` global del inventario como identidad central + accesos por producto, login único con cookie en .elcomerciantedigital.com; hacerlo DESPUÉS de cerrar multiempresa.
Pendiente (usuario 2026-09-30): revisar opciones/pantallas que son muy particulares de SolucionesMC (bonos, remitente, cuentas ML fijas, textos) antes de mostrarlas a clientes; 'lo vemos después'.
CAMBIO HECHO 2026-09-30 ~19:30 (hora server): producción corre en base compartida `inventory_db`/`inventory` (rol inventory_app, RLS), merge de `multiempresa` a main (tag `pre-multiempresa` = b9ff777 para volver). Bases viejas inventory_db_ve/co intactas (respaldo 30 días). Staging ahora en main, base inventory_multi, refrescar copia de inventory_db. Pendiente: verificar cron tasas + respaldo 3:30 del 01/10; etapa 6 (app.elcomerciantedigital.com para clientes); revisar opciones propias de SolucionesMC; cuentas únicas con Radar; contraseña débil de las bases viejas en /opt/inventory_web.
Decisiones 2026-09-30 (tarde): cuentas únicas = entrar con USUARIO (el correo solo se registra para recuperar clave); el Radar pasa a pedir usuario. kroys = admin del Radar (se une con su gmail; vale la clave del inventario). El otro usuario pro del Radar: cuenta central con usuario derivado del correo, su misma clave. Dominios: inventario.elcomerciantedigital.com (contenedor inventory_ecd, MARCA=ecd), radar.elcomerciantedigital.com; `app.` reservado para un portal futuro. Idea nueva: central de preguntas/respuestas de ML con IA → módulo `preguntas` dentro del mismo sistema (verificar primero que la API de respuestas funcione en MLV; los mensajes post-venta NO funcionan por API en MLV).
Producción tiene migración 031 (ml_cuentas; códigos 'MC' → 'SOLUCIONES_MC').
Dominio único (2026-09-30 noche): todo se usa en app.elcomerciantedigital.com (inventory_ecd). inventory.syncsora.com → 301 al nuevo, salvo /api/ (Reportadores viejos). Cron de tasas ya llama al dominio nuevo (backup de crontab en /opt/backups/crontab.antes-dominio). Reportador 1.3.0 migra solo su config al dominio nuevo. Radar: falta DNS `radar` para pasarlo a radar.elcomerciantedigital.com y redirigir radar.syncsora.com.
