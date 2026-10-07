// Datos de la cuenta DEMO (lib/demo.ts): una tienda ficticia (Tecnova Store, 2 cuentas de ML) con
// TODO pendiente, para mostrar en vivo cómo se pasa de muchos pendientes a nada en pocos clics.
//
// Cada sección se restaura sola (Demo → Restaurar) y no toca a las demás: usa su propio rango de
// números de venta y sus propias jornadas de despacho (marcadas con manifest_path = 'demo:<sección>').
//   despachos      2000099991000001…  50 ventas sin despachar; las etiquetas PDF las genera
//                  scripts/demo/generar.py con los mismos datos (lib/demo/datos.json)
//   reportador     2000099992000001…  24 envíos de la jornada de ayer, cerrada, sin reportar
//   calificaciones 2000099993000001…  40 ventas sin calificar (despachadas, sin despachar, canceladas, recientes)
//   mensajes       2000099994000001…  conversaciones sin leer + historial respondido (sugerencias e IA)
//   stock          2000099995000001…  ventas de los últimos 30 días de lo agotado / por agotarse
//   preguntas      preguntas sin responder + historial respondido (memoria de la IA y sugerencias)
// Las fechas son relativas al momento de restaurar: siempre se ve "de hoy".
import { MENSAJES_SUGERIDOS } from '@/lib/mensajesRapidos'
import type { Pool } from 'pg'
import datos from '@/lib/demo/datos.json'
import { TOKEN_DEMO } from '@/lib/demo'

// ── Datos fijos ─────────────────────────────────────────────────────────────
export interface ProductoDemo {
  id: string; titulo: string; precio: number; icono: string; color: string
  ficha: string; descripcion: string; variantes?: Record<string, string>
}
interface ItemEnvio { item_id: string; variante_id: number; titulo: string; variante: string | null; cantidad: number }
interface EnvioDemo {
  venta: string; carrier: 'ZOOM' | 'TEALCA'; guia: string; cuenta: string; remitente: string; comprador: string
  horas: number; nota: string | null; total: number; items: ItemEnvio[]
}
const D = datos as unknown as {
  tienda: string; cuentas: { nickname: string; remitente: string; pagina: string }[]
  catalogo: ProductoDemo[]; compradores: string[]; envios: EnvioDemo[]
}
export const TIENDA_DEMO = D.tienda
const CATALOGO = new Map(D.catalogo.map(p => [p.id, p]))
export const productoDemo = (itemId: string) => CATALOGO.get(itemId)

const capital = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase())
/** El comprador (id, nick y nombre) a partir del nombre guardado en la venta: siempre el mismo. */
export function compradorDemo(nombre: string) {
  let i = D.compradores.indexOf(nombre)
  if (i < 0) i = 500 + [...nombre].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 400, 7)
  const [nom, ...ape] = nombre.split(' ')
  return {
    id: 990_000_000 + i, nickname: `${ape.join('')}${nom}`.replace(/Ñ/g, 'N').slice(0, 14) + (10 + (i * 7) % 89),
    first_name: capital(nom ?? ''), last_name: capital(ape.join(' ')),
  }
}

// PRNG determinístico (los mismos datos en cada restauración).
function azar(semilla: number) {
  let a = semilla
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const elegir = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)]

function itemsAzar(r: () => number, n = 1): ItemEnvio[] {
  const out: ItemEnvio[] = []
  for (let k = 0; k < n; k++) {
    const p = elegir(r, D.catalogo)
    if (out.some(x => x.item_id === p.id)) continue
    const vars = Object.entries(p.variantes ?? {})
    const v = vars.length ? elegir(r, vars) : null
    out.push({ item_id: p.id, variante_id: v ? Number(v[0]) : 0, titulo: p.titulo, variante: v?.[1] ?? null, cantidad: r() < 0.85 ? 1 : 2 })
  }
  return out
}
const item = (id: string, variante = 0, cantidad = 1): ItemEnvio => {
  const p = CATALOGO.get(id)!
  return { item_id: id, variante_id: variante, titulo: p.titulo, variante: variante ? p.variantes![String(variante)] : null, cantidad }
}
const totalDe = (items: ItemEnvio[]) => Math.round(items.reduce((a, x) => a + CATALOGO.get(x.item_id)!.precio * x.cantidad, 0) * 100) / 100

const imagen = (p: ProductoDemo) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${p.color}"/><text x="32" y="44" font-size="34" text-anchor="middle">${p.icono}</text></svg>`)

// ── Secciones ───────────────────────────────────────────────────────────────
export const SECCIONES_DEMO = [
  { id: 'despachos', titulo: 'Despachos', texto: '50 ventas sin despachar. Sube las 50 etiquetas PDF (carpeta "Demo videos/Despachos"), genera la hoja 4 por página y los manifiestos.' },
  { id: 'reportador', titulo: 'Reportador', texto: '24 guías de la jornada de ayer, cerrada, esperando que se le avise a cada comprador.' },
  { id: 'preguntas', titulo: 'Preguntas', texto: '15 preguntas sin responder (una de una publicación pausada sin stock) y el historial que usa la IA.' },
  { id: 'mensajes', titulo: 'Mensajes', texto: '10 conversaciones sin leer (guía, factura, cambio de color, reclamo…) y respuestas anteriores para sugerir.' },
  { id: 'calificaciones', titulo: 'Calificaciones', texto: 'Ventas sin calificar: despachadas (positiva), sin despachar o canceladas (neutral) y recientes (esperar).' },
  { id: 'stock', titulo: 'Stock', texto: '6 publicaciones agotadas y 5 por agotarse, por variante, para reponer en un clic.' },
] as const
export type SeccionDemo = typeof SECCIONES_DEMO[number]['id']

const RANGO: Record<string, string> = {
  despachos: '20000999910', reportador: '20000999920', calificaciones: '20000999930', mensajes: '20000999940', stock: '20000999950',
}
const enRango = (sec: string) => `id BETWEEN ${RANGO[sec]}00001 AND ${RANGO[sec]}99999`

type Cuentas = Record<string, number>   // nickname → conexion_id

/** Restaura las secciones pedidas (y la base: cuentas, catálogo y ajustes). Todo o nada. */
export async function restaurarDemo(db: Pool, secciones: readonly SeccionDemo[]) {
  await db.query('BEGIN')
  try {
    const cx = await base(db)
    for (const s of secciones) await SEMBRAR[s](db, cx)
    await db.query('COMMIT')
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {})
    throw e
  }
}

// ── Base: cuentas de ML ficticias, catálogo y ajustes ───────────────────────
const POLITICAS = `Tienda en San Cristóbal (Táchira). Despachamos de lunes a viernes por ZOOM y TEALCA (cobro a destino), el mismo día si el pago entra antes de las 2 pm.
Entrega: de 1 a 3 días hábiles a las ciudades principales.
Todo es nuevo, con 30 días de garantía por defectos de fábrica.
No hay retiro personal: solo envíos.
Al mayor (6 o más unidades del mismo producto): 10% de descuento, se coordina por mensaje después de la compra.
Facturamos con RIF: lo indican en la nota de la compra o por mensaje.
Firma de las respuestas: "Saludos, Tecnova Store."`

const PLANTILLAS = [
  { titulo: 'Disponible', texto: '¡Hola! Sí, tenemos disponible. Puedes ofertar sin problema y lo despachamos hoy mismo. Saludos, Tecnova Store.' },
  { titulo: 'Envíos', texto: '¡Hola! Enviamos por ZOOM y TEALCA a toda Venezuela, de lunes a viernes. Llega en 1 a 3 días hábiles. Saludos, Tecnova Store.' },
  { titulo: 'Garantía', texto: '¡Hola! Todos nuestros productos son nuevos y tienen 30 días de garantía por defectos de fábrica. Saludos, Tecnova Store.' },
]

const NOTAS_ITEM: [string, string][] = [
  ['MLV900100108', 'Solo hay color negro. La correa es estándar de 22 mm (se puede cambiar).'],
  ['MLV900100110', 'Con laptops HP o Lenovo económicas: el USB-C a veces es solo de datos y no saca video. Pedir el modelo exacto.'],
  ['MLV900100104', 'Llega más mercancía el viernes.'],
  ['MLV900100103', 'Para iPhone 15 en adelante NO sirve (usan USB-C): ofrecer el cargador de 20 W que trae cable USB-C.'],
]

async function base(db: Pool): Promise<Cuentas> {
  const { rows: [e] } = await db.query(`SELECT NULLIF(current_setting('app.empresa_id', true), '')::int AS id`)
  const cx: Cuentas = {}
  for (const [k, c] of D.cuentas.entries()) {
    // ml_user_id es único en toda la base: se arma con la empresa (no choca con otra demo ni con una real).
    const { rows: [f] } = await db.query(
      `INSERT INTO ml_conexiones (ml_user_id, nickname, site_id, access_token_enc, refresh_token_enc, expira_en, scopes, estado,
                                  ultima_sync, ordenes_sync_at, stock_alertas_at, catalogo_at)
       VALUES ($1, $2, 'MLV', $3, $3, NOW() + INTERVAL '10 years', 'offline_access read write', 'activa', NOW(), NOW(), NOW(), NOW())
       ON CONFLICT (ml_user_id) DO UPDATE SET nickname = EXCLUDED.nickname, access_token_enc = EXCLUDED.access_token_enc,
         refresh_token_enc = EXCLUDED.refresh_token_enc, estado = 'activa', ultimo_error = NULL, ultima_sync = NOW()
       RETURNING id`, [9_900_000_000 + e.id * 10 + k, c.nickname, TOKEN_DEMO])
    cx[c.nickname] = f.id
  }
  const ajustes: [string, string][] = [
    ['modo_demo', '1'],
    ['despacho_remitente', D.cuentas[0].remitente],
    ['preguntas_politicas', POLITICAS],
    ['preguntas_plantillas', JSON.stringify(PLANTILLAS)],
    ['mensajes_plantillas', JSON.stringify(MENSAJES_SUGERIDOS(D.cuentas[0].nickname))],
    // Reportador sin cuentas escritas a mano: cada envío sale desde la cuenta de su venta (como un Fundador).
    ['reportador_cuentas', '[]'],
    ['reportador_plantillas', JSON.stringify([
      '¡Hola! Tu pedido ya va en camino. Tu número de guía {transportista} es {guia}.',
      'Buen día, tu paquete fue entregado a {transportista} con la guía {guia}. Cualquier duda, aquí estamos para ayudarte.',
    ])],
    ['reportador_bloque', ` ¡Gracias por comprar en ${D.tienda}! Síguenos en nuestra cuenta oficial: https://www.mercadolibre.com.ve/pagina/${D.cuentas[0].nickname.toLowerCase()}`],
  ]
  for (const [k, v] of ajustes) {
    await db.query(`INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value`, [k, v])
  }
  // Catálogo (contexto de la IA: títulos, precios y fichas; "otras publicaciones" del vendedor).
  await db.query(`DELETE FROM ml_catalogo`)
  for (const [i, p] of D.catalogo.entries()) {
    await db.query(
      `INSERT INTO ml_catalogo (item_id, conexion_id, titulo, precio, moneda, disponible, estado, ficha, actualizado_at, historial_at)
       VALUES ($1, $2, $3, $4, 'USD', 15, 'active', $5, NOW(), NOW())`,
      [p.id, cx[D.cuentas[i % 3 === 2 ? 1 : 0].nickname], p.titulo, p.precio, p.ficha])
  }
  await db.query(`DELETE FROM ml_item_notas`)
  for (const [itemId, texto] of NOTAS_ITEM) await db.query(`INSERT INTO ml_item_notas (item_id, texto) VALUES ($1, $2)`, [itemId, texto])
  return cx
}

// ── Ayudantes de inserción ──────────────────────────────────────────────────
interface Orden {
  id: string; conexion: number; horas: number; comprador: string; items: ItemEnvio[]
  estado?: string; nota?: string | null; cal?: string | null
}
async function insertarOrdenes(db: Pool, ordenes: Orden[]) {
  await db.query(
    `INSERT INTO ml_ordenes (id, conexion_id, fecha, comprador, productos, total, moneda, estado, items, detalle, notas, notas_at,
                             cal_vendedor, cal_concretada)
     SELECT x.id, x.conexion_id, NOW() - make_interval(secs => x.horas * 3600), x.comprador, x.productos, x.total, 'USD',
            x.estado, ARRAY(SELECT jsonb_array_elements_text(x.items)), x.detalle, x.nota, NOW() + INTERVAL '10 years',
            x.cal, CASE WHEN x.cal IS NOT NULL THEN TRUE END
     FROM jsonb_to_recordset($1::jsonb) AS x(id bigint, conexion_id int, horas float, comprador text, productos text, total numeric,
                                             estado text, items jsonb, detalle jsonb, nota text, cal text)`,
    [JSON.stringify(ordenes.map(o => ({
      id: o.id, conexion_id: o.conexion, horas: o.horas, comprador: o.comprador,
      productos: o.items.map(i => `${i.cantidad} × ${i.titulo}`).join(' · '), total: totalDe(o.items),
      estado: o.estado ?? 'paid', nota: o.nota ?? null, cal: o.cal ?? null,
      items: o.items.map(i => i.variante_id ? `${i.item_id}:${i.variante_id}` : i.item_id),
      detalle: o.items.map(i => ({ titulo: i.titulo, cantidad: i.cantidad, variante: i.variante })),
    })))])
}

interface Etiqueta { venta: string; carrier: 'ZOOM' | 'TEALCA'; guia: string; guia_final?: string | null; remitente: string; destinatario: string; reporte?: string | null }
/** Jornada CERRADA con un lote ya impreso (lo que dejó un despacho anterior). */
async function jornadaImpresa(db: Pool, seccion: string, horasCierre: number, etiquetas: Etiqueta[]) {
  const { rows: [j] } = await db.query(
    `INSERT INTO despacho_jornadas (status, opened_at, closed_at, manifest_path, total_envios)
     VALUES ('CERRADA', LOCALTIMESTAMP - make_interval(secs => ($1::float + 7) * 3600), LOCALTIMESTAMP - make_interval(secs => $1::float * 3600), $2, $3)
     RETURNING id`, [horasCierre, `demo:${seccion}`, etiquetas.length])
  const { rows: [l] } = await db.query(
    `INSERT INTO despacho_lotes (jornada_id, status, created_at, generated_at, output_path, label_count, page_count)
     VALUES ($1, 'GENERADO', LOCALTIMESTAMP - make_interval(secs => ($2::float + 2) * 3600), LOCALTIMESTAMP - make_interval(secs => ($2::float + 1) * 3600), $3, $4, $5)
     RETURNING id`, [j.id, horasCierre, `demo:${seccion}`, etiquetas.length, Math.ceil(etiquetas.length / 4)])
  await db.query(
    `INSERT INTO despacho_etiquetas (lote_id, original_name, file_path, sha256, page_count, venta, guia, guia_final, remitente,
                                     remitente_limpio, destinatario, impresa, carrier, reporte_estado, reportado_at, created_at)
     SELECT $1, 'guide-' || x.venta || '.pdf', 'demo', repeat('0', 64), 1, x.venta, x.guia, x.guia_final, x.remitente,
            x.remitente, x.destinatario, TRUE, x.carrier, x.reporte,
            CASE WHEN x.reporte IS NOT NULL THEN LOCALTIMESTAMP - make_interval(secs => ($2::float - 1) * 3600) END,
            LOCALTIMESTAMP - make_interval(secs => ($2::float + 2) * 3600)
     FROM jsonb_to_recordset($3::jsonb) AS x(venta text, guia text, guia_final text, remitente text, destinatario text, carrier text, reporte text)`,
    [l.id, horasCierre, JSON.stringify(etiquetas.map(e => ({ ...e, guia_final: e.guia_final ?? null, reporte: e.reporte ?? null })))])
}

/** Borra las jornadas sembradas de una sección (o, con null, las que NO son sembradas: lo hecho en vivo). */
async function borrarJornadas(db: Pool, seccion: string | null) {
  const filtro = seccion ? `j.manifest_path = 'demo:${seccion}'` : `(j.manifest_path IS NULL OR j.manifest_path NOT LIKE 'demo:%')`
  await db.query(
    `DELETE FROM despacho_etiquetas WHERE lote_id IN (
       SELECT l.id FROM despacho_lotes l LEFT JOIN despacho_jornadas j ON j.id = l.jornada_id
       WHERE ${seccion ? filtro : `l.jornada_id IS NULL OR ${filtro}`})`)
  await db.query(
    `DELETE FROM despacho_lotes WHERE id IN (
       SELECT l.id FROM despacho_lotes l LEFT JOIN despacho_jornadas j ON j.id = l.jornada_id
       WHERE ${seccion ? filtro : `l.jornada_id IS NULL OR ${filtro}`})`)
  await db.query(`DELETE FROM despacho_jornadas j WHERE ${filtro}`)
}

const cuentaDe = (cx: Cuentas, i: number) => (i % 5 === 1 || i % 5 === 3) ? D.cuentas[1] : D.cuentas[0]

// ── Despachos ───────────────────────────────────────────────────────────────
async function despachos(db: Pool, cx: Cuentas) {
  // Lo que se hizo en vivo (lotes, jornadas y la jornada abierta) se borra; lo sembrado de otras secciones queda.
  await borrarJornadas(db, null)
  await db.query(`DELETE FROM ml_ordenes WHERE ${enRango('despachos')}`)
  await insertarOrdenes(db, D.envios.map(e => ({
    id: e.venta, conexion: cx[e.cuenta], horas: e.horas, comprador: e.comprador, items: e.items, nota: e.nota,
  })))
}

// ── Reportador ──────────────────────────────────────────────────────────────
async function reportador(db: Pool, cx: Cuentas) {
  await borrarJornadas(db, 'reportador')
  await db.query(`DELETE FROM reportador_corridas`)
  await db.query(`DELETE FROM ml_ordenes WHERE ${enRango('reportador')}`)
  const r = azar(2)
  const ordenes: Orden[] = [], etiquetas: Etiqueta[] = []
  for (let i = 0; i < 24; i++) {
    const venta = `${RANGO.reportador}${String(i + 1).padStart(5, '0')}`
    const c = cuentaDe(cx, i), comprador = D.compradores[50 + i], tealca = i % 4 === 2
    ordenes.push({ id: venta, conexion: cx[c.nickname], horas: 30 + Math.floor(r() * 20), comprador, items: itemsAzar(r, r() < 0.2 ? 2 : 1) })
    etiquetas.push({
      venta, carrier: tealca ? 'TEALCA' : 'ZOOM', guia: tealca ? `68${1000 + i}` : `17118${String(30000 + i * 41).padStart(5, '0')}`,
      guia_final: tealca ? `4${String(2050000 + i * 13).padStart(7, '0')}` : null,
      remitente: tealca ? capital(c.remitente) : c.remitente, destinatario: comprador,
    })
  }
  await insertarOrdenes(db, ordenes)
  await jornadaImpresa(db, 'reportador', 20, etiquetas)    // cerrada ayer en la tarde
}

// ── Calificaciones ──────────────────────────────────────────────────────────
async function calificaciones(db: Pool, cx: Cuentas) {
  await borrarJornadas(db, 'calificaciones')
  await db.query(`DELETE FROM ml_ordenes WHERE ${enRango('calificaciones')}`)
  // Lo calificado en vivo de las otras secciones vuelve a "sin calificar" (las de mensajes y stock nacen calificadas).
  await db.query(`UPDATE ml_ordenes SET cal_vendedor = NULL, cal_concretada = NULL WHERE ${enRango('despachos')} OR ${enRango('reportador')}`)
  await db.query(`DELETE FROM uso_acciones WHERE tipo = 'calificacion'`)
  const r = azar(3)
  const ordenes: Orden[] = [], etiquetas: Etiqueta[] = []
  for (let i = 0; i < 40; i++) {
    const venta = `${RANGO.calificaciones}${String(i + 1).padStart(5, '0')}`
    const c = cuentaDe(cx, i), comprador = D.compradores[74 + i]
    // 0-27 despachadas · 28-33 sin despachar hace días · 34-35 canceladas · 36-39 de hoy
    const horas = i < 28 ? 96 + Math.floor(r() * 240) : i < 34 ? 110 + Math.floor(r() * 100) : i < 36 ? 50 : 3 + Math.floor(r() * 18)
    ordenes.push({ id: venta, conexion: cx[c.nickname], horas, comprador, items: itemsAzar(r, 1), estado: i === 34 || i === 35 ? 'cancelled' : 'paid' })
    if (i < 28) etiquetas.push({ venta, carrier: 'ZOOM', guia: `17117${String(40000 + i * 29).padStart(5, '0')}`, remitente: c.remitente, destinatario: comprador, reporte: 'ENVIADO' })
  }
  await insertarOrdenes(db, ordenes)
  await jornadaImpresa(db, 'calificaciones', 80, etiquetas)
}

// ── Stock ───────────────────────────────────────────────────────────────────
const ALERTAS: [string, number, number, number][] = [   // item, variante, disponible, hace (horas)
  ['MLV900100104', 0, 0, 5], ['MLV900100103', 2001, 0, 30], ['MLV900100108', 0, 0, 52], ['MLV900100113', 3002, 0, 18],
  ['MLV900100102', 0, 0, 74], ['MLV900100112', 0, 0, 9],
  ['MLV900100101', 0, 2, 26], ['MLV900100103', 2002, 1, 12], ['MLV900100105', 0, 2, 40], ['MLV900100106', 0, 1, 6], ['MLV900100113', 3001, 2, 20],
]
async function stock(db: Pool, cx: Cuentas) {
  await db.query(`DELETE FROM ml_stock_alertas`)
  await db.query(`DELETE FROM ml_ordenes WHERE ${enRango('stock')}`)
  await db.query(`DELETE FROM uso_acciones WHERE tipo = 'stock'`)
  await db.query(`UPDATE ml_conexiones SET stock_alertas_at = NOW() - INTERVAL '40 minutes'`)
  // Vendidas en los últimos 30 días (Stock solo muestra lo que se vende). Nacen calificadas: no van a Calificaciones.
  await insertarOrdenes(db, ALERTAS.map(([id, v], i) => ({
    id: `${RANGO.stock}${String(i + 1).padStart(5, '0')}`, conexion: cx[D.cuentas[i % 3 === 2 ? 1 : 0].nickname],
    horas: 48 + i * 37, comprador: D.compradores[(i * 7) % 50], items: [item(id, v, 1)], cal: 'positive',
  })))
  for (const [i, [id, v, disp, hace]] of ALERTAS.entries()) {
    const p = CATALOGO.get(id)!
    // Agotada sin variantes = ML la pausa; con variantes la publicación sigue activa con las otras.
    const estado = disp <= 0 && !p.variantes ? 'paused' : 'active'
    await db.query(
      `INSERT INTO ml_stock_alertas (item_id, variante_id, conexion_id, titulo, variante, disponible, estado, imagen,
                                     agotada_desde, bajo_desde, ultima_agotada_at, actualizado_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               CASE WHEN $6 <= 0 THEN NOW() - make_interval(hours => $9) END,
               CASE WHEN $6 > 0 THEN NOW() - make_interval(hours => $9) END,
               CASE WHEN $6 <= 0 THEN NOW() - make_interval(hours => $9) END,
               NOW() + INTERVAL '10 days')`,   // "fresca" (se lista) mientras dure la grabación
      [id, v, cx[D.cuentas[i % 3 === 2 ? 1 : 0].nickname], p.titulo, v ? p.variantes![String(v)] : null, disp, estado, imagen(p), hace])
  }
}

// ── Preguntas ───────────────────────────────────────────────────────────────
// [item, pregunta, minutos atrás, comprador (índice en compradores) o null]
const PENDIENTES: [string, string, number, number | null][] = [
  ['MLV900100101', 'Hola buenas, ¿los audífonos sirven para iPhone? ¿Cuánto dura la batería?', 4, 3],
  ['MLV900100102', 'sirve para iphone 14? trae el cable?', 9, null],
  ['MLV900100104', 'Tienes disponible el power bank? cuantas cargas le da a un celular?', 15, null],
  ['MLV900100108', 'Buenas noches, el reloj se puede meter a la piscina? recibe los whatsapp?', 22, 8],
  ['MLV900100110', 'Funciona con una laptop HP que tiene USB C? la quiero conectar al televisor', 31, null],
  ['MLV900100111', 'es de 64 real? cuanto espacio trae', 47, null],
  ['MLV900100112', 'Tiene radio? se pueden conectar 2 cornetas?', 58, null],
  ['MLV900100107', 'Tiene la letra ñ? funciona con una tablet samsung?', 75, null],
  ['MLV900100113', 'Tienen para el A25? es de los que cubren toda la pantalla?', 96, null],
  ['MLV900100114', 'Hola, de cuántos metros es el trípode? hacen envíos a Maracaibo?', 130, null],
  ['MLV900100109', 'funciona sin estar conectada? cuanto le dura la bateria', 170, null],
  ['MLV900100106', 'Necesita pilas?', 205, null],
  ['MLV900100103', 'sirve para iphone 15?', 240, null],
  ['MLV900100105', 'Hola, envían por Zoom o Tealca? cuanto tarda en llegar a Mérida?', 290, null],
  ['MLV900100101', 'Precio al mayor? quiero 10', 340, null],
]
// [item | null (cualquiera), pregunta, respuesta]
const HISTORIAL: [string | null, string, string][] = [
  ['MLV900100101', '¿Sirven para iPhone?', '¡Hola! Sí, funcionan con iPhone y Android por Bluetooth 5.3. Saludos, Tecnova Store.'],
  ['MLV900100101', '¿Cuánto dura la batería?', '¡Hola! 6 horas de música por carga y hasta 24 horas con el estuche. Saludos, Tecnova Store.'],
  ['MLV900100101', '¿Traen cargador?', '¡Hola! Traen el cable USB-C; el cargador de pared no está incluido (sirve el de tu celular). Saludos, Tecnova Store.'],
  ['MLV900100102', '¿Sirve para iPhone 13?', '¡Hola! Sí, carga rápido el iPhone 13. Trae cable USB-C a USB-C; para tu iPhone necesitas el cable USB-C a Lightning, que también lo tenemos publicado. Saludos, Tecnova Store.'],
  ['MLV900100102', '¿Es original?', '¡Hola! Es un cargador genérico de buena calidad, 20 W reales con protección contra sobrecarga y 30 días de garantía. Saludos, Tecnova Store.'],
  ['MLV900100103', '¿Sirve para iPhone 11?', '¡Hola! Sí, sirve para iPhone 5 al 14. Saludos, Tecnova Store.'],
  ['MLV900100103', '¿Qué colores tienen?', '¡Hola! Negro y blanco: elige el color en la variante al comprar. Saludos, Tecnova Store.'],
  ['MLV900100104', '¿Cuántas cargas da?', '¡Hola! Carga un celular normal unas 2 veces. Saludos, Tecnova Store.'],
  ['MLV900100104', '¿Se puede llevar en el avión?', '¡Hola! Sí, tiene menos de 100 Wh y se permite en el equipaje de mano. Saludos, Tecnova Store.'],
  ['MLV900100105', '¿Sirve con forro?', '¡Hola! Sí, la placa metálica se pega por dentro o por fuera del forro. Saludos, Tecnova Store.'],
  ['MLV900100106', '¿Funciona con Mac?', '¡Hola! Sí, por Bluetooth o con el receptor USB. Saludos, Tecnova Store.'],
  ['MLV900100106', '¿Es silencioso?', '¡Hola! Sí, el clic es silencioso. Saludos, Tecnova Store.'],
  ['MLV900100107', '¿Funciona con Smart TV?', '¡Hola! Sí, con los que aceptan teclado Bluetooth. Saludos, Tecnova Store.'],
  ['MLV900100108', '¿Es resistente al agua?', '¡Hola! Es IP67: aguanta lluvia y lavarse las manos, pero no es para nadar ni piscina. Saludos, Tecnova Store.'],
  ['MLV900100108', '¿Le llegan las notificaciones de WhatsApp?', '¡Hola! Sí, muestra WhatsApp, llamadas y mensajes con la app en español. Saludos, Tecnova Store.'],
  ['MLV900100108', '¿Viene en otros colores?', '¡Hola! Por ahora solo en negro. Saludos, Tecnova Store.'],
  ['MLV900100109', '¿Funciona sin luz?', '¡Hola! Sí, es recargable y dura de 4 a 8 horas según el brillo. Saludos, Tecnova Store.'],
  ['MLV900100110', '¿Sirve para MacBook Air?', '¡Hola! Sí, funciona con MacBook Air y Pro con USB-C, incluido el HDMI. Saludos, Tecnova Store.'],
  ['MLV900100110', '¿Sirve para conectar la laptop al televisor?', '¡Hola! Sí, si el USB-C de tu laptop saca video. Dinos el modelo exacto y te confirmamos. Saludos, Tecnova Store.'],
  ['MLV900100111', '¿Es de 64 GB reales?', '¡Hola! Sí, 64 GB; como toda memoria, quedan unos 58 GB libres para usar. Saludos, Tecnova Store.'],
  ['MLV900100112', '¿Tiene radio FM?', '¡Hola! Sí, tiene radio FM y entrada para memoria microSD. Saludos, Tecnova Store.'],
  ['MLV900100112', '¿Se puede mojar?', '¡Hola! Es IPX6: aguanta lluvia y salpicaduras, no sumergirla. Saludos, Tecnova Store.'],
  ['MLV900100113', '¿Tienen para el A15?', '¡Hola! Sí, para A15, A25 y A35: elige tu modelo en la variante. Saludos, Tecnova Store.'],
  ['MLV900100114', '¿Funciona con el cargador del celular?', '¡Hola! Sí, es USB: sirve con cargador de celular, laptop o power bank. Saludos, Tecnova Store.'],
  [null, '¿Hacen envíos a Valencia?', '¡Hola! Sí, enviamos por ZOOM y TEALCA a toda Venezuela. Llega en 1 a 3 días hábiles. Saludos, Tecnova Store.'],
  [null, '¿Por dónde envían?', '¡Hola! Por ZOOM o TEALCA, cobro a destino, de lunes a viernes. Saludos, Tecnova Store.'],
  [null, '¿Cuánto tarda en llegar a Caracas?', '¡Hola! De 1 a 3 días hábiles después del despacho. Saludos, Tecnova Store.'],
  [null, '¿Puedo retirar personalmente?', '¡Hola! Por ahora no tenemos retiro personal, solo envíos por ZOOM y TEALCA. Saludos, Tecnova Store.'],
  [null, '¿Tiene garantía?', '¡Hola! Sí, 30 días de garantía por defectos de fábrica. Saludos, Tecnova Store.'],
  [null, '¿Hacen factura?', '¡Hola! Sí, facturamos con RIF: indícalo en la nota al comprar. Saludos, Tecnova Store.'],
  [null, '¿Tienen precio al mayor?', '¡Hola! Sí, desde 6 unidades del mismo producto te hacemos 10% de descuento. Compra y lo coordinamos por mensaje. Saludos, Tecnova Store.'],
  [null, '¿Hay disponible?', '¡Hola! Sí, tenemos disponible. Puedes ofertar y lo despachamos hoy mismo. Saludos, Tecnova Store.'],
  [null, '¿Despachan hoy?', '¡Hola! Sí, si el pago entra antes de las 2 pm sale hoy mismo. Saludos, Tecnova Store.'],
]
async function preguntas(db: Pool, cx: Cuentas) {
  await db.query(`DELETE FROM ml_preguntas`)
  await db.query(`DELETE FROM respuestas_origen WHERE modulo = 'preguntas'`)
  const cuentaItem = (id: string) => cx[D.cuentas[D.catalogo.findIndex(p => p.id === id) % 3 === 2 ? 1 : 0].nickname]
  const fila = (id: number, itemId: string, texto: string, minutos: number, comprador: number, respuesta: string | null) => {
    const p = CATALOGO.get(itemId)!
    return db.query(
      `INSERT INTO ml_preguntas (id, conexion_id, item_id, item_titulo, item_permalink, item_estado, texto, estado, fecha, comprador_id,
                                 respuesta, respuesta_estado, respuesta_fecha, item_precio, item_moneda, item_actualizado_at)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, NOW() - make_interval(mins => $8), $9, $10, $11,
               CASE WHEN $10::text IS NOT NULL THEN NOW() - make_interval(mins => $8 - 25) END, $12, 'USD', NOW())`,
      [id, cuentaItem(itemId), itemId, p.titulo, itemId === 'MLV900100104' && !respuesta ? 'paused' : 'active', texto,
       respuesta ? 'ANSWERED' : 'UNANSWERED', minutos, comprador, respuesta, respuesta ? 'ACTIVE' : null, p.precio])
  }
  const r = azar(5)
  let n = 0
  for (const [k, [itemId, pregunta, respuesta]] of HISTORIAL.entries()) {
    const it = itemId ?? elegir(r, D.catalogo).id
    // Los compradores 3 y 8 ya habían preguntado antes (se ve "preguntó N veces").
    const comprador = k === 1 ? compradorDemo(D.compradores[3]).id : k === 14 ? compradorDemo(D.compradores[8]).id : 991_000_000 + k
    await fila(99_100_000_000 + ++n, it, pregunta, 60 * 24 * (3 + Math.floor(r() * 50)) + Math.floor(r() * 600), comprador, respuesta)
  }
  for (const [itemId, pregunta, minutos, comprador] of PENDIENTES) {
    await fila(99_100_000_000 + ++n, itemId, pregunta, minutos,
      comprador !== null ? compradorDemo(D.compradores[comprador]).id : 992_000_000 + n, null)
  }
}

// ── Mensajes ────────────────────────────────────────────────────────────────
// Conversación: [comprador?, texto, minutos atrás][] (true = escribe el comprador). sinLeer = los últimos del comprador.
interface Conversacion { items: ItemEnvio[]; horasVenta: number; despacho?: { carrier: 'ZOOM' | 'TEALCA'; guia: string; horas: number }; nota?: string; msgs: [boolean, string, number][] }
const SIN_LEER: Conversacion[] = [
  { items: [item('MLV900100107')], horasVenta: 5, msgs: [[true, 'Hola buenas tardes, ya pagué. ¿Cuándo me envían el pedido?', 12]] },
  { items: [item('MLV900100112')], horasVenta: 30, despacho: { carrier: 'ZOOM', guia: '1711652301', horas: 20 },
    msgs: [[true, 'Buenos días, me puede indicar el número de guía por favor', 25]] },
  { items: [item('MLV900100110')], horasVenta: 26, nota: 'Factura a nombre de Inversiones Rojas 2020',
    msgs: [[true, 'Hola, ¿me pueden enviar la factura con RIF? Gracias', 41], [true, 'Es para la empresa', 40]] },
  { items: [item('MLV900100108')], horasVenta: 120, despacho: { carrier: 'ZOOM', guia: '1711652388', horas: 100 },
    msgs: [[true, 'Buenas, ya me llegó el reloj pero no me aparece en la app, ¿cómo lo conecto?', 55]] },
  { items: [item('MLV900100103', 2001)], horasVenta: 3, msgs: [[true, 'Buenas, quisiera cambiar el color del cable a blanco, ¿se puede?', 70]] },
  { items: [item('MLV900100101')], horasVenta: 98, despacho: { carrier: 'TEALCA', guia: '661044', horas: 80 },
    msgs: [[true, 'Me llegó el paquete pero falta el cable de carga de los audífonos', 95], [true, 'Revisé bien la caja y no está', 93]] },
  { items: [item('MLV900100114')], horasVenta: 7, msgs: [[true, 'Hola, ¿el envío es por Zoom? ¿Llega a Puerto Ordaz?', 130]] },
  { items: [item('MLV900100104')], horasVenta: 76, despacho: { carrier: 'ZOOM', guia: '1711652415', horas: 60 },
    msgs: [[false, '¡Hola! Tu pedido ya va en camino 🚚 Tu número de guía es 1711652415. ¡Gracias por tu compra!', 60 * 50], [true, 'Gracias, ya me llegó todo perfecto 👍', 160]] },
  { items: [item('MLV900100111')], horasVenta: 150, despacho: { carrier: 'ZOOM', guia: '1711652470', horas: 130 },
    msgs: [[true, 'Disculpe, la memoria no me la reconoce el carro, ¿viene formateada?', 210]] },
  { items: [item('MLV900100109'), item('MLV900100106')], horasVenta: 2, msgs: [[true, 'Buenas noches, ¿hasta qué hora despachan hoy?', 260]] },
]
// [pregunta del comprador, respuesta del vendedor]: lo que se respondió antes (sugerencias y ejemplos de la IA).
const RESPONDIDAS: [string, string, string][] = [
  ['MLV900100106', 'Buenas, ¿cuándo envían mi pedido? ya pagué', '¡Hola! Gracias por tu compra. Tu pedido sale hoy por ZOOM; apenas lo entreguemos te escribimos el número de guía.'],
  ['MLV900100112', 'Hola, me pasa el número de guía por favor', '¡Hola! Tu guía ZOOM es 1711500321. Puedes rastrearla en la página de ZOOM con ese número.'],
  ['MLV900100110', 'Necesito la factura con mi RIF', '¡Claro! Envíanos por aquí la razón social y el RIF y te mandamos la factura en PDF por este chat.'],
  ['MLV900100108', 'No sé cómo conectar el reloj al teléfono', '¡Hola! Descarga la app escaneando el código QR del manual, activa el Bluetooth y vincula el reloj desde la app (no desde el Bluetooth del teléfono).'],
  ['MLV900100103', '¿Puedo cambiar el color del cable?', '¡Sí! Como todavía no despachamos, te lo cambiamos sin problema. Queda anotado.'],
  ['MLV900100101', 'Me llegó sin el cable de carga', 'Disculpa el inconveniente. Te enviamos el cable sin costo en el próximo despacho; te pasamos la guía por aquí.'],
  ['MLV900100114', '¿Llega a Barquisimeto? ¿por cuál envían?', '¡Hola! Sí, enviamos por ZOOM o TEALCA a toda Venezuela, cobro a destino. Llega en 1 a 3 días hábiles.'],
  ['MLV900100104', 'Ya me llegó, muchas gracias', '¡Gracias a ti por tu compra! Que lo disfrutes. Si nos dejas tu calificación nos ayudas muchísimo.'],
  ['MLV900100111', 'La memoria no la lee el carro', 'Hola. Muchos carros solo leen memorias en FAT32: formatéala en la PC como FAT32 y copia la música de nuevo.'],
  ['MLV900100109', '¿Hasta qué hora despachan?', 'Hola. Despachamos de lunes a viernes; si pagas antes de las 2 pm sale el mismo día.'],
  ['MLV900100105', '¿Cuándo me llega?', 'Hola. Ya lo entregamos a ZOOM; llega en 1 a 3 días hábiles.'],
  ['MLV900100102', 'El cargador no me carga rápido', 'Hola. Para la carga rápida usa el cable USB-C que trae; con cables viejos carga normal.'],
  ['MLV900100107', '¿Me puede enviar la factura?', 'Hola. Claro, pásanos el RIF y la razón social por aquí y te la enviamos en PDF.'],
  ['MLV900100113', 'Quiero cambiar el modelo del protector', 'Hola. Sin problema, dinos el modelo correcto y lo cambiamos antes de despachar.'],
]
async function mensajes(db: Pool, cx: Cuentas) {
  await borrarJornadas(db, 'mensajes')
  await db.query(`DELETE FROM ml_mensajes`)
  await db.query(`DELETE FROM ml_conversaciones`)
  await db.query(`DELETE FROM respuestas_origen WHERE modulo = 'mensajes'`)
  await db.query(`DELETE FROM ml_ordenes WHERE ${enRango('mensajes')}`)
  const conversaciones: (Conversacion & { venta: string; comprador: string; cuenta: number })[] = []
  SIN_LEER.forEach((c, i) => conversaciones.push({ ...c, venta: `${RANGO.mensajes}${String(i + 1).padStart(5, '0')}`, comprador: D.compradores[96 + i], cuenta: cx[cuentaDe(cx, i).nickname] }))
  const r = azar(7)
  RESPONDIDAS.forEach(([it, p, resp], i) => {
    const horas = 24 * (4 + Math.floor(r() * 40))
    conversaciones.push({
      items: [item(it)], horasVenta: horas + 2, msgs: [[true, p, horas * 60], [false, resp, horas * 60 - 18 - Math.floor(r() * 90)]],
      venta: `${RANGO.mensajes}${String(50 + i).padStart(5, '0')}`, comprador: D.compradores[106 + (i % 14)], cuenta: cx[cuentaDe(cx, i).nickname],
    })
  })
  // Nacen calificadas: no cambian lo que muestra Calificaciones.
  await insertarOrdenes(db, conversaciones.map(c => ({ id: c.venta, conexion: c.cuenta, horas: c.horasVenta, comprador: c.comprador, items: c.items, nota: c.nota ?? null, cal: 'positive' })))
  for (const c of conversaciones) {
    for (const [k, [delComprador, texto, minutos]] of c.msgs.entries()) {
      await db.query(
        `INSERT INTO ml_mensajes (msg_id, pack_id, conexion_id, propio, texto, fecha) VALUES ($1, $2, $3, $4, $5, NOW() - make_interval(mins => $6))`,
        [`demo-${c.venta}-${k}`, c.venta, c.cuenta, !delComprador, texto, minutos])
    }
    let sinLeer = 0
    for (let k = c.msgs.length - 1; k >= 0 && c.msgs[k][0]; k--) sinLeer++
    const ult = c.msgs[c.msgs.length - 1]
    const b = compradorDemo(c.comprador)
    await db.query(
      `INSERT INTO ml_conversaciones (pack_id, conexion_id, sin_leer, sin_leer_ml, ultimo_texto, ultimo_de_comprador, ultimo_at, comprador_id,
                                      productos, comprador_nick, comprador_nombre, notas, notas_at)
       VALUES ($1, $2, $3, $3, $4, $5, NOW() - make_interval(mins => $6), $7, $8, $9, $10, $11, NOW())`,
      [c.venta, c.cuenta, sinLeer, ult[1], ult[0], ult[2], b.id, c.items.map(i => `${i.cantidad} × ${i.titulo}`).join(' · '),
       b.nickname, `${b.first_name} ${b.last_name}`, c.nota ?? null])
  }
  // Los que ya se despacharon: con su guía (la IA la usa para responder "¿y mi guía?").
  const despachadas = conversaciones.filter(c => c.despacho)
  if (despachadas.length) {
    await jornadaImpresa(db, 'mensajes', 18, despachadas.map(c => ({
      venta: c.venta, carrier: c.despacho!.carrier, guia: c.despacho!.guia, remitente: D.cuentas[0].remitente, destinatario: c.comprador, reporte: 'ENVIADO',
    })))
  }
}

const SEMBRAR: Record<SeccionDemo, (db: Pool, cx: Cuentas) => Promise<void>> = {
  despachos, reportador, preguntas, mensajes, calificaciones, stock,
}
