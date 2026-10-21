---
name: project-despacho-ml-api
description: Idea de producto vendible (etiquetas/guías/mensajes ML VE) y hallazgos de la prueba OAuth con la API de MercadoLibre Venezuela
metadata:
  node_type: memory
  type: project
  originSessionId: 1b751e9a-f7ec-4a71-aa5c-72f882407443
  modified: 2026-09-26T03:41:44.105Z
---

Idea (2026-09-25): convertir los scripts de etiquetas (EtiquetasML/Manifiesto/UnirGuias/Reportador en `D:\Script Etiquetas Venezuela`) en producto web vendible para la comunidad (~100 personas); inventario simple como upsell con módulos apagables, no como requisito. Laboratorio en `D:\Despacho_ML_Lab` (ver [[feedback-no-tocar-lo-que-funciona]]).

Hallazgos de la prueba OAuth (2026-09-25, cuenta PIKEKE id 79115329):
- App "Auto Envios Venezuela" (Client ID 1842120826783858) creada con cuenta de COLOMBIA autoriza cuentas MLV sin problema → los clientes NO necesitan cuenta developer, solo "Autorizar".
- Redirect URI registrada: `https://inventory.syncsora.com/login` (pública, fuera del middleware). PKCE desactivado en la app.
- API da órdenes con productos/cantidades (reemplaza datos.xlsx). seller_sku vacío.
- En MLV TODAS las órdenes vienen `not_paid` + `shipping.id = null`: pago (Pago Móvil) y envío ZOOM van por fuera de la API → la guía/etiqueta NO sale por API; los PDFs siguen siendo necesarios.
- Mensajería post-venta: lectura OK; ENVÍO por API OK (2026-09-25, HTTP 201, moderación "clean", aun con venta not_paid) → Selenium reemplazable.
- Flujo real del usuario: etiquetas se bajan de un portal aparte de Mercado Envíos VE, en LOTES a demanda (ej. 16h, 20h, 7h, 10h); por lote: datos.xlsx+EtiquetasML+UnirGuias; al CIERRE de jornada: Manifiesto + Reportador. Diseño: "Nuevo lote" (PDFs→PDF imprimible) + "Cerrar jornada" (manifiesto+mensajes).

DECISIÓN (2026-09-25): el usuario deja la API de ML FUERA de este ciclo (fricción de que cada cliente autorice + API limitada en VE). El SISTEMA es el registro final (compradores cambian cantidades/agregan productos por chat; NOTA y nombre interno son clave). Multi-cuenta ML (2-3 por vendedor) debe soportarse. Plan sin API: subir PDFs al sistema → cruza con ventas del sistema (producto interno + nota) → PDF imprimible (EtiquetasML+UnirGuias); cierre de jornada → manifiesto; Reportador sigue Selenium local por ahora.

FASE 0 OK (2026-09-25): `D:\Despacho_ML_Lab\fase0\despacho_core.py` (funciones copiadas de etiquetas_ml.py, entrada bytes+dict, salida bytes) vs script original sobre 1022 etiquetas reales de sept: 256/256 páginas idénticas pixel a pixel; 3 códigos por etiqueta (2 Code128 + DataMatrix) legibles 1022/1022 a 300 dpi en ambos. A 203 dpi el Code128 corto (10 hex) falla igual en ambos (propiedad del formato actual, no regresión). El script original falla con >~500 etiquetas por lote ("Too many open files"); el núcleo nuevo abre desde memoria y no tiene ese límite.

EN PRODUCCIÓN (2026-09-25): módulo Despachos (commits 8117efc, 1ff7cf4, 15c45f7) — servicio `inventory_etiquetas` + migración 022 aplicada en VE/CO. Probado en prod con 4 guías viejas (jornada 1, reimpresiones): PDF escaneado OK, manifiesto OK, CSV formato OK (test revertido). Flujo: lotes y cierre en el sistema; solo el Reportador sigue local con el CSV bajado del sistema. Pendiente: Fase 4 (Reportador lee cola del sistema y reporta resultados); luego multi-cliente para vender. A) y búsqueda de B) HECHOS por otra sesión (commit 716f644, /despachos/historial). Facturación también se hizo en otra sesión (migraciones 023/024) — ojo con la numeración de migraciones: revisar `ls db/migrations` antes de crear una. Reportador conectado = migración 025. Propuesta original: A) historial de jornadas cerradas con ↓PDF por lote + paginación (hoy solo últimas 15, sin PDFs de lotes cerrados); B) buscador por venta/guía para reimprimir una etiqueta o bajar el original; C) respaldo de uploads/despachos (backup-db.sh solo respalda DBs y en el mismo VPS) + zip mensual descargable.

Reportador conectado subido (commit 55fd720, migración 025; exe en D:\Despacho_ML_Lab\ReportadorConectado). Pendiente: prueba real en mote; luego instalador + descarga desde el sistema + auto-update + firma. Módulo Usuarios hecho (commit 669fba7 en rama feat/usuarios, migración 026 session_version; cierra sesiones al desactivar/cambiar clave). SIGUIENTE: multi-empresa — el usuario quiere repartir PRONTO a un grupo chico de vendedores externos con cuentas y bases de datos propias.

PRODUCTO VENDIBLE (2026-09-25): plan acordado = piloto cerrado 10-15 personas de la comunidad, 30 días gratis con plan Básico (Productos simple, Inventario, Ventas, Compras locales, Despachos + Reportador), luego precio fundador; instalación aparte de la operación propia (multi-empresa por schema). El Reportador es "el gran plus": debe ser funcional y claro desde el día 1. El RADAR (otro proyecto del usuario) queda como complemento futuro, NO ahora: primero pulir esta idea.

**How to apply (idea API, en pausa):** diseño propuesto: el usuario sube los PDFs → se extrae VENTA → se consultan productos por API (`/orders/{id}`) → sin Excel. Mensaje con la guía por API en vez de Selenium.
