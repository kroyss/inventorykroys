---
name: pagos-me
description: "Pagos MercadoEnvíos: en PRODUCCIÓN para SolucionesMC (10-10); versión para clientes sin inventario + código de conexión en STAGING (15-10, commits be1bf5f/d4995fe, mig 093) esperando OK"
metadata:
  node_type: memory
  type: project
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-19T16:18:10.385Z
---

Estado al 2026-10-10: prueba real OK. Primer "Traer" trajo 73 pagos (PIKEKE 35 de 171 vistas, SOLUCIONES_MC 38 de 175), todos con guía y comprobante; Chrome se abrió y cerró solo.

- Instalación en la PC "Asistente-MC" de Venezuela: `InstalarVigilantePagosME-<ver>.exe` (Inno Setup, `tools/vigilante-pagos-me/instalador/construir.ps1` → `tools/vigilante-dist/`). Pide clave y perfiles (PIKEKE=Profile 1, SOLUCIONES_MC=Profile 2), guarda en `%APPDATA%\VigilantePagosME\despertador.json` + HKCU\Software\VigilantePagosME (se conserva al actualizar). Queda en Aplicaciones; icono "ME" junto al reloj (verde/azul/rojo).
- Despertador (`despertador.ps1`) como el Radar: Chrome queda CERRADO; cada min pregunta `/api/pagos-me/vigilante/despertador`; con pedido abre cada perfil en `/vendedor/orden#vigilante`, la extensión (1.2.0) trabaja y cierra su ventana. Ojo: el instalador (32 bits) arrancaba PowerShell de 32 bits y no hallaba Chrome de 64 → se usa ProgramW6432 + App Paths (1.2.1).
- Sesión ME vencida: la extensión 1.2 entra sola con "Ingresar con mi cuenta de Mercado Libre" (`a.mercadolibre-btn`, pasa directo si el perfil tiene sesión de ML; nunca escribe claves).
- Filtro `faltan` (desde 2026-10-11): NO trae solo lo que ya está en Despachos (también por pack_id). La venta registrada y verificada a mano SÍ se trae: el pago entra 'valido' y su guía va sola al lote pendiente (`vigilante/orden` → `conectarVenta`).
- Rutina acordada 2026-10-11 (Wilmer): ventas y pagos a mano en Ventas; antes de Despachos → Pagos ME "Traer pagos y guías" y esperar el aviso verde "Listo"; NO descargar/subir guías a mano (si sube la carpeta, el sistema salta las que ya están en el lote). Horario auto: 06:05 (PC enciende 6:00), 12, 16, 19, L-S.
- `C:\selenium_profile_scraper` es del Radar: no tocar. El Reportador de guías se desinstaló de esa PC (ya se reporta vía web).

**Pendiente (13-10, para más tarde):** Wilmer vio 19 pendientes en el portal y 16 en el sistema. Lo traído estaba todo registrado: los 3 los descarta `leerOrdenes` del vigilante (sin comprobante ni guía, o sin número de venta deducible). Propuesto: que el vigilante informe las omitidas y el motivo en `fin` (requiere actualizar la extensión en la PC). Esperando los 3 números de Wilmer.

**Pendiente:** en 7 pagos por transferencia falta `banco_receptor` (otro campo del portal para transfer). El usuario verifica los 73 en Pagos ME.

**Why:** ahorra ~1 h diaria del equipo (pagos + guías + registrar venta).
**How to apply:** ajustes por staging → OK → prod; ver [[deploy-arrastra-main]], [[esperar-autorizacion]].

**Para clientes (2026-10-15, en staging, falta OK para producción):** decidido con el dueño: primero MercadoEnvíos SIN inventario, inventario simple después, opciones completas de a una. Mig 093 (me_codigos, me_claves, me_latidos.cuenta). Modo según `ventasDesdeML`: sin `despachos_ventas` la guía entra sola al lote de Despachos al llegar; el pago igual se verifica en Pagos ME antes de imprimir. Conectar: Pagos ME → "Conectar una PC" da código XXXX-XXXX (60 min, 20 usos); instalador 1.3.0 (`public/descargas/InstalarPagosME.exe`) pide solo el código; el despertador encuentra solo los perfiles de Chrome con la extensión. La PC de SolucionesMC (1.2.1, clave y perfiles fijos) sigue igual. Probado por API en staging con EmpresaPruebas (id 4, pagos_me prendido ahí); NO probado de punta a punta con Chrome en una PC. Para producción: backup + mig 093 + deploy. Pendiente sugerido: publicar la extensión en Chrome Web Store (no listada) para evitar "Modo de desarrollador".

**Chrome Web Store (2026-10-15):** paquete listo y en prod (commits 585982b/1563237): extensión renombrada "El Comerciante Digital · Asistente de envíos" 1.3.1, ZIP con `tools/vigilante-pagos-me/tienda/construir-zip.ps1`, ficha/permisos/privacidad en `tienda/FICHA.md`, capturas en `tienda/capturas`, política en app.elcomerciantedigital.com/extension/privacidad, /extension muestra carga a mano hasta que `TIENDA_EXTENSION_URL` (lib/pagosMEComun.ts) tenga el link. Cuenta de publicador creada (comerciantedigital.ve@gmail.com) pero PAUSADA: la verificación de comerciante publica nombre/dirección/teléfono en la ficha y el dueño solo tiene datos personales (no tiene negocio registrado). No recomendar declarar "non-trader". Retomar cuando tenga firma personal o datos comerciales; mientras, Fundadores con carga a mano acompañada por RustDesk.

**Actualización 2026-10-15 (tarde):** se decidió NON-TRADER (extensión gratis, sin ventas en la tienda; la ficha solo muestra el correo) y la extensión se ENVIÓ A REVISIÓN desde el publicador de syncsora.dev@gmail.com (ID e83745ee-…; correo de contacto comerciantedigital.ve@gmail.com, sin dirección), no listada, todas las regiones, publicación automática al aprobarse. El publicador de comerciantedigital.ve (dbb805fc-…) quedó sin uso. Al aprobarse: poner el link en TIENDA_EXTENSION_URL (lib/pagosMEComun.ts), desplegar y revisar con el dueño que la ficha no muestre datos personales.

**19-10:** PC de Venezuela pasada al camino oficial (extensión 1.3.5 de la tienda en PIKEKE y SOLUCIONES_MC + programa 1.3.6 con código). Programa 1.3.6 = descarga oficial (busca perfiles en cada pedido nuevo, pregunta cada 15 s con pedido en curso, sin casilla de la carpeta). Guía para Fundadores en Word: `tools/vigilante-pagos-me/guia/` (armar-guia.js, capturas/, NOTAS.md; faltan fotos: aviso verde Listo, ícono ME, paso 1 visto por un Fundador). Pendiente extensión 1.3.6 (revisión Google): quitar permiso `tabs` ("Leer tu historial"), sacar staging de host_permissions, "Conectado. Conectado" repetido; y en Pagos ME el doble punto "p. m..". SmartScreen: el aviso sale siempre sin firma (.zip igual); firmar o Microsoft Store, para más adelante.

**17-10:** extensión APROBADA en la Chrome Web Store (v1.3.1, "Publicado - no listado"), ID `iehjhdgelfpaijlpfcobjbaioakcgodo`. `TIENDA_EXTENSION_URL` puesto (7398e33): app.elcomerciantedigital.com/extension redirige a la tienda. v1.3.5 enviada a revisión el 17-10 (ZIP con tienda/construir-zip.ps1). Cada versión nueva: subir "version" en manifest.json, armar ZIP, Paquete → subir → Enviar a revisión.
