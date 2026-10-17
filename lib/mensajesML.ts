// Mensajes post-venta de MercadoLibre: bandeja de conversaciones con mensajes sin leer.
//
// Verificado con la cuenta real: GET /messages/unread?role=seller&tag=post_sale devuelve
// [{ resource: '/packs/{pack}/sellers/{seller}', count }]. Leer una conversación con
// mark_as_read=false NO la marca como leída (así ML sigue avisando en su app); se marca
// al responder o con el botón "Marcar como leída".
import { empresaConPromociones, sqlDisponible, sqlPesoPublicacion, sqlSituacion } from '@/lib/promocionesSesion'
import { envioGratisAhora } from '@/lib/mlShipping'
import type { Pool } from 'pg'
import { mlFetch, ErrorML, ML_API, tokenVigente, CuentaDemo } from '@/lib/ml'
import { copiarNotas, leerNotas } from '@/lib/notasML'
import { guardarOrden } from '@/lib/calificacionesML'

interface MensajeApi {
  id: string
  from: { user_id: number }; to?: { user_id: number }; text: string
  message_date: { created: string; read: string | null }
  message_moderation?: { status: string }
  message_attachments?: { filename: string; original_filename?: string; type?: string }[] | null
}
interface Hilo {
  messages?: MensajeApi[]; conversation_status?: { status: string; substatus: string | null }
  paging?: { total: number; offset: number; limit: number }
}

export interface Mensaje {
  propio: boolean; texto: string; fecha: string; leido: string | null; moderacion: string | null; adjuntos: Adjunto[]
}
export interface Adjunto { archivo: string; nombre: string; tipo: string | null }

export async function leerHilo(db: Pool, conexionId: number, pack: string, sellerId: number, marcarLeido = false) {
  // Conversación COMPLETA, de a 50 (ML solo marca como leídos los mensajes que devuelve).
  const msgs: MensajeApi[] = []
  let h: Hilo = {}
  for (let offset = 0, pagina = 0; pagina < 10; pagina++, offset += 50) {
    h = await mlFetch<Hilo>(db, conexionId,
      `/messages/packs/${pack}/sellers/${sellerId}?tag=post_sale&mark_as_read=${marcarLeido}&limit=50&offset=${offset}`)
    msgs.push(...(h.messages ?? []))
    if (!h.messages?.length || offset + 50 >= (h.paging?.total ?? 0)) break
  }
  const mensajes: Mensaje[] = msgs.map(m => ({
    propio: m.from.user_id === sellerId, texto: m.text, fecha: m.message_date.created, leido: m.message_date.read,
    moderacion: m.message_moderation?.status ?? null, adjuntos: (m.message_attachments ?? []).map(a => ({ archivo: a.filename, nombre: a.original_filename || a.filename, tipo: a.type ?? null })),
  })).sort((a, b) => a.fecha.localeCompare(b.fecha))
  // Copia para las sugerencias (lo que ya se respondió a mensajes parecidos). Si falla, no importa.
  await guardarMensajes(db, conexionId, pack, msgs, sellerId).catch(e => console.error('[ml_mensajes]', e))
  // El comprador: quien escribió y no es el vendedor, o a quien le escribió el vendedor.
  const comprador = msgs.find(m => m.from.user_id !== sellerId)?.from.user_id
    ?? msgs.find(m => m.from.user_id === sellerId)?.to?.user_id ?? null
  return { mensajes, comprador, estado: h.conversation_status?.status ?? null }
}

async function sellerDe(db: Pool, conexionId: number): Promise<number> {
  const { rows: [c] } = await db.query(`SELECT ml_user_id FROM ml_conexiones WHERE id = $1`, [conexionId])
  return Number(c.ml_user_id)
}

type OrdenVenta = {
  order_items: { item: { id: string; title: string; variation_id?: number | null; variation_attributes?: { name?: string; value_name?: string | null }[] }; quantity: number; unit_price?: number | null; currency_id?: string | null
                 // Publicación en dólares cobrada en bolívares: ML guarda la moneda y la tasa de la conversión.
                 base_currency_id?: string | null; base_exchange_rate?: number | null }[]
  date_created?: string
  buyer?: { id: number; nickname?: string; first_name?: string; last_name?: string }
}

/** Las órdenes de una venta (orden suelta o pack). De paso se guardan en ml_ordenes (2026-10-13): una
 *  compra recién hecha que escribe antes de la sincronización horaria ya queda con su producto (foto en
 *  la bandeja) y aparece en Ventas → Por confirmar, sin ninguna llamada extra a ML. */
async function ordenesDeVenta(db: Pool, conexionId: number, pack: string): Promise<OrdenVenta[]> {
  let ordenes: OrdenVenta[]
  try {
    ordenes = [await mlFetch<OrdenVenta>(db, conexionId, `/orders/${pack}`)]
  } catch (e) {
    if (!(e instanceof ErrorML)) throw e
    const p = await mlFetch<{ orders: { id: number }[] }>(db, conexionId, `/packs/${pack}`)
    ordenes = await Promise.all(p.orders.slice(0, 5).map(o => mlFetch<OrdenVenta>(db, conexionId, `/orders/${o.id}`)))
  }
  for (const o of ordenes) {
    await guardarOrden(db, conexionId, o as unknown as Parameters<typeof guardarOrden>[2]).catch(e => console.error('[mensajes] guardar orden', e))
  }
  return ordenes
}

const compradorDe = (ordenes: OrdenVenta[]) => {
  const b = ordenes.find(o => o.buyer)?.buyer
  return {
    id: b?.id ?? null,
    nick: b?.nickname ?? null,
    nombre: [b?.first_name, b?.last_name].filter(Boolean).join(' ').trim() || null,
  }
}

/** Títulos de la venta y comprador (nick y nombre), para la bandeja. */
async function datosDeVenta(db: Pool, conexionId: number, pack: string) {
  try {
    const ordenes = await ordenesDeVenta(db, conexionId, pack)
    return {
      productos: ordenes.flatMap(o => o.order_items).map(i => {
        const v = (i.item.variation_attributes ?? []).filter(a => a.value_name).map(a => a.value_name).join(' / ')
        return `${i.quantity} × ${i.item.title}${v ? ` (${v})` : ''}`
      }).join(' · ') || null,
      ...compradorDe(ordenes),
    }
  } catch { return { productos: null, nick: null, nombre: null } }
}

/** Guarda nick/nombre del comprador de la conversación (los que se conozcan). */
async function guardarComprador(db: Pool, pack: string, nick: string | null, nombre: string | null) {
  if (nick === null && nombre === null) return
  await db.query(
    `UPDATE ml_conversaciones SET comprador_nick = COALESCE($2, comprador_nick), comprador_nombre = COALESCE($3, comprador_nombre)
     WHERE pack_id::text = $1`, [pack, nick, nombre])
}

/** Conversaciones cuyo último mensaje tiene más de esto no se muestran ni se cuentan: la venta ya
 *  está cerrada y ML a veces las sigue reportando "sin leer" por años (nadie las abrió en ML). */
export const DIAS_MENSAJES = 60
export const SQL_MENSAJE_VIGENTE = `(ultimo_at IS NULL OR ultimo_at > NOW() - INTERVAL '${DIAS_MENSAJES} days')`

/** Sincroniza los sin leer de una cuenta. Las que ya no están sin leer pasan a 0. */
export async function sincronizarMensajes(db: Pool, conexionId: number) {
  const seller = await sellerDe(db, conexionId)
  const r = await mlFetch<{ results?: { resource: string; count: number }[] }>(db, conexionId,
    `/messages/unread?role=seller&tag=post_sale`)
  const vistos: string[] = []
  for (const x of r.results ?? []) {
    const m = /\/packs\/(\d+)\//.exec(x.resource)
    if (!m) continue
    const pack = m[1]
    vistos.push(pack)
    const { rows: [prev] } = await db.query(
      `SELECT sin_leer_ml, productos, comprador_nick FROM ml_conversaciones WHERE pack_id = $1`, [pack])
    // Solo se relee el hilo si cambió la cantidad (ahorra llamadas a ML).
    if (prev && prev.sin_leer_ml === x.count && prev.productos !== null) continue
    const hilo = await leerHilo(db, conexionId, pack, seller, false)
    // ML a veces cuenta un mensaje que no muestra (moderado): si no hay ninguno del comprador
    // VISIBLE sin leer, la bandeja no lo cuenta (no se puede marcar y volvía cada minuto).
    const visibles = hilo.mensajes.filter(m => !m.propio && !m.leido).length
    const sinLeer = Math.min(x.count, visibles)
    const ultimo = hilo.mensajes[hilo.mensajes.length - 1]
    const venta = prev?.productos && prev.comprador_nick !== null ? null : await datosDeVenta(db, conexionId, pack)
    const productos = prev?.productos ?? venta?.productos ?? null
    await db.query(
      `INSERT INTO ml_conversaciones (pack_id, conexion_id, sin_leer, ultimo_texto, ultimo_de_comprador, ultimo_at,
                                      comprador_id, productos, sin_leer_ml, actualizada_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (empresa_id, pack_id) DO UPDATE SET
         sin_leer = EXCLUDED.sin_leer, sin_leer_ml = EXCLUDED.sin_leer_ml, ultimo_texto = EXCLUDED.ultimo_texto,
         ultimo_de_comprador = EXCLUDED.ultimo_de_comprador, ultimo_at = EXCLUDED.ultimo_at,
         comprador_id = COALESCE(EXCLUDED.comprador_id, ml_conversaciones.comprador_id),
         productos = COALESCE(ml_conversaciones.productos, EXCLUDED.productos), actualizada_at = NOW()`,
      [pack, conexionId, sinLeer, ultimo?.texto ?? null, ultimo ? !ultimo.propio : null, ultimo?.fecha ?? null,
       hilo.comprador, productos, x.count])
    if (venta) await guardarComprador(db, pack, venta.nick, venta.nombre)
    // Copia de las notas de la venta (para la pestaña "Con nota"); si falla, no importa.
    await leerNotas(db, conexionId, pack).then(r => copiarNotas(db, pack, r.notas)).catch(() => {})
  }
  await db.query(
    `UPDATE ml_conversaciones SET sin_leer = 0, sin_leer_ml = 0, actualizada_at = NOW()
     WHERE conexion_id = $1 AND (sin_leer > 0 OR sin_leer_ml > 0) AND NOT (pack_id::text = ANY($2::text[]))`, [conexionId, vistos])
  // Conversaciones cuyas notas nunca se miraron (las de antes de la pestaña "Con nota"): de a 10.
  const { rows: sinMirar } = await db.query(
    `SELECT pack_id::text FROM ml_conversaciones WHERE conexion_id = $1 AND notas_at IS NULL
     ORDER BY ultimo_at DESC NULLS LAST LIMIT 10`, [conexionId])
  for (const { pack_id } of sinMirar) {
    await leerNotas(db, conexionId, pack_id).then(r => copiarNotas(db, pack_id, r.notas)).catch(() => {})
  }
  // Y las que todavía no tienen el comprador: de a 10 ('' = ML no lo dio, no se reintenta).
  const { rows: sinComprador } = await db.query(
    `SELECT pack_id::text FROM ml_conversaciones WHERE conexion_id = $1 AND comprador_nick IS NULL
     ORDER BY ultimo_at DESC NULLS LAST LIMIT 10`, [conexionId])
  for (const { pack_id } of sinComprador) {
    const v = await datosDeVenta(db, conexionId, pack_id)
    await guardarComprador(db, pack_id, v.nick ?? '', v.nombre)
  }
  // Historia para las sugerencias: las conversaciones de las ventas de los últimos 90 días
  // (ml_ordenes, de Calificaciones), de a 15 por vuelta, de la más nueva. Solo lee (no marca).
  const { rows: historia } = await db.query(
    `SELECT DISTINCT COALESCE(pack_id, id)::text AS venta, MAX(fecha) AS f FROM ml_ordenes
     WHERE conexion_id = $1 AND mensajes_at IS NULL GROUP BY 1 ORDER BY f DESC LIMIT 15`, [conexionId])
  for (const { venta } of historia) {
    await leerHilo(db, conexionId, venta, seller, false).catch(() => null)
    await db.query(`UPDATE ml_ordenes SET mensajes_at = NOW() WHERE COALESCE(pack_id, id)::text = $1`, [venta])
  }
  return vistos.length
}

/** Responde en la conversación y la deja al día en la bandeja. Con `dejarSinLeer` no se
 *  marca como leída en ML (ML no permite volver a "no leída", así que se evita marcarla);
 *  después se consulta a ML si de verdad quedó sin leer. */
export async function responderHilo(db: Pool, conexionId: number, pack: string, texto: string, dejarSinLeer = false, adjuntos: string[] = []) {
  const seller = await sellerDe(db, conexionId)
  const antes = await leerHilo(db, conexionId, pack, seller, !dejarSinLeer)
  if (!antes.comprador) throw new Error('No se pudo identificar al comprador de esta conversación')
  await mlFetch(db, conexionId, `/messages/packs/${pack}/sellers/${seller}?tag=post_sale`, {
    method: 'POST', body: {
      from: { user_id: seller }, to: { user_id: antes.comprador }, text: texto,
      ...(adjuntos.length ? { attachments: adjuntos } : {}),
    },
  })
  const despues = await leerHilo(db, conexionId, pack, seller, !dejarSinLeer)
  const ultimo = despues.mensajes[despues.mensajes.length - 1]
  const sinLeer = dejarSinLeer ? await sinLeerEnML(db, conexionId, pack, seller) : 0
  await db.query(
    `UPDATE ml_conversaciones SET sin_leer = $4, ultimo_texto = $2, ultimo_de_comprador = FALSE, ultimo_at = $3,
            actualizada_at = NOW() WHERE pack_id = $1`, [pack, ultimo?.texto || texto || (adjuntos.length ? '📎 Archivo' : ''), ultimo?.fecha ?? new Date().toISOString(), sinLeer])
  return { ...despues, sinLeer }
}

/** Cuántos mensajes del comprador siguen sin leer en ML en esta conversación. */
export async function sinLeerEnML(db: Pool, conexionId: number, pack: string, sellerId?: number) {
  const seller = sellerId ?? await sellerDe(db, conexionId)
  try {
    const r = await mlFetch<{ results?: { count: number }[] }>(db, conexionId,
      `/messages/unread/packs/${pack}/sellers/${seller}?tag=post_sale`)
    return r.results?.reduce((a, x) => a + x.count, 0) ?? 0
  } catch { return 0 }
}

/** Descarga un adjunto de la conversación (foto, PDF…) desde ML, para mostrarlo en el sistema.
 *  Solo si el archivo es de ESA conversación (no se puede pedir cualquier archivo). */
export async function adjuntoDeHilo(db: Pool, conexionId: number, pack: string, archivo: string) {
  const { rows: [c] } = await db.query(`SELECT ml_user_id, site_id FROM ml_conexiones WHERE id = $1`, [conexionId])
  const hilo = await leerHilo(db, conexionId, pack, Number(c.ml_user_id), false)
  if (!hilo.mensajes.some(m => m.adjuntos.some(a => a.archivo === archivo))) return null
  const url = `${ML_API}/messages/attachments/${encodeURIComponent(archivo)}?tag=post_sale&site_id=${c.site_id || 'MLV'}`
  let r = await fetch(url, { headers: { Authorization: `Bearer ${await tokenVigente(db, conexionId)}` }, cache: 'no-store' })
  if (r.status === 401) r = await fetch(url, { headers: { Authorization: `Bearer ${await tokenVigente(db, conexionId, true)}` }, cache: 'no-store' })
  if (!r.ok) throw new ErrorML(r.status, null, `MercadoLibre respondió ${r.status} al pedir el adjunto`)
  return r
}

/** Sube un archivo (JPG, PNG, PDF o TXT) a ML para mandarlo en un mensaje: devuelve su id.
 *  ML lo borra si no se usa en 48 h, así que se sube justo antes de responder. */
export async function subirAdjunto(db: Pool, conexionId: number, archivo: File) {
  const { rows: [c] } = await db.query(`SELECT site_id FROM ml_conexiones WHERE id = $1`, [conexionId])
  const url = `${ML_API}/messages/attachments?tag=post_sale&site_id=${c.site_id || 'MLV'}`
  const enviar = async (forzar: boolean) => {
    const form = new FormData()
    form.append('file', archivo, archivo.name)
    return fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${await tokenVigente(db, conexionId, forzar)}` }, body: form, cache: 'no-store' })
  }
  // Demostración: el archivo no sale de aquí (el mensaje se "manda" sin el adjunto).
  let r: Response
  try { r = await enviar(false) } catch (e) { if (e instanceof CuentaDemo) return `demo-${archivo.name}`; throw e }
  if (r.status === 401) r = await enviar(true)
  const d = await r.json().catch(() => null) as { id?: string; message?: string } | null
  if (!r.ok || !d?.id) throw new ErrorML(r.status, d, `MercadoLibre no aceptó "${archivo.name}"${d?.message ? `: ${d.message}` : ` (${r.status})`}`)
  return d.id
}

/** `variante`: lo que eligió el comprador ("Color: Azul · Talla: M"); el título solo no lo dice. */
export interface ItemVenta { id: string; titulo: string; variante: string | null; cantidad: number; precio: number | null; moneda: string | null; link: string | null; imagen: string | null
  /** Precio unitario en dólares al que se vendió (con el descuento): la conversión de ML o, si no la
   *  trae, Bs ÷ tasa BCV del día de la venta (usd_aprox). */
  usd?: number | null; usd_aprox?: boolean
  /** Situación de la publicación hoy en ML: activa / agotada / pausada a mano (catálogo). */
  situacion?: 'activa' | 'agotada' | 'pausada' | 'pausada_ml' | null
  disponible?: number | null   // unidades disponibles hoy en ML (catálogo)
  /** Envío gratis de esta compra según el precio pagado y el peso del portal (ZOOM y TEALCA / solo TEALCA / destino). */
  envio?: { estado: 'ambas' | 'tealca' | 'destino' | 'sin_peso'; texto: string } | null }

/** Productos de la venta con el link a cada publicación, y el comprador (se guarda en la bandeja). */
export async function itemsDeVenta(db: Pool, conexionId: number, pack: string) {
  const ordenes = await ordenesDeVenta(db, conexionId, pack)
  const comprador = compradorDe(ordenes)
  await guardarComprador(db, pack, comprador.nick, comprador.nombre)
  const items: (ItemVenta & { varId: number | null })[] = ordenes.flatMap(o => o.order_items).map(i => {
    const m = /^(M[A-Z]{2})(\d+)$/.exec(i.item.id)
    const link = m ? `https://articulo.mercadolibre.${m[1] === 'MCO' ? 'com.co' : 'com.ve'}/${m[1]}-${m[2]}-_JM` : null
    const variante = (i.item.variation_attributes ?? []).filter(a => a.value_name).map(a => `${a.name}: ${a.value_name}`).join(' · ') || null
    const tasaML = i.base_currency_id === 'USD' && i.base_exchange_rate && i.base_exchange_rate > 0 ? i.base_exchange_rate : null
    const usd = i.currency_id === 'USD' ? i.unit_price ?? null : tasaML && i.unit_price ? i.unit_price / tasaML : null
    return { id: i.item.id, titulo: i.item.title, variante, cantidad: i.quantity, precio: i.unit_price ?? null, moneda: i.currency_id ?? null,
             usd, usd_aprox: false, link, imagen: null as string | null, varId: i.item.variation_id ?? null }
  })
  // Sin la conversión de ML: Bs ÷ tasa oficial (BCV) del día de la venta, marcado como aproximado.
  if (items.some(it => it.usd == null && it.moneda === 'VES' && it.precio)) {
    const dia = ordenes[0]?.date_created ? ordenes[0].date_created.slice(0, 10) : null
    const { rows: [t] } = await db.query(
      `SELECT official_rate::float AS r FROM venezuela_exchange_rates
       WHERE ($1::date IS NULL OR rate_date <= $1::date) ORDER BY rate_date DESC, created_at DESC LIMIT 1`, [dia])
    if (t?.r) for (const it of items) if (it.usd == null && it.moneda === 'VES' && it.precio) { it.usd = it.precio / t.r; it.usd_aprox = true }
  }
  await Promise.all(items.map(async it => { it.imagen = await imagenDeItem(db, conexionId, it.id, it.varId).catch(() => null) }))
  // Peso del portal de MercadoEnvíos (el de la publicación; un combo trae el suyo): con lo que pagó por todas las unidades.
  // Solo empresas con Promociones (las demás, como antes).
  const { rows: sits } = await db.query(`SELECT x AS item, ${sqlSituacion('x')} AS s, ${sqlDisponible('x')} AS d FROM unnest($1::text[]) x`,
    [[...new Set(items.map(it => it.id))]]).catch(() => ({ rows: [] as { item: string; s: ItemVenta['situacion']; d: number | null }[] }))
  for (const it of items) {
    const r = sits.find(x => x.item === it.id)
    it.situacion = r?.s ?? null
    it.disponible = r?.d ?? null
  }
  // Sin peso en el portal (pausada o sin envío configurado): el del producto vinculado; si tampoco hay, se avisa.
  const conEnvio = await empresaConPromociones(db)
  const { rows: pesos } = !conEnvio ? { rows: [] as { publicacion: string; kg: number | null }[] } : await db.query(
    `SELECT x AS publicacion, ${sqlPesoPublicacion('x')} AS kg FROM unnest($1::text[]) x`,
    [[...new Set(items.map(it => it.id))]]).catch(() => ({ rows: [] as { publicacion: string; kg: number | null }[] }))
  for (const it of items) {
    if (!conEnvio || !it.usd) { it.envio = null; continue }
    const kg = pesos.find(p => p.publicacion === it.id)?.kg
    const e = kg ? envioGratisAhora(kg * it.cantidad, it.usd * it.cantidad) : null
    it.envio = e ? { estado: e.estado, texto: e.texto }
      : { estado: 'sin_peso', texto: 'Sin peso: no está en el portal de MercadoEnvíos ni vinculada a un producto con peso' }
  }
  return { items: items.map(({ varId: _v, ...it }) => it), comprador }
}

/** Foto del producto vendido: la de la variante (el color que compró) si la publicación tiene
 *  variantes; si no, la portada ya guardada (catálogo o preguntas) sin consultar a ML. */
export async function imagenDeItem(db: Pool, conexionId: number, itemId: string, varId: number | null): Promise<string | null> {
  const https = (u?: string | null) => u ? u.replace(/^http:/, 'https:') : null
  if (!varId) {
    const { rows: [g] } = await db.query(
      `SELECT COALESCE((SELECT thumbnail FROM ml_catalogo WHERE item_id = $1),
                       (SELECT item_imagen FROM ml_preguntas WHERE item_id = $1 AND item_imagen IS NOT NULL LIMIT 1)) AS img`, [itemId])
    if (g?.img) return g.img
  }
  const it = await mlFetch<{ thumbnail?: string; pictures?: { id: string; secure_url?: string; url?: string }[];
                             variations?: { id: number; picture_ids?: string[] }[] }>(
    db, conexionId, `/items/${itemId}?attributes=thumbnail,pictures,variations`)
  const fotoId = it.variations?.find(v => v.id === varId)?.picture_ids?.[0]
  const foto = fotoId ? it.pictures?.find(p => p.id === fotoId) : null
  return https(foto?.secure_url ?? foto?.url ?? it.thumbnail)
}

// ── Sugerencias (gratis, sin IA): lo que ya se respondió a mensajes parecidos ────────────────
/** Texto plano para comparar (sin links ni etiquetas de ML). */
export const textoPlano = (t: string) =>
  t.replace(/<br\s*\/?>/gi, ' ').replace(/<a\s[^>]*>(.*?)<\/a>/gi, '$1').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

async function guardarMensajes(db: Pool, conexionId: number, pack: string, msgs: MensajeApi[], sellerId: number) {
  const filas = msgs.filter(m => m.id && m.text?.trim())
  if (!filas.length) return
  await db.query(
    `INSERT INTO ml_mensajes (msg_id, pack_id, conexion_id, propio, texto, fecha)
     SELECT * FROM unnest($1::text[], $2::bigint[], $3::int[], $4::bool[], $5::text[], $6::timestamptz[])
     ON CONFLICT (empresa_id, msg_id) DO NOTHING`,
    [filas.map(m => m.id), filas.map(() => pack), filas.map(() => conexionId), filas.map(m => m.from.user_id === sellerId),
     filas.map(m => textoPlano(m.text)), filas.map(m => m.message_date.created)])
}

// Mensajes automáticos del vendedor que NO son respuestas (no se sugieren): el aviso de ML con
// la guía, el mensaje de bienvenida y los del Reportador.
const AUTOMATICOS = '(n[uú]mero de gu[ií]a para tu env[ií]o|gracias por preferirnos|gu[ií]a (zoom|tealca)|gu[ií]a de rastreo|podr[aá]s validar el paso a paso)'

export interface Sugerencia { pregunta: string; respuesta: string; parecido: number }

const SOLO_SALUDO = /^((hola|holis|buenas|buenos|buen|dias|dia|tardes|noches|saludos|que tal|como esta[s]?|amigo|amiga|hey)\s*)+$/

/** Para lo último que escribió el comprador: qué se le respondió a mensajes parecidos en
 *  otras ventas (la primera respuesta del vendedor dentro de los 3 días). Hasta 3, sin repetir. */
export async function sugerenciasMensaje(db: Pool, pack: string, limite = 3): Promise<{ consulta: string | null; sugerencias: Sugerencia[] }> {
  const { rows } = await db.query(
    `SELECT propio, texto FROM ml_mensajes WHERE pack_id = $1 ORDER BY fecha DESC LIMIT 10`, [pack])
  const ultimos: string[] = []
  for (const m of rows) { if (m.propio) break; ultimos.unshift(m.texto) }
  const consulta = ultimos.join(' ').trim().slice(0, 500)
  if (!consulta) return { consulta: null, sugerencias: [] }
  // Un saludo solo ("Hola", "Buenas tardes") no dice qué quiere: lo que se respondió a otros
  // saludos depende de cada caso, así que no se sugiere nada.
  if (SOLO_SALUDO.test(consulta.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z ]/g, ' ').trim())) {
    return { consulta, sugerencias: [] }
  }
  const { rows: pares } = await db.query(
    // Parecido = se escribe parecido (trigramas) o comparte al menos 2 palabras en español con lo
    // que escribió el comprador ("llega/llegó", "guía"…); primero las que comparten más.
    `WITH qw AS (SELECT tsvector_to_array(to_tsvector('spanish', $1)) AS w)
     SELECT b.texto AS pregunta, r.texto AS respuesta, similarity(b.texto, $1)::float AS parecido
     FROM ml_mensajes b CROSS JOIN qw
     JOIN LATERAL (SELECT COUNT(*)::int AS n FROM unnest(tsvector_to_array(to_tsvector('spanish', b.texto))) t
                   WHERE t = ANY(qw.w)) x ON TRUE
     JOIN LATERAL (
       SELECT texto FROM ml_mensajes r
       WHERE r.pack_id = b.pack_id AND r.propio AND r.fecha > b.fecha AND r.fecha < b.fecha + INTERVAL '3 days'
       ORDER BY r.fecha LIMIT 1) r ON TRUE
     WHERE NOT b.propio AND b.pack_id <> $2 AND (b.texto % $1 OR x.n >= LEAST(2, cardinality(qw.w)))
       AND r.texto !~* $3
     ORDER BY x.n DESC, parecido DESC LIMIT 30`, [consulta, pack, AUTOMATICOS])
  const vistas = new Set<string>()
  const sugerencias: Sugerencia[] = []
  for (const x of pares) {
    const clave = x.respuesta.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, ' ').trim()
    if (vistas.has(clave)) continue
    vistas.add(clave)
    sugerencias.push(x)
    if (sugerencias.length === limite) break
  }
  return { consulta, sugerencias }
}
