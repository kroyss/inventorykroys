# Análisis de Mercasist y plan de mejoras

> Revisión hecha el 07-11-2026 con la cuenta VAPERK conectada a Mercasist (prueba), en solo lectura (no se guardó ni se envió nada), más los 106 tutoriales de docs.mercasist.com. Sirve para no perder el contexto: qué tienen ellos, qué tenemos nosotros, qué conviene traer y en qué orden.
> **Nada de esto está aprobado para implementar.** Cada fase necesita el OK del dueño antes de tocar código (regla: proponer → OK → staging → OK → producción).

---

## 1. Qué es Mercasist

Sistema venezolano "multicanal": MercadoLibre, WhatsApp (API oficial de Meta), Instagram, Cashea, tienda web propia, Odoo, catálogo de Facebook, WaStore y Yummy. Logística propia en Caracas (retiros, motorizados, envíos nacionales por MRW/Tealca/Zoom/Domesa). Manual muy completo (21 módulos, 106 tutoriales con capturas). Mitad de las pantallas siguen con el diseño viejo (Bootstrap) y la otra mitad con uno nuevo, más limpio.

### Precio
| Concepto | Mercasist |
|---|---|
| Base | 2 % de las ventas, tope USD 100 + USD 10 por cuenta ML o Cashea (VAPERK ≈ USD 110/mes) |
| IA | Prepago: USD 0,01 por pregunta respondida, USD 0,02 por mensaje ML; regalan USD 5 en la prueba |
| WhatsApp / Instagram | USD 20 c/u (cubiertos por la comisión) |
| Prepago del plan | −10 % trimestral, −20 % semestral, −30 % anual |
| Medios de pago | Transferencia/Pago Móvil, PayPal, Zelle, Binance |
| Pantalla "Servicios" | "Va corriendo USD X" contra "Tope máximo" |
| Morosidad | Aviso ámbar con facturas y "vence en N días"; vencida → cuenta suspendida (deja de sincronizar ML), se reactiva sola al pagar |

---

## 2. Inventario de módulos (lo que se vio)

### Inicio / Dashboard
- Período 7d / 30d / 90d / 1 año, con comparación contra el período anterior.
- KPIs: órdenes, preguntas (con **tiempo promedio de respuesta**), visitas ML, visitas tienda.
- Evolución de ventas (actual vs anterior), ventas por canal (dona), **embudo de conversión** (visitas → preguntas → respondidas → ventas), visitas y preguntas por día, top productos, categorías.
- "Primeros pasos": "1 de 3 pasos · 33 %" + días de prueba que quedan (WhatsApp de soporte y alertas, saldo IA, horarios IA, mensajes IA, Telegram).

### Órdenes
- Tarjeta por orden: "Finaliza en 6d 22h", canal, Id ML, envío, total en Bs, ítems en Bs y USD, nick y puntos del comprador, teléfono con enlace a WhatsApp, editar teléfono/email, Tag, "Disponibilidad".
- Menú por orden (más de 30 acciones): agregar pago (varias formas), plan de cuotas, pago desde balance, retiro en tienda, dirección, imprimir etiqueta, rastreo, facturar (1 paso / editable / cargar), calificación, checkout, copiar URL, marcar pagada/enviada/entregada, notas, mensajes, editar, refrescar, imprimir.
- "Crear nueva orden" manual.
- Filtros: estatus, MercadoPago, MercadoEnvíos, Cashea Envíos, reporte de pago, notas, retiro.
- Configuración: días de vigencia, mensaje inicial de WhatsApp con variables, moneda USD para ML, finalización por estado, facturación automática al llegar a un estado, sincronizar notas con ML.
- **Calificación automática**: concretadas / no concretadas, **replicar positivas**, correo por cada calificación y **aviso si llega una contradictoria**.
- Compradores premium (nick + descuento). Métodos de pago (nombre, moneda, logo, instrucciones).
- **Pagos y Caja**: pago por orden con **"Autocompletar con IA" (lee foto/PDF del comprobante: monto, fecha, referencia, sugiere el método por el banco)**; plan de cuotas; anular sin borrar; caja abierta agrupada por persona y método; cierre de caja con histórico; opción "registrar ingreso en balances". Permisos separados: registrar cobros ≠ cerrar caja.
- **Tasa USD propia** (distinta de BCV) solo para variables de mensajes: `%tasa_usd%`, `%precio_bs_tasa_usd%`, `%total_bs_tasa_usd%`…

### Extensión MEV (pagos de MercadoEnvíos)
- v0.7.0, se instala **desde un ZIP en modo desarrollador** (no está en la tienda de Chrome).
- Token por cuenta, revocable. Revisa cada 15 min, cada 2 min con el portal abierto. Ícono "ON". **No instala programa de Windows.**

### Preguntas
- Pendientes / Respondidas.
- IA: saldo, **prompt por cuenta** con variables (`%titulo% %enlace_ml% %precio% %precio_divisa% %disp% %garantia% %marca% %modelo% %sku% %nick_ml% %fecha% %hora% %tasa_bcv% %tasa_usd%`…) y **cálculos** `{%precio% * 0.9}`; "cláusula" recomendada y **"frase de escape"**; recuperar borrador.
- Análisis de imágenes.
- **Límite de respuestas por comprador en 24 h**.
- **Condiciones de detención** en texto libre (si se cumple, pausa a ese comprador 6 h).
- **Horarios por cuenta** (cuándo responde la IA).
- **Textos predefinidos con abreviaturas** (`%sitengo%`, `%norebaja%`) que se expanden.
- Saludo y despedida automáticos con `%nick%`.

### Mensajes ML con IA (por cuenta)
- Prompt con variables de la orden (`%nombre_comprador% %lista_articulos% %total_bs% %enlace_checkout% %envio_rastreo%`…).
- **Documentos de consulta**: información larga que la IA lee solo cuando la necesita.
- Horarios. Control **Preciso ↔ Creativo**. Condiciones de parada + tags al parar. **"Reactivar IA sola después de X horas"**.

### Mensajería / Plantillas y automatizaciones
- Centro de mensajes: lista con orden, cuenta y no leídos; chat con registro ("conversación abierta por…"), adjuntos, plantillas, notas internas, tags.
- **Plantillas**: cada una con pestañas ML / WhatsApp-IG / Email, variables, adjuntos hasta 5 MB, se pueden limitar a ciertas publicaciones.
- **Disparadores**:
  - *Eventos*: nueva orden, pago recibido, envío cargado, tag asignado, calificación concretada, logística… con retraso de 5–60 min.
  - *Recordatorios*: repite mientras la orden siga en un estado; días y horas (7am–9pm); desde 1–30 días después.
  - *Respuestas automáticas por reglas*: primer mensaje, primero tras 24/48/72 h, texto exacto, palabras clave.
- Plantillas que vienen hechas: Confirmación de pago, Nueva orden recibida, Recordatorio de compra.
- Bot de Telegram @mercasist_bot por QR. Notificaciones del navegador: órdenes nuevas, preguntas pendientes, mensajes ML, mensajes WhatsApp.

### Publicaciones
- Tarjetas: precio USD, divisas, disponibilidad, SKU, peso, tipo, tienda, descripción, garantía, asociaciones con inventario, notas, nº de órdenes.
- **Edición masiva por Excel** (solo necesita columna Id o SKU) con historial de tareas y resultado por fila.
- Publicación masiva por Excel (prueba: máx. 20).
- **Factor de corrección de precios**: % sobre el precio en USD, elegir origen (cuentas), **Analizar → vista previa antes/después (solo los que cambian) → Confirmar**, se procesa en segundo plano y recuerda el último %.
- **Catálogo PDF**: logo, datos de la empresa, con o sin precio, elegir publicaciones.
- Variaciones, promociones ML, descripción.

### Inventario
- Artículos con filtros, categorías, hasta 10 imágenes.
- Reglas de descuento de stock (evento + estado + tags + origen + almacén).
- **Almacenes y anaqueles** (regular o compuesto = suma de otros), transferencias entre anaqueles, entradas/salidas, historial.
- Proveedores, reposiciones, Excel, Odoo (precio y stock).

### Contabilidad y facturación
- Balances por moneda con etiquetas, carga por lote, Excel.
- Facturas y presupuestos: Cliente → Artículos → Emitir; ítem libre, USD/Bs, referencia. Configuración de página (media carta/carta/oficio), encabezado con imagen, campos del cliente, formas de pago, pie.

### Compradores (CRM)
- Nombre, cédula, nick ML, contactos, ubicación; reporte; nuevo comprador. Asociar comprador a WhatsApp.

### Checkout (el comprador reporta su pago)
- Pago (fecha, método, banco, monto, referencia), facturación (cédula/RIF, nombre, dirección), envío (nombre, cédula, dirección, ciudad, estado, teléfonos, observaciones).
- Métodos de envío (encomiendas), PayPal, sucursales para retiro.

### Tienda web
- General, dominio propio, apariencia, catálogo, contacto, integraciones, enlaces. Etiquetas de precio imprimibles. Incluida sin costo extra.

### Otros
- Almacén de archivos 500 MB con enlaces. Reportes Excel (órdenes, envíos, checkout, compradores, publicaciones, inventario).
- **2FA por código de WhatsApp**. Reporte de desempeño por correo (diario/semanal/mensual). **Borrar cuenta con 12 h para arrepentirse**.
- Operadores ilimitados con código + clave y permisos por módulo. Token de API con documentación.
- **Panel "Avisos de tu cuenta"** arriba de cada sección: saldo deudor, cuenta suspendida, **cuenta ML inactiva (botón Solucionar → reconectar)**, cuenta en eliminación. Máximo 3 visibles + "Ver N más", rojos primero, se pliega (lo recuerda) y se abre solo si llega un rojo.

### Manual (docs.mercasist.com)
- 106 tutoriales en 21 módulos, autor y fecha de actualización, visitas, índice "En esta página", recuadros Consejo / Importante / Precaución, **tabla resumen de pasos al final**, anterior/siguiente, "más consultados", buscador, FAQ.

---

## 3. Lo que hacemos MEJOR (mantener y comunicar en /precios y /inicio)

1. **Despachos**: etiquetas y guías en lote, y ahora **Costos ML** (lo calculado por peso contra lo que factura ML). Ellos: "imprimir etiqueta" por orden.
2. **Pagos ME**: extensión **aprobada en la Chrome Web Store**, comprobador con el banco (BDV), Por confirmar. Ellos: ZIP en modo desarrollador.
3. **IA**: v2 con verificador y contradicciones, fotos leídas una vez, **Mi IA** (cuestionario, prellenado, prueba con 10 reales). Ellos: prompt libre + control de creatividad, sin verificación.
4. **Calificaciones y Reputación**: pedir calificación, plazo, cambios de calificación, seguimiento de reputación.
5. **Ganancia real**: márgenes, "lo que realmente te queda", tope de descuento por MercadoEnvíos, Finanzas.
6. **Compras e importaciones** con estados y pagos 50/100, recepción, **conteos físicos** con reincidentes, bonos.
7. **Promociones ML** (editar campañas), **Vincular con ML**, **combos**, **Radar**.
8. **Ayuda con IA + Soporte con capturas** dentro del sistema, Novedades, Central de aprendizaje.
9. **Telegram**: avisos más completos que su bot.
10. **Precio fijo y bajo** (USD 8–35) contra 2 % de las ventas. **Un solo diseño** y menos opciones.

### Lo que ya tenemos y en el primer informe parecía faltar
| Idea de ellos | Lo nuestro que ya existe |
|---|---|
| Mensaje al llegar una orden | **Mensaje al comprar** (mig 118, `lib/mensajeAlComprar.ts`) |
| Recordatorio de compra/pago | **Recordatorios de pago** (mig 088, `lib/recordatoriosPago.ts`) |
| Calificación automática | `lib/calificacionesAuto.ts` (concretadas + no concretadas opcional) |
| Ctrl+K | `components/layout/CommandPalette.tsx` |
| Avisos de la cuenta (prueba/plan) | `components/layout/AvisoCuenta.tsx`, `Avisos.tsx` |
| Respuestas automáticas por reglas | Respuestas automáticas de Preguntas (plan A–D) |

---

## 4. Lo que conviene traer o mejorar (ajustado a nuestro sistema)

Cada ítem dice **dónde vive en lo nuestro** y si es para todas las empresas (núcleo) o solo para el dueño.

### Fase 1 — Rápidas y de alto impacto (1–3 días c/u)
| # | Qué | Dónde en lo nuestro | Para |
|---|---|---|---|
| 1.1 | **Variables en respuestas rápidas** (Preguntas y Mensajes): `{nombre}`, `{precio}`, `{precio_bs}` a BCV del día, `{tasa_bcv}`, `{stock}`, `{enlace}`. Hoy son texto fijo (`lib/mensajesRapidos.ts` dice "sin variables"). Ya existe `{nombre}`/`{producto}` en Mensaje al comprar: reutilizar el mismo reemplazador. | Preguntas → Respuestas rápidas · Mensajes → Respuestas rápidas | Todas |
| 1.2 | **Aviso "cuenta de ML desconectada"** arriba de todas las pantallas, con botón **Reconectar** (hoy solo se ve entrando a Cuentas de ML). Mismo lugar que `AvisoCuenta`. Incluye a TECNOVA (permisos viejos → "Reconectar para activar todo"). | `AvisoCuenta.tsx` | Todas |
| ~~1.3~~ | **DESCARTADO 07-11 (queda solo el trimestral −10 % que ya existía)** · Descuento por prepago en Mi plan: 3 meses −10 %, 6 meses −20 %, 12 meses −30 % (porcentajes a definir). Cobros ya maneja aprobación manual. | Mi plan · Plataforma → Cobros | Todas |
| 1.4 | **"Desconectar" también revoca en ML** (hoy solo borra los tokens nuestros). | Cuentas de ML | Todas |

### Fase 2 — IA más segura y controlable (3–5 días)
| # | Qué | Dónde | Para |
|---|---|---|---|
| 2.1 | **Horario de la IA automática** por empresa (ej.: solo de 7pm a 8am y fines de semana). | Mi IA / Automatizaciones | Todas (las que tengan IA) |
| 2.2 | **Tope por comprador**: máx. N respuestas automáticas por comprador en 24 h; si pasa, queda para una persona. | Preguntas IA · Mensajes IA | Todas |
| 2.3 | **"Frase de escape"**: cuando la IA no está segura, en vez de callar responde un texto seguro escrito por la empresa ("Déjame confirmarlo y te respondo"). Ojo: v2 hoy frena, decidir si conviene. | Mi IA | Todas |
| 2.4 | **Documentos de consulta**: textos largos (garantía, envíos, políticas) que la IA lee solo si la pregunta lo necesita (menos créditos que meterlo todo en el prompt). | Mi IA | Todas |

### Fase 3 — Cobros: leer el comprobante con IA (3–4 días)
| # | Qué | Dónde | Para |
|---|---|---|---|
| 3.1 | **Subir foto/captura del pago** (la que manda el comprador) → la IA saca banco, monto, fecha y referencia y busca la coincidencia en lo traído del banco/Pagos ME. Ya leemos fotos con IA (mig 146). | Ventas → Por confirmar · Pagos ME | Primero solo SolucionesMC, luego todas |

### Fase 4 — Mensajes por evento (amplía Mensaje al comprar) (4–6 días)
| # | Qué | Dónde | Para |
|---|---|---|---|
| 4.1 | Además de "al comprar", mensajes opcionales en: **pago confirmado**, **guía generada/despachado** (con número de guía), **entregado**. Mismas reglas de Mensaje al comprar (apagado por defecto, una vez por venta, no pisar conversación, no repetir texto para no chocar con ML). | Mensajes → Mensaje al comprar (pasa a "Mensajes automáticos") | Todas |

### Fase 5 — Inicio con números que venden el sistema (3–4 días)
| # | Qué | Dónde | Para |
|---|---|---|---|
| 5.1 | **Embudo**: preguntas recibidas → respondidas (y cuántas por IA) → ventas, con **tiempo promedio de respuesta** y comparación con el período anterior (7/30/90 días). Visitas solo si la API de ML las da por publicación (verificar). | Automatizaciones → Inicio | Todas |
| 5.2 | **Resumen semanal por Telegram** (lunes): ventas, preguntas, tiempo de respuesta, reputación. | Mis avisos | Todas |

### Fase 6 — Productos y precios (cuando haya OK, 4–7 días)
| # | Qué | Dónde | Para |
|---|---|---|---|
| 6.1 | **Subir/bajar precios en lote con vista previa** (Analizar → tabla antes/después → Confirmar) y, si está vinculado, mandarlo a ML. | Productos | Inventario |
| 6.2 | **Edición masiva por Excel** (bajar → editar precio/stock/peso → subir, con resultado por fila). Hoy existe solo para pesos en MercadoEnvíos. | Productos | Inventario |
| 6.3 | **Catálogo PDF** (logo, con/sin precio, elegir productos) para mandar por WhatsApp. | Productos | Inventario |

### Para más adelante (solo si los clientes lo piden)
- Caja del día y cierre (ventas LOCAL / tienda física).
- Aviso si llega una calificación contraria a la nuestra (va con Reputación).
- Abreviaturas que se expanden al escribir (`/sitengo`).
- 2FA y borrar cuenta con plazo para arrepentirse.
- Manual con formato de tutorial: índice, recuadros Consejo/Importante, tabla resumen de pasos (aplicable a `docs/ayuda/sistema.md` y al PDF).
- CRM de compradores (cuidado con la privacidad), presupuestos imprimibles, almacenes/anaqueles.

### NO copiar
- Cobro del 2 % de las ventas.
- Logística propia (retiros, motorizados, almacén).
- Extensión por ZIP en modo desarrollador.
- Tienda web, WhatsApp/Instagram oficial, Cashea, Odoo, catálogo de Facebook (grandes, caros, fuera de foco hoy).
- Pantallas con 3–4 pestañas de configuración y menús de 30 acciones.

---

## 5. Menú: lateral (ellos) vs horizontal (nosotros)

| | Mercasist | Nosotros |
|---|---|---|
| PC | Menú lateral fijo con todos los módulos (muchos). | Barra horizontal con dos espacios (Inventario / Automatizaciones), 8–9 secciones cada uno, más Ctrl+K. |
| Celular | No se probó en celular (solo PC). Un menú lateral en celular suele quedar como "hamburguesa". | Barra inferior con 4 íconos + "Más" (`BottomNav.tsx`). |

**Conclusión:**
- **Celular: el nuestro es mejor.** La barra inferior queda al alcance del pulgar y muestra lo más usado sin abrir nada; la hamburguesa esconde todo.
- **PC: hoy el horizontal alcanza**, porque cada espacio tiene ≤ 9 secciones. El lateral gana cuando hay muchos módulos (por eso ellos lo necesitan). Si seguimos sumando secciones (Costos ML, Finanzas, Radar…) y la barra empieza a no entrar en pantallas de 1366 px, pasar a **lateral plegable agrupado** (Ventas · Automatizaciones · Inventario · Dinero · Configuración).
- Mejora barata ya: verificar que la barra horizontal no se corte en 1366 px con todos los módulos prendidos y con nombres largos.

---

## 6. Estado

- 07-11-2026: informe hecho.
- 07-11-2026, decisiones del dueño:
  - **Fase 1 aprobada** (variables en respuestas rápidas, aviso ML desconectada, desconectar revoca en ML).
  - **Prepago 6/12 meses: NO** (se hizo y se revirtió el mismo día). Se queda solo el trimestral −10 % que ya existía: si el vendedor sube de ventas tiene que poder subir de escalón/plan, y un pago largo lo congela.
  - **Fase 2 aprobada**: horario de IA (de fábrica sin horario), tope por comprador (3 en 24 h), frase de escape SOLO en Mensajes, Mi IA suma temas: cambios y devoluciones, horario de atención, precio al mayor, regateo, apartar/reservar, información extra libre por secciones (originalidad/procedencia NO).
  - **«Responder todo»** (frase de escape también en Preguntas, opcional y apagado): para MÁS ADELANTE; sin él quedan nuestros frenos actuales.
  - **Fases 3 (comprobante con IA) y 4 (mensajes por evento): FUERA.**
  - **Fase 5 aprobada** (resumen en Inicio de Automatizaciones + lunes por Telegram).
  - **Fase 6**: por pantalla como ML (no Excel), empezando por editar publicaciones existentes. **Prueba 07-11 en PIKEKE MLV772995696**: PUT del mismo precio → 200 y PUT de la misma descripción (`/items/{id}/description?api_version=2`) → 200, releído sin cambios. Ya probado antes: stock, activar, variantes/fotos, promociones.
    **Segunda prueba 07-11 (cambiar y devolver, todo quedó como estaba):**
    - Título con ventas → 400 `field_not_updatable` "Cannot update title when item has bids" (confirmado: no se puede).
    - Característica principal `MODEL` → 200 (cambió y volvió). Secundaria `WIDTH` (número + unidad) → 200. Se manda solo `attributes: [{id, value_name}]`; las demás no se tocan. ML devuelve las características en otro orden después de editar (los valores son los mismos).
    - Fotos: `pictures: [{id}…]` en otro orden → 200 y vuelta al orden original → 200.
    - Variantes (MLV535999308): `variations` con TODAS las variantes por id; a una se le cambió el nombre (combinación libre, sin id de atributo) y el orden de sus fotos → 200, y vuelta → 200. Precio, stock y estado sin cambios.
    - Conclusión: con la API se puede editar todo menos el título de una publicación con ventas.
