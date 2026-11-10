// Preguntas de MercadoLibre: sincronización de la bandeja, borrador con IA y envío.
//
// Reglas aprendidas contra la API real (MLV):
//   - usar siempre api_version=4; limit máximo 50; el offset muere en 1000;
//   - que ML acepte el POST /answers NO significa que se publicó: se relee la pregunta y
//     solo cuenta si quedó ANSWERED con la respuesta ACTIVE;
//   - ML descarta textos con links externos o datos de contacto: se revisan antes;
//   - las preguntas de publicaciones pausadas no salen en el panel de ML pero la API sí
//     las trae: acá se muestran con aviso para que ninguna se quede colgada.
import { politicasIA } from '@/lib/miIA'
import { empresaConPromociones, sqlPesoPublicacion } from '@/lib/promocionesSesion'
import { envioGratisAhora, huecoVariasUnidades, textoHueco } from '@/lib/mlShipping'
import { leerTablasEnvio } from '@/lib/mlShippingDb'
import { llamarClaude, MODELO_SIMPLE, type LlamadaIA } from '@/lib/ia'
import type { Pool } from 'pg'
import { mlFetch, CuentaDesconectada } from '@/lib/ml'
import { sincronizarMensajes } from '@/lib/mensajesML'
import { avisosCaidos } from '@/lib/notificacionesML'
import { sincronizarOrdenes } from '@/lib/calificacionesML'
import { completarNombres } from '@/lib/porConfirmar'
import { otrasPublicaciones, type OtraPublicacion } from '@/lib/catalogoML'
import { fichasActivas } from '@/lib/fichasIA'
import { contextoFotos, fichaDeAtributos, lineasFotos, type ContextoFotos, type FotoML } from '@/lib/fotosIA'
import { verificarBorrador } from '@/lib/verificadorIA'
import { esDemo } from '@/lib/demo'
import { riesgoDe } from '@/lib/sugerenciasPreguntas'
import { variantesDe, textoVariantes, type Variante, type VariacionML } from '@/lib/variantesML'

// ── Tipos de la API (lo que usamos) ────────────────────────────────────────
export interface PreguntaML {
  id: number; item_id: string; status: string; text: string; date_created: string
  from?: { id?: number }
  answer?: { text: string; status: string; date_created: string } | null
}
interface BusquedaML { total: number; questions: PreguntaML[] }

// Las fechas de ML traen nanosegundos: Postgres las acepta, pero se recortan igual para
// que cualquier otro parser (JS) no falle.
const fechaML = (s?: string | null) => s ? s.replace(/(\.\d{6})\d+/, '$1') : null

export async function guardarPregunta(db: Pool, conexionId: number, q: PreguntaML) {
  await db.query(
    `INSERT INTO ml_preguntas (id, conexion_id, item_id, texto, estado, fecha, comprador_id,
                               respuesta, respuesta_estado, respuesta_fecha, sincronizada_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (empresa_id, id) DO UPDATE SET
       estado = EXCLUDED.estado, texto = EXCLUDED.texto,
       respuesta = COALESCE(EXCLUDED.respuesta, ml_preguntas.respuesta),
       respuesta_estado = COALESCE(EXCLUDED.respuesta_estado, ml_preguntas.respuesta_estado),
       respuesta_fecha = COALESCE(EXCLUDED.respuesta_fecha, ml_preguntas.respuesta_fecha),
       sincronizada_at = NOW()`,
    [q.id, conexionId, q.item_id, q.text, q.status, fechaML(q.date_created), q.from?.id ?? null,
     q.answer?.text ?? null, q.answer?.status ?? null, fechaML(q.answer?.date_created)])
}

async function buscar(db: Pool, conexionId: number, status: string, maxPaginas: number) {
  const out: PreguntaML[] = []
  for (let p = 0; p < maxPaginas; p++) {
    const offset = p * 50
    if (offset >= 1000) break                                   // tope de la API
    const r = await mlFetch<BusquedaML>(db, conexionId,
      `/my/received_questions/search?api_version=4&status=${status}&limit=50&offset=${offset}` +
      `&sort_fields=date_created&sort_types=DESC`)
    out.push(...(r.questions ?? []))
    if ((r.questions?.length ?? 0) < 50 || out.length >= r.total) break
  }
  return out
}

/**
 * Títulos/links/estado de las publicaciones que todavía no los tienen. De a UNA: en MLV
 * el multiget (/items?ids=) responde 403 (PolicyAgent) y /items/{id}?attributes= no.
 * Primero las de preguntas pendientes; un tope por pasada para no gastar el cron entero.
 * Nunca corta la sincronización: si una falla, queda para la próxima.
 *
 * 01-11: publicaciones que ML no deja leer (cerradas, pausadas por ML o en revisión) se reintentaban en CADA pasada
 * y la cuenta quedaba "Con error" aunque sus preguntas ya estuvieran respondidas. Ahora: un intento fallido marca
 * item_actualizado_at y se reintenta cada 6 h (o al llegar una pregunta nueva en esa publicación, que viene sin la
 * marca), y solo cuenta como aviso si la publicación tiene preguntas SIN responder.
 */
/** Prefijo de un aviso que no es error (la cuenta funciona): Cuentas de ML lo muestra como "Con aviso". */
export const AVISO = 'Aviso:'

async function completarItems(db: Pool, conexionId: number) {
  // Sin título todavía, o pendiente con el precio de hace más de 30 min (las promociones cambian).
  const { rows } = await db.query(
    `SELECT item_id, bool_or(estado = 'UNANSWERED') AS pendiente FROM ml_preguntas
     WHERE conexion_id = $1
       AND ((item_titulo IS NULL AND (item_actualizado_at IS NULL OR item_actualizado_at < NOW() - INTERVAL '6 hours'))
            OR (estado = 'UNANSWERED' AND (item_actualizado_at IS NULL OR item_actualizado_at < NOW() - INTERVAL '30 minutes')))
     GROUP BY item_id ORDER BY bool_or(estado = 'UNANSWERED') DESC, max(fecha) DESC LIMIT 40`, [conexionId])
  let fallas = 0, seguidas = 0
  for (const { item_id, pendiente } of rows) {
    try {
      const it = await mlFetch<{ id: string; title: string; permalink: string; status: string; available_quantity?: number | null
                                 price: number | null; original_price: number | null; currency_id: string | null; thumbnail?: string | null; variations?: unknown[] }>(
        db, conexionId, `/items/${item_id}?attributes=id,title,permalink,status,price,original_price,currency_id,thumbnail,variations,available_quantity`)
      // El precio con la promoción vigente: /sale_price es la fuente nueva de ML; si no
      // responde (permiso / sitio), queda el price del ítem.
      let precio = it.price, original = it.original_price, moneda = it.currency_id
      try {
        const sp = await mlFetch<{ amount: number | null; regular_amount: number | null; currency_id: string | null }>(
          db, conexionId, `/items/${item_id}/sale_price?context=channel_marketplace`)
        if (sp?.amount) { precio = sp.amount; original = sp.regular_amount ?? original; moneda = sp.currency_id ?? moneda }
      } catch { /* sin sale_price: se usa el del ítem */ }
      await db.query(
        `UPDATE ml_preguntas SET item_titulo = $2, item_permalink = $3, item_estado = $4,
                item_precio = $5, item_precio_original = $6, item_moneda = $7,
                item_imagen = COALESCE($8, item_imagen), item_variantes = $9, item_stock_ml = $10, item_actualizado_at = NOW()
         WHERE item_id = $1`,
        [item_id, it.title, it.permalink, it.status, precio, original && original > (precio ?? 0) ? original : null, moneda,
         it.thumbnail ? it.thumbnail.replace(/^http:/, 'https:') : null, it.variations?.length ?? 0,
         Number.isFinite(it.available_quantity) ? it.available_quantity : null])
    } catch {
      await db.query(`UPDATE ml_preguntas SET item_actualizado_at = NOW() WHERE conexion_id = $1 AND item_id = $2`, [conexionId, item_id])
      if (pendiente) fallas++
      if (++seguidas >= 3) break          // si ML bloquea a todas, no insistir en esta pasada
      continue
    }
    seguidas = 0
  }
  return fallas   // solo las que afectan preguntas sin responder
}

export interface ResultadoSync { cuenta: string; nuevas?: number; error?: string }

/** Notificaciones paso 2b (28-10): la pregunta avisada por ML (topic questions: nueva o respondida) entra al momento,
 *  con el título y el precio de su publicación. Devuelve su estado o null si ML la borró. */
export async function guardarPreguntaNotificada(db: Pool, conexionId: number, preguntaId: string) {
  try {
    const q = await mlFetch<PreguntaML>(db, conexionId, `/questions/${preguntaId}?api_version=4`)
    await guardarPregunta(db, conexionId, q)
    await completarItems(db, conexionId)
    return q.status
  } catch (e) {
    if ((e as { status?: number }).status === 404) {
      await db.query(`UPDATE ml_preguntas SET estado = 'DELETED', sincronizada_at = NOW() WHERE id = $1`, [preguntaId])
      return null
    }
    throw e
  }
}

/** Con los avisos de ML llegando (paso 2b), la búsqueda de preguntas y de mensajes sin leer de cada cuenta es un
 *  BARRIDO de seguridad cada BARRIDO_MIN (lo que un aviso perdido no trajo: ML pierde ~2-8%); si los avisos se caen
 *  (avisosCaidos) o en staging, vuelve a cada minuto como antes. En memoria: al reiniciar barre enseguida. */
export const BARRIDO_MIN = 15
const barridoAt = new Map<number, number>()

/**
 * Trae las preguntas de todas las cuentas activas de la empresa de `db`:
 *   - todas las sin responder (UNANSWERED);
 *   - las que teníamos sin responder y ya no lo están (se respondieron desde ML, se
 *     borraron…): se relee cada una para dejarla al día;
 *   - la primera vez, el histórico respondido (hasta el tope de 1000) para que la IA
 *     aprenda del tono y las políticas del vendedor.
 */
export async function sincronizarEmpresa(db: Pool, forzar = false): Promise<ResultadoSync[]> {
  // Demostración: sus datos son los sembrados (lib/demoDatos.ts); no hay nada que traer.
  if (await esDemo(db)) return []
  const { rows: cuentas } = await db.query(
    `SELECT id, nickname, ultima_sync FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
  const conAvisos = !forzar && !(await avisosCaidos())
  const res: ResultadoSync[] = []
  for (const c of cuentas) {
    try {
      const { rows: [{ n: antes }] } = await db.query(`SELECT COUNT(*)::int AS n FROM ml_preguntas WHERE conexion_id = $1`, [c.id])
      const barrer = !conAvisos || !c.ultima_sync || (barridoAt.get(c.id) ?? 0) < Date.now() - BARRIDO_MIN * 60_000
      if (barrer) {
      const pendientes = await buscar(db, c.id, 'UNANSWERED', 20)
      for (const q of pendientes) await guardarPregunta(db, c.id, q)

      const vivas = new Set(pendientes.map(q => q.id))
      const { rows: viejas } = await db.query(
        `SELECT id FROM ml_preguntas WHERE conexion_id = $1 AND estado = 'UNANSWERED' ORDER BY fecha LIMIT 100`, [c.id])
      for (const v of viejas) {
        if (vivas.has(Number(v.id))) continue
        try {
          await guardarPregunta(db, c.id, await mlFetch<PreguntaML>(db, c.id, `/questions/${v.id}?api_version=4`))
        } catch (e) {
          // Borrada del todo en ML: se marca para que no siga como pendiente.
          if ((e as { status?: number }).status === 404) {
            await db.query(`UPDATE ml_preguntas SET estado = 'DELETED', sincronizada_at = NOW() WHERE id = $1`, [v.id])
          } else throw e
        }
      }

      if (!c.ultima_sync) {
        for (const q of await buscar(db, c.id, 'ANSWERED', 20)) await guardarPregunta(db, c.id, q)
      }
      barridoAt.set(c.id, Date.now())
      }
      // Las preguntas ya quedaron al día (por barrido o por aviso): se marca antes de lo opcional (títulos).
      await db.query(`UPDATE ml_conexiones SET ultima_sync = NOW(), ultimo_error = NULL WHERE id = $1`, [c.id])
      // Mensajes post-venta sin leer (bandeja Mensajes; entre barridos solo el relleno de notas e historia). No corta la sync de preguntas.
      try { await sincronizarMensajes(db, c.id, barrer) } catch (e) {
        console.error('[ML mensajes]', c.nickname, e instanceof Error ? e.message : e)
      }
      // Ventas para calificar (cada SYNC_MINUTOS; adentro decide si toca).
      try { await sincronizarOrdenes(db, c.id) } catch (e) {
        console.error('[ML ventas]', c.nickname, e instanceof Error ? e.message : e)
      }
      // Reputación: termómetro de la cuenta y calificaciones recibidas (lib/reputacionML.ts).
      try { await sincronizarReputacion(db, c.id) } catch (e) {
        console.error('[ML reputacion]', c.nickname, e instanceof Error ? e.message : e)
      }
      const fallas = await completarItems(db, c.id)
      if (fallas) {
        await db.query(`UPDATE ml_conexiones SET ultimo_error = $2 WHERE id = $1`,
          [c.id, `${AVISO} hay preguntas sin responder en publicaciones que MercadoLibre no deja ver (cerradas o en revisión): se muestran sin título.`])
      }
      const { rows: [{ n: despues }] } = await db.query(`SELECT COUNT(*)::int AS n FROM ml_preguntas WHERE conexion_id = $1`, [c.id])
      res.push({ cuenta: c.nickname, nuevas: despues - antes })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!(e instanceof CuentaDesconectada)) {
        await db.query(`UPDATE ml_conexiones SET ultimo_error = $2 WHERE id = $1`, [c.id, msg.slice(0, 500)])
      }
      res.push({ cuenta: c.nickname, error: msg })
    }
  }
  // Ventas → Por confirmar: nombre real de las que tienen pago (lib/porConfirmar.ts).
  try { await completarNombres(db) } catch (e) {
    console.error('[ML nombres]', e instanceof Error ? e.message : e)
  }
  return res
}

// Revisión del texto: lib/preguntasTexto.ts (se usa también en el navegador).
export { problemasDelTexto } from '@/lib/preguntasTexto'
import { leerPlantillas, plantillaAplica, condicionPlantilla, type Plantilla } from '@/lib/preguntasTexto'
import { rellenarVariables } from '@/lib/variablesTexto'
import { sincronizarReputacion } from '@/lib/reputacionML'

// ── Contexto para la IA ─────────────────────────────────────────────────────
interface ItemML {
  id: string; title: string; price: number; currency_id: string; available_quantity: number
  condition: string; status: string; permalink: string; category_id?: string | null
  attributes?: { name: string; value_name: string | null }[]
  shipping?: { free_shipping?: boolean }
  warranty?: string | null
  variations?: VariacionML[]
  pictures?: FotoML[]
}

/** Lo que el vendedor dejó escrito como regla (Mi IA/políticas + respuestas rápidas): respalda medios de pago (v2). */
export function textoVendedor(c: Contexto) {
  return [c.politicas, ...c.plantillas.map(p => p.texto)].filter(Boolean).join('\n')
}

/** Textos de la publicación (título, descripción, ficha, producto) para comprobar lo que la IA afirma. */

export function datosPublicacion(c: Contexto) {
  return [c.item?.title, c.titulo, c.descripcion, c.ficha?.texto, c.producto?.name].filter(Boolean).join(' \n ')
}

/** Todo lo escrito de la publicación para el freno de compatibilidad con vehículos (lib/iaCompatibilidad.ts): lo anterior +
 *  ficha técnica de ML + notas del vendedor + lo que se ve en las fotos. Una compatibilidad "universal" dicha en cualquiera
 *  de ellos respalda la respuesta, sea cual sea el modelo que pregunten. */
export function datosCompatibilidad(c: Contexto) {
  const tecnica = (c.item?.attributes ?? []).filter(a => a.value_name).map(a => `${a.name}: ${a.value_name}`).join('; ')
  return [datosPublicacion(c), tecnica, ...(c.notas ?? []), c.fotos?.texto].filter(Boolean).join(' \n ')
}

export interface Contexto {
  pregunta: { id: number; texto: string; item_id: string; fecha: string }
  item: ItemML | null
  titulo: string | null            // guardado en la bandeja (si ML no deja leer la publicación)
  precioML: { precio: number; original: number | null; moneda: string } | null   // con la promoción vigente
  envio: string | null             // envío gratis al precio de ahora (ZOOM y TEALCA / solo TEALCA / cobro a destino)
  descripcion: string | null
  producto: { code: string; name: string; stock: number; precio_usd: number | null } | null
  tasa: number | null
  politicas: string
  plantillas: Plantilla[]
  notas: string[]
  mismoItem: { p: string; r: string; f?: string }[]     // f = fecha (10-11: lo más nuevo manda)
  parecidas: { p: string; r: string; f?: string }[]
  catalogo?: string | null                                   // link a todas las publicaciones de la cuenta (10-11)
  ficha: { texto: string; dudas: string | null } | null     // ficha de conocimiento de la publicación
  fotos?: ContextoFotos | null                               // lo que se ve en las fotos (mig 146)
  otras: OtraPublicacion[]                                   // otras publicaciones del vendedor
  variantes?: Variante[]                                     // stock por variante (31-10)
  delComprador?: { p: string; r: string | null; fecha: string }[]   // sus preguntas anteriores (31-10)
  minimo?: { precioMenor: number; unidades: number } | null        // Mi IA (06-11): mínimo de unidades en productos baratos
}

export async function armarContexto(db: Pool, preguntaId: number, country: string): Promise<Contexto & { conexionId: number }> {
  const { rows: [q] } = await db.query(
    `SELECT id, conexion_id, item_id, item_titulo, item_precio::float, item_precio_original::float, item_moneda, texto, fecha, comprador_id FROM ml_preguntas WHERE id = $1`, [preguntaId])
  if (!q) throw new Error('Pregunta no encontrada')

  let item: ItemML | null = null
  let descripcion: string | null = null
  // Con `attributes=` explícito: el GET completo lo puede frenar el PolicyAgent de ML.
  try {
    item = await mlFetch<ItemML>(db, q.conexion_id, `/items/${q.item_id}?attributes=` +
      'id,title,price,currency_id,available_quantity,condition,status,permalink,category_id,attributes,shipping,warranty,variations,pictures')
  } catch { /* sin datos de ML: la IA trabaja con el resto */ }
  try {
    const d = await mlFetch<{ plain_text?: string }>(db, q.conexion_id, `/items/${q.item_id}/description`)
    descripcion = d.plain_text?.trim() || null
  } catch { /* publicación sin descripción */ }

  // Producto propio: el código ML se guarda sin el prefijo del sitio (MLV768007052 → 768007052).
  const codigo = String(q.item_id).replace(/^[A-Z]{3}/, '')
  const { rows: [prod] } = await db.query(
    `SELECT p.code, p.name, (CASE WHEN m.ml_code LIKE '%:%' THEN SUM(COALESCE(i.quantity, 0)) OVER () ELSE COALESCE(i.quantity, 0) END)::int AS stock, pp.final_price_usd::float AS precio_usd
     FROM product_ml_codes m
     JOIN products p ON p.id = m.product_id
     LEFT JOIN inventory i ON i.product_id = p.id
     LEFT JOIN product_pricing pp ON pp.product_id = p.id
     WHERE split_part(m.ml_code, ':', 1) = $1 AND p.is_active   -- también los productos por variante (stock sumado)
     ORDER BY (m.ml_code LIKE '%:%')
     LIMIT 1`, [codigo])
  const { rows: [tasa] } = await db.query(
    `SELECT official_rate::float AS r FROM venezuela_exchange_rates ORDER BY rate_date DESC, created_at DESC LIMIT 1`)
  // Envío gratis por transportista: solo empresas con Promociones (las demás, como antes).
  let envio: ReturnType<typeof envioGratisAhora> = null
  let hueco: ReturnType<typeof huecoVariasUnidades> = null
  if ((q.item_moneda ?? 'USD') === 'USD' && await empresaConPromociones(db)) {
    const { rows: [peso] } = await db.query(`SELECT ${sqlPesoPublicacion('$1::text')} AS kg`, [q.item_id]).catch(() => ({ rows: [] }))
    const tablas = await leerTablasEnvio(db)
    envio = envioGratisAhora(peso?.kg, q.item_precio, q.item_precio_original, tablas)
    hueco = envio ? huecoVariasUnidades(peso?.kg, q.item_precio, q.item_precio_original, tablas) : null
  }
  // Mi IA (06-11, lib/miIA.ts) + el texto libre de siempre. Sin Mi IA guardada, igual que antes.
  const pol = await politicasIA(db, 'preguntas', q.texto)
  const { rows: [pl] } = await db.query(`SELECT value FROM app_settings WHERE key = 'preguntas_plantillas'`)
  // 10-11 (el dueño): los datos anotados o aprendidos valen para TODAS las publicaciones vinculadas al mismo producto del
  // inventario (el medidor tiene 2 publicaciones y se corregía lo mismo en las dos). Sin inventario, solo esta publicación.
  const { rows: notas } = await db.query(
    `SELECT texto FROM ml_item_notas
     WHERE item_id = $1 OR item_id IN (
       SELECT substr($1, 1, 3) || split_part(m2.ml_code, ':', 1) FROM product_ml_codes m1
       JOIN product_ml_codes m2 ON m2.product_id = m1.product_id AND m2.is_active
       WHERE m1.is_active AND split_part(m1.ml_code, ':', 1) = $2)
     ORDER BY (item_id = $1) DESC, created_at DESC LIMIT 20`, [q.item_id, codigo])
  // Memoria de la IA = TODAS las respuestas del vendedor (decisión del dueño, 2026-10-03; antes
  // eran las últimas 1.000 por cuenta). Parecidas = se escribe parecido (trigramas) O comparte
  // al menos 2 palabras en español con la pregunta ("conectar/conecta", "copiloto"…), ordenadas
  // por cuántas comparte; a igual parecido, la más reciente (la logística y las políticas cambian).
  const { rows: mismo } = await db.query(
    `${PALABRAS_CTE}
     SELECT p.texto AS p, p.respuesta AS r, to_char(p.fecha, 'DD-MM-YYYY') AS f FROM ml_preguntas p, qw, ${COMPARTIDAS}
     WHERE p.item_id = $1 AND p.id <> $2 AND p.estado = 'ANSWERED' AND p.respuesta IS NOT NULL
     ORDER BY x.n DESC, similarity(p.texto, $3) DESC, p.fecha DESC
     LIMIT 12`, [q.item_id, q.id, q.texto])   // 12 (antes 8): sin fichas nuevas, más memoria de la misma publicación
  const { rows: parecidas } = await db.query(
    `${PALABRAS_CTE.split('$3').join('$2')}
     SELECT p.texto AS p, p.respuesta AS r, to_char(p.fecha, 'DD-MM-YYYY') AS f FROM ml_preguntas p, qw, ${COMPARTIDAS}
     WHERE p.item_id <> $1 AND p.estado = 'ANSWERED' AND p.respuesta IS NOT NULL
       AND (p.texto % $2 OR x.n >= LEAST(2, cardinality(qw.w)))
     ORDER BY x.n DESC, similarity(p.texto, $2) DESC, p.fecha DESC
     LIMIT 10`, [q.item_id, q.texto])
  // Fichas apagadas (default): no se leen, la IA trabaja igual para el dueño y los clientes.
  const { rows: [ficha] } = fichasActivas()
    ? await db.query(`SELECT texto, dudas FROM ml_item_fichas WHERE item_id = $1`, [q.item_id])
    : { rows: [] }
  // Se pidió IA en esta publicación: desde ahora merece ficha (fichas POR USO, migración 063).
  await db.query(`UPDATE ml_catalogo SET ia_usada_at = NOW() WHERE item_id = $1`, [q.item_id]).catch(() => {})
  const otras = await otrasPublicaciones(db, q.item_id, item?.title ?? q.item_titulo ?? '', q.texto).catch(() => [])
  // Fotos (mig 146): leídas una vez por publicación; se releen solo si cambió la publicación.
  const fotos = item ? await contextoFotos(db, q.conexion_id, q.item_id,
    { titulo: item.title, ficha: fichaDeAtributos(item.attributes), descripcion, fotos: item.pictures ?? [] }) : null
  const variantes = await variantesDe(db, q.item_id, item?.variations).catch(() => [])
  // Lo que este comprador ya preguntó en los últimos 7 días (31-10): "Sería a El Tocuyo" contesta a "¿cuánto tarda Zoom?".
  const { rows: delComprador } = q.comprador_id ? await db.query(
    `SELECT p.texto AS p, p.respuesta AS r, to_char(p.fecha, 'DD-MM HH24:MI') AS fecha FROM ml_preguntas p
     WHERE p.comprador_id = $1 AND p.id <> $2 AND p.fecha < $3 AND p.fecha > $3::timestamptz - interval '7 days'
     ORDER BY p.fecha DESC LIMIT 5`,
    [q.comprador_id, q.id, q.fecha]) : { rows: [] }
  // Catálogo de la tienda (10-11, lo que hace Mercasist ante la duda): todas las publicaciones de la cuenta. Mi IA lo apaga.
  let catalogo: string | null = null
  if (pol.miIA?.catalogo !== false) {
    const { rows: [cx] } = await db.query(`SELECT ml_user_id, site_id FROM ml_conexiones WHERE id = $1`, [q.conexion_id])
    if (cx?.ml_user_id) catalogo = `https://listado.mercadolibre.${(cx.site_id ?? String(q.item_id).slice(0, 3)) === 'MCO' ? 'com.co' : 'com.ve'}/_CustId_${cx.ml_user_id}`
  }

  return {
    conexionId: q.conexion_id,
    pregunta: { id: Number(q.id), texto: q.texto, item_id: q.item_id, fecha: q.fecha },
    item, titulo: q.item_titulo ?? prod?.name ?? null, descripcion,
    precioML: q.item_precio ? { precio: q.item_precio, original: q.item_precio_original, moneda: q.item_moneda ?? 'USD' } : null,
    envio: envio ? `${envio.texto}${envio.porPromo ? ' (es por la promoción vigente; al terminar vuelve a su envío normal)' : ''}${hueco ? `. OJO: ${textoHueco(hueco).replace(/ · la promo aguanta.*$/, '')}` : ''}` : null,
    producto: prod ?? null,
    tasa: country === 'VE' ? tasa?.r ?? null : null,   // Bs solo aplica en Venezuela
    politicas: pol.texto, minimo: pol.miIA?.envio?.minimo ?? null,
    plantillas: leerPlantillas(pl?.value),
    notas: notas.map(n => n.texto),
    mismoItem: mismo, parecidas,
    ficha: ficha ?? null, otras, fotos,
    variantes, delComprador: delComprador.reverse(), catalogo,
  }
}

// Link corto de una publicación (MLV123 → https://articulo.mercadolibre.com.ve/MLV-123), como lo
// escribe el vendedor: la IA lo copia tal cual (con el link largo llegó a mezclar dos).
const linkCorto = (itemId: string) => {
  const m = /^(M[A-Z]{2})(\d+)$/.exec(itemId)
  return m ? `https://articulo.mercadolibre.${m[1] === 'MCO' ? 'com.co' : 'com.ve'}/${m[1]}-${m[2]}` : '—'
}

// Palabras (raíces en español, sin "de/la/para…") de la pregunta, y cuántas comparte cada
// respuesta guardada: "¿se conecta con otro igual?" → {conect, otro, igual}.
const PALABRAS_CTE = `WITH qw AS (SELECT tsvector_to_array(to_tsvector('spanish', $3)) AS w)`
const COMPARTIDAS = `LATERAL (SELECT COUNT(*)::int AS n FROM unnest(tsvector_to_array(to_tsvector('spanish', p.texto))) t
                              WHERE t = ANY(qw.w)) x`

// ── Borrador con Claude ─────────────────────────────────────────────────────

export { MODELO_IA as MODELO_PREGUNTAS, iaConfigurada } from '@/lib/ia'

const SISTEMA = `Eres quien responde las preguntas de los compradores en las publicaciones de MercadoLibre de un vendedor venezolano. Escribes el BORRADOR; una persona lo revisa antes de publicarlo.

Cómo responder:
- Español de Venezuela, cordial y breve (1 a 3 frases). Saluda corto ("¡Hola!") y cierra corto si el vendedor suele hacerlo.
- Antes de escribir, separa la pregunta en sus partes (cada cosa distinta que pregunta: "¿disponible? ¿son rojos? ¿envían a Valencia?" son tres). Contéstalas TODAS, en el mismo orden, con una frase corta por parte. Si no puedes contestar alguna, la confianza es "baja".
- No agregues información que no preguntó (descuentos, formas de pago, políticas largas) más allá de lo que el vendedor pone siempre en sus respuestas.
- Copia el tono, las frases y las políticas de las RESPUESTAS ANTERIORES DEL VENDEDOR: son su voz real. Adáptalas, no las inventes de cero.
- Usa SOLO los datos que te doy: ficha y descripción de la publicación, FICHA DE CONOCIMIENTO, stock, políticas y notas.
- Las POLÍTICAS DEL VENDEDOR son lo vigente: si una respuesta anterior o la ficha de conocimiento dicen otra cosa (montos o mínimos para envío gratis, agencias, formas de pago, retiro), manda lo que dicen las POLÍTICAS.
- Variantes (color, talla, modelo): usa la tabla VARIANTES. Confirma una variante solo si sus disponibles alcanzan para lo que pide (1 si no dice cantidad); si no alcanza o no existe, no la afirmes: di cuáles sí hay, o deja confianza "baja". Nunca sumes variantes distintas para llegar a una cantidad.
- Si hay PREGUNTAS ANTERIORES DE ESTE MISMO COMPRADOR, úsalas para entender la pregunta (puede estar contestando algo que se le preguntó, como la ciudad).
- Disponibilidad: manda DISPONIBLE EN MERCADOLIBRE: publicación activa y con unidades = disponible, sin dudar (como responde siempre el vendedor). Pausada o sin unidades = no lo afirmes. Si pide una cantidad o variante, confírmala si alcanza; si pide más de lo que hay, no la afirmes.
- Si la publicación no tiene lo que pide el comprador y en OTRAS PUBLICACIONES DEL VENDEDOR hay una que sí lo cumple (según su título o su ficha), recomiéndala como lo hace el vendedor: dile que esta no, que la otra sí, y pon el link de esa publicación tal cual. Si ninguna cumple con certeza, no recomiendes nada.
- Nunca inventes medidas, compatibilidades, garantías, precios ni tiempos de envío. Si el dato no está, di lo que sí sabes del producto y recomiéndale verificarlo con un técnico o en su equipo antes de comprar; si ayuda, pregunta para qué lo necesita. NUNCA prometas "déjanos verificarlo", "lo verificamos" ni "te confirmamos": una vez publicada la respuesta no se puede volver a contestar. Anota lo que faltó en "falta_dato" y deja confianza "baja". Si ni eso sirve, deja la respuesta vacía.
- Si el título, la ficha y la descripción se contradicen justo en lo que pregunta (medida, material, compatibilidad), no elijas uno: anótalo en "falta_dato" con confianza "baja".
- Si la descripción, la ficha, las notas o lo que se ve en las fotos dicen que el producto es universal o sirve para cualquier vehículo o equipo (o listan lo compatible), eso responde a CUALQUIER modelo concreto que pregunten: confirma que sirve, sin pedir el modelo y sin decir "no es de un modelo en específico", y repite lo que ahí se aclare (accesorios que se venden aparte, medidas, condiciones). Si no dice nada de compatibilidad, no lo afirmes.
- Prohibido: links (salvo el de otra publicación del vendedor, tal cual viene en OTRAS PUBLICACIONES), páginas web, correos, teléfonos, redes sociales, "escríbeme al…". MercadoLibre borra esas respuestas.
- En Venezuela MercadoLibre no tiene carrito de compras: no lo menciones.
- "falta_dato": una frase corta (máximo 25 palabras) para el vendedor.
- No prometas descuentos ni cosas fuera de las políticas.

Reglas estrictas (una respuesta equivocada publicada sola le cuesta una venta o un reclamo al vendedor):
- Colores, tallas, medidas, números técnicos (temperatura, voltaje, capacidad, autonomía) y qué incluye: SOLO si están escritos en el título, la ficha técnica, la descripción, la tabla VARIANTES, las notas del vendedor o LO QUE SE VE EN LAS FOTOS (cuando es texto impreso en la caja o la etiqueta, o lo que trae el paquete), y cópialos EXACTOS (mismo número, misma unidad). Nunca los deduzcas por tu cuenta de las fotos, del nombre del modelo ni de otras publicaciones. Si preguntan "¿qué colores tienes?" y no hay VARIANTES ni color escrito, no nombres colores: confianza "baja".
- Ubicación, retiro, garantía, factura, plazos de despacho y formas de pago: SOLO lo que dicen las POLÍTICAS o las RESPUESTAS RÁPIDAS. No nombres ciudades ni zonas que no estén ahí.
- ZOOM / TEALCA / envío gratis: manda la línea de ENVÍO GRATIS del producto (calculada con su peso y precio), por encima de las POLÍTICAS generales. Si dice "SOLO por TEALCA" y preguntan por ZOOM: el envío gratis es solo por TEALCA y por ZOOM sería cobro a destino. Si dice "cobro a destino", no ofrezcas envío gratis. Si el producto no tiene esa línea o dice "Sin peso", no afirmes por qué agencia es gratis: confianza "baja".
- Envío gratis: SOLO según la línea "ENVÍO GRATIS A ESTE PRECIO" (si está) o las POLÍTICAS para el precio actual. Los montos y mínimos que digan las respuestas anteriores pueden estar viejos: no los copies.
- Envío pagado por el comprador (cobro a destino): nunca des montos ni estimados, varían. Si el producto entra en el mínimo de unidades para envío gratis de las POLÍTICAS, recomienda comprar ese mínimo: le sale más barato que el cobro a destino.
- Si el comprador habla de OTRO producto (uno que ya compró, o uno distinto al de esta publicación, p. ej. pregunta por una repetidora en la publicación de un router), no respondas como si fuera esta publicación: aclárale cuál es esta y, si el que busca está en OTRAS PUBLICACIONES DEL VENDEDOR, pon su link; si no está, confianza "baja".
- Si pide una cantidad (2, 3…) y el stock alcanza, confírmala. Si no alcanza, no la afirmes ni lo mandes a otra publicación: confianza "baja".
- Si pregunta por varios productos distintos (otras medidas, modelos o artículos que no son esta publicación) o cómo comprarlos juntos en una sola oferta, deja confianza "baja": eso lo coordina una persona.
- Si la pregunta no se entiende sola ("¿pero hay esperanza?", "¿y el otro?", "¿entonces?") y las preguntas anteriores del comprador no la aclaran, deja confianza "baja".
- Responde SIEMPRE como el equipo del vendedor, en primera persona ("tenemos", "te confirmamos", "nuestro"). Nunca como alguien de afuera que lee la publicación: prohibido "la publicación indica/dice/no especifica", "según la ficha", "según la descripción", "los datos indican".
- Nunca menciones el "sistema", el stock interno, códigos de producto ni cómo sabes lo que sabes.
- Confianza "alta" SOLO si cada cosa que afirmas está escrita en los datos de arriba y contestaste todas las partes. Ante cualquier duda, "baja": es mejor que lo responda una persona.

Siempre termina llamando a la herramienta proponer_respuesta.`

// Versión 2 (07-11, comparación con la IA de MercadoLibre en una cuenta cliente: ML publicaba todo y bien; la nuestra frenaba
// 11 de 19, 5 por detalles del verificador y 4 por no saber una regla de tiempo). Se suma a SISTEMA y manda sobre lo de arriba.
// En prueba: solo la usa /api/cron/ia-v2 (no publica). Ver docs/memoria.
export const SISTEMA_V2_EXTRA = `

AJUSTES (mandan sobre lo anterior):
- Corto y al grano, como un vendedor con experiencia: contesta SOLO lo que preguntó, con los datos concretos (qué colores o tallas hay, el precio). Las RESPUESTAS RÁPIDAS son tu guía de tono y de políticas, NO un texto para pegar entero: agrega tasa, agencias, embalaje o "oferta con confianza" solo si preguntó por eso (o por precio o envío). Excepción: un mínimo OBLIGATORIO para envío gratis va siempre.
- Si pide una variante que no hay (según VARIANTES o STOCK), decir "esa no la tenemos" y cuáles sí hay ES una respuesta completa y segura: confianza "alta".
- Si pide medidas de una talla o variante que no hay, basta decir que no está disponible y ofrecer las que sí: no hace falta la medida.
- ¿Sale hoy? ¿Cuándo llega? ¿Envían el mismo día? Si las POLÍTICAS no dan el plazo, NO lo dejes en "baja": responde la frase segura "El despacho se confirma al concretar la compra y lo hacemos en el menor tiempo posible" (más el envío gratis si aplica). Es completa: confianza "alta". Nunca prometas "hoy" ni un día exacto que no esté escrito.
- "¿Tiene unidades para hoy?" = ¿hay disponible?: contesta la disponibilidad, sin prometer que sale hoy.
- No des montos en bolívares: si preguntan el precio, el de la publicación en USD "a tasa BCV del día".
- Conocimiento general del TIPO de producto (sin números ni compatibilidades con modelos): úsalo como lo haría un vendedor con experiencia. "¿Reproduce los audios de WhatsApp?" en un audífono Bluetooth → reproduce todo el audio del teléfono; tira RGB → se configura en tonos cálidos; "¿el color es exacto al de la foto?" → las fotos son referenciales y el tono puede variar levemente.
- Si no tenemos lo que pide (otra medida, modelo o producto) o no sabes cuál es exactamente, y ninguna de OTRAS PUBLICACIONES lo cumple con certeza: si hay CATÁLOGO DE LA TIENDA, invítalo a revisarlo con ese link tal cual ("puedes ver todo lo que tenemos en nuestro catálogo: <link>"). Es una respuesta completa.
- Si la publicación marca ENVÍO GRATIS ACTIVO y no hay línea ENVÍO GRATIS A ESTE PRECIO, puedes confirmar que tiene envío gratis por MercadoEnvíos (las agencias, solo si las POLÍTICAS las nombran).
- RESPUESTAS ANTERIORES con fecha: si dos dicen cosas distintas (montos, mínimos, agencias, reglas), manda la MÁS RECIENTE. Las POLÍTICAS mandan sobre todas.
- Lo que el vendedor anotó en DATOS QUE EL VENDEDOR ANOTÓ manda sobre las políticas generales para ESTE producto (p. ej. "envío gratis solo por TEALCA", "sirve para cualquier vehículo").
- Si el comprador no pregunta nada (solo confirma o agradece: "ok, quedo atento", "está bien", "gracias"), responde corto y cordial ("Perfecto, quedo a su orden" con el saludo y la despedida del vendedor): confianza "alta".
- Si pregunta por un medio de pago que no está en las POLÍTICAS, di "no trabajamos con <ese medio>" y nombra los que sí aceptamos.
- "¿Tienes / sirve para un <vehículo o modelo>?" (p. ej. "¿tienes disponible para un Corsa?") y lo escrito dice que es universal o para cualquier vehículo: contesta que SÍ sirve para ese vehículo, con la condición escrita si la hay (p. ej. 12V). Nunca "no es de un <modelo> en específico".
- Si el comprador pide una foto (de la caja, de otro ángulo): "por este medio no se pueden mandar imágenes" es completa: confianza "alta".
- Lo que SÍ sigue en "baja": las POLÍTICAS o las RESPUESTAS RÁPIDAS se contradicen con la descripción en lo que pregunta (cobros adicionales, mínimos, agencias); datos técnicos o medidas que no están escritos; compatibilidades; pagos fuera de MercadoLibre.`

/** Cuánto contexto se le manda a la IA por pregunta (27-10). armarContexto trae lo máximo; aquí se recorta.
 *  ACTUAL = el de antes. RECORTADO = el que se usa desde el 28-10: probado con /api/cron/ia-comparar en preguntas
 *  reales (misma calidad, ~29% más barato). La comparación sigue disponible con los dos. */
export interface Recorte { descripcion: number; mismo: number; parecidas: number; otras: number; fichaOtra: number }
export const CONTEXTO_ACTUAL: Recorte = { descripcion: 4000, mismo: 12, parecidas: 10, otras: 12, fichaOtra: 250 }
export const CONTEXTO_RECORTADO: Recorte = { descripcion: 2500, mismo: 8, parecidas: 6, otras: 6, fichaOtra: 150 }

export function bloqueContexto(c: Contexto, r: Recorte = CONTEXTO_RECORTADO) {
  const L: string[] = []
  L.push(`PREGUNTA DEL COMPRADOR: "${c.pregunta.texto}"`)
  if (c.item) {
    L.push(`\nPUBLICACIÓN: ${c.item.title}`)
    L.push(`Condición: ${c.item.condition} · estado: ${c.item.status}` +
      (c.item.shipping?.free_shipping ? ' · ENVÍO GRATIS ACTIVO EN LA PUBLICACIÓN' : '') + (c.item.warranty ? ` · garantía: ${c.item.warranty}` : ''))
    const attrs = (c.item.attributes ?? []).filter(a => a.value_name).map(a => `${a.name}: ${a.value_name}`)
    if (attrs.length) L.push(`Ficha técnica: ${attrs.join(' · ')}`)
  } else if (c.titulo) {
    L.push(`
PUBLICACIÓN: ${c.titulo} (no se pudo leer la ficha en MercadoLibre)`)
  }
  // Precio: SOLO el de MercadoLibre (el que ve el comprador, con la promoción vigente).
  const pml = c.precioML ?? (c.item?.price ? { precio: c.item.price, original: null, moneda: c.item.currency_id } : null)
  if (pml) {
    const bs = pml.moneda === 'USD' && c.tasa ? ` ≈ Bs ${(pml.precio * c.tasa).toFixed(2)} a tasa BCV ${c.tasa}` : ''
    L.push(`PRECIO EN MERCADOLIBRE AHORA: ${pml.precio} ${pml.moneda}${bs}` + (pml.original ? ` (en promoción; antes ${pml.original})` : ''))
  }
  if (c.envio) L.push(`ENVÍO GRATIS A ESTE PRECIO (1 unidad, según el peso y los mínimos de MercadoEnvíos): ${c.envio}. Si preguntan por ZOOM, TEALCA o envío gratis, responde según esto (manda sobre las POLÍTICAS).`)
  if (c.descripcion) L.push(`\nDESCRIPCIÓN:\n${c.descripcion.slice(0, r.descripcion)}`)
  for (const l of lineasFotos(c.fotos ?? null)) L.push(`\n${l}`)
  // 10-11 (el dueño): la disponibilidad sale de la PUBLICACIÓN (con o sin inventario): activa = hay. El stock del sistema
  // confundía (productos mal vinculados, variantes en 0) y la IA dudaba donde el vendedor contesta «sí, disponible».
  L.push(`\nDISPONIBLE EN MERCADOLIBRE: ${c.item ? `${c.item.status === 'active' ? 'publicación activa' : `publicación ${c.item.status}`}, ${c.item.available_quantity} unidades` : 'no se pudo leer la publicación'}.`)
  if (c.variantes?.length) L.push(textoVariantes(c.variantes))
  if (c.delComprador?.length) {
    L.push('\nPREGUNTAS ANTERIORES DE ESTE MISMO COMPRADOR (para entender a qué se refiere ahora):')
    L.push(c.delComprador.map(x => `${x.fecha} P: ${x.p}${x.r ? `\n      R: ${x.r}` : ' (sin responder)'}`).join('\n'))
  }
  if (c.politicas.trim()) L.push(`\nPOLÍTICAS DEL VENDEDOR:\n${c.politicas.trim()}`)
  const precio = pml && pml.moneda === 'USD' ? pml.precio : null
  const aplican = c.plantillas.filter(p => plantillaAplica(p, precio))
  if (aplican.length) {
    L.push(`\nRESPUESTAS RÁPIDAS DEL VENDEDOR que aplican a este producto${precio !== null ? ` (precio $${precio.toFixed(2)})` : ''}. ` +
      `Si la pregunta es de disponibilidad, precio, envío o retiro, usa la que corresponda casi tal cual (solo ajusta lo mínimo):\n` +
      aplican.map(p => `- [${p.titulo}] (${condicionPlantilla(p)}): ${rellenarVariables(p.texto, { producto: c.item?.title ?? c.titulo, precio, tasa: c.tasa }).texto}`).join('\n'))
  }
  // 06-11: con "¿tiene disponible 3?" en un producto de $2,19 respondió solo "sí, las 3" y se saltó el mínimo de 2 para
  // el envío gratis ("no agregues lo que no preguntó"). Si la respuesta rápida que aplica por precio pide un mínimo, va siempre.
  const minimo = aplican.find(p => p.precio_hasta != null && /m[ií]nimo/i.test(p.texto))
  // Mi IA: el mismo aviso con el mínimo del cuestionario (si no lo dijo ya una respuesta rápida).
  if (!minimo && c.minimo && precio !== null && precio < c.minimo.precioMenor) L.push(`\nOBLIGATORIO EN ESTE PRODUCTO (cuesta menos de ${c.minimo.precioMenor}): si confirmas disponibilidad, precio o envío, di SIEMPRE que el envío gratis se activa con mínimo ${c.minimo.unidades} unidades, aunque el comprador no lo pregunte o pida más unidades que el mínimo.`)
  if (minimo) L.push(`\nOBLIGATORIO EN ESTE PRODUCTO: si confirmas disponibilidad, precio o envío, di SIEMPRE el mínimo de compra para el envío gratis como en la respuesta rápida [${minimo.titulo}], aunque el comprador no lo pregunte o pida más unidades que el mínimo.`)
  // 08-11 (el dueño): en un producto de $3,00 la IA aplicó "menos de $3" y bajó la confianza. El límite se compara
  // aquí, no lo decide la IA: si el precio NO es menor, se le dice explícitamente que el mínimo no aplica.
  if (!minimo && c.minimo && precio !== null && precio >= c.minimo.precioMenor) L.push(`\nEN ESTE PRODUCTO NO APLICA EL MÍNIMO DE UNIDADES: cuesta $${precio.toFixed(2)} y el mínimo de ${c.minimo.unidades} unidades es solo para productos de MENOS de $${c.minimo.precioMenor} ($${c.minimo.precioMenor.toFixed(2)} exactos ya no lo pide). Tiene envío gratis desde 1 unidad: no menciones el mínimo ni bajes la confianza por eso.`)
  if (c.notas.length) L.push(`\nDATOS QUE EL VENDEDOR ANOTÓ DE ESTA PUBLICACIÓN:\n- ${c.notas.join('\n- ')}`)
  if (c.ficha) L.push(`\nFICHA DE CONOCIMIENTO (lo que el vendedor ya respondió de esta publicación, resumido):\n${c.ficha.texto}`)
  if (c.catalogo) L.push(`\nCATÁLOGO DE LA TIENDA (todas nuestras publicaciones): ${c.catalogo}`)
  if (c.otras.length) {
    L.push('\nOTRAS PUBLICACIONES DEL VENDEDOR (activas y con stock; solo para recomendar si esta no cumple):')
    for (const o of c.otras.slice(0, r.otras)) {
      L.push(`- ${o.titulo} · ${o.precio ?? '?'} ${o.moneda ?? ''} · ${o.disponible} disp. · link: ${linkCorto(o.item_id)}` +
        (o.ficha ? `\n  Ficha: ${o.ficha.slice(0, r.fichaOtra)}` : ''))
    }
  }
  const par = (xs: { p: string; r: string; f?: string }[]) => xs.map(x => `${x.f ? `(${x.f}) ` : ''}P: ${x.p}\nR: ${x.r}`).join('\n\n')
  if (c.mismoItem.length) L.push(`\nRESPUESTAS ANTERIORES DEL VENDEDOR EN ESTA MISMA PUBLICACIÓN:\n${par(c.mismoItem.slice(0, r.mismo))}`)
  if (c.parecidas.length) L.push(`\nRESPUESTAS ANTERIORES DEL VENDEDOR A PREGUNTAS PARECIDAS (otras publicaciones):\n${par(c.parecidas.slice(0, r.parecidas))}`)
  return L.join('\n')
}

export interface Borrador { respuesta: string; confianza: 'alta' | 'media' | 'baja'; falta_dato: string | null; web: boolean }

const HERRAMIENTA = {
  name: 'proponer_respuesta',
  description: 'Entrega el borrador de respuesta para que el vendedor lo revise.',
  input_schema: {
    type: 'object',
    properties: {
      respuesta: { type: 'string', description: 'Texto listo para publicar (vacío si no se puede responder sin inventar).' },
      confianza: { type: 'string', enum: ['alta', 'media', 'baja'], description: 'alta = todo sale de los datos dados; baja = falta información.' },
      falta_dato: { type: ['string', 'null'], description: 'Qué dato faltó para responder bien, o null.' },
    },
    required: ['respuesta', 'confianza', 'falta_dato'],
  },
}

// Pregunta SIMPLE = de las que se responden con stock, precio, políticas y respuestas rápidas
// (disponible, precio, envío, ubicación, pago) y no tocan nada técnico del producto. Esas van a
// Haiku (5× más barato); el resto, y las que Haiku no responde con confianza "alta", a Sonnet.
// Envío GRATIS y "cuántas hay" van a Sonnet: en la prueba (30 preguntas reales, 2026-10-03) Haiku
// dijo "sí" al envío gratis de una publicación que no lo tiene y esquivó el número de unidades.
const SIMPLE = /disponib|\bhay\b|precio|cu[aá]nto (sale|cuesta|es)|env[ií]|ubicad|d[oó]nde (est|qued)|tienda f[ií]sica|retir|entrega|llega|tarda|zoom|mrw|tealca|domesa|liberty|\bpag|binance|paypal|zelle|bcv|divisa|efectivo|unidades/i
const TECNICO = /compatib|sirve|funciona|conect|empare|incluye|viene con|\btrae|\bkit\b|cable|medida|\bmts?\b|metro|\bcm\b|\bmm\b|pulgada|volt|wat|bater|carg|modelo|original|instal|adapt|usb|bluetooth|color|negro|blanco|talla|tama[ñn]o|material|descuento|oferta|al mayor|garant|gratis|cu[aá]nt[ao]s/i

export const esPreguntaSimple = (texto: string) =>
  SIMPLE.test(texto) && !TECNICO.test(texto) && texto.trim().split(/\s+/).length <= 30

/** Pide el borrador a Claude. Con `web`, puede buscar en internet (el borrador queda marcado para verificar).
 *  08-11 (el dueño): Haiku 5.5 escribe TODAS (antes: Haiku las simples y Sonnet el resto). Sonnet costaba ~20× más
 *  y la competencia cobra ~$0,01 por respuesta; el verificador (Haiku) sigue frenando lo que no está en los datos. */
export async function pedirBorrador(c: Contexto, web: boolean, recorte: Recorte = CONTEXTO_RECORTADO, v2 = false, verificarBaja = false): Promise<Borrador & { llamadas: LlamadaIA[]; modelo: string; verificacion: string | null }> {
  const sistema = SISTEMA + (v2 ? SISTEMA_V2_EXTRA : '') + (web
    ? '\n\nPuedes buscar en internet SOLO datos técnicos del producto (medidas, compatibilidad, especificaciones del fabricante). Nunca precios, stock ni envíos: eso sale solo de los datos del vendedor.'
    : '')
  const contenido = bloqueContexto(c, recorte)
  const llamadas: LlamadaIA[] = []
  const pedir = async (modelo?: string) => {
    const { resultado: b, uso, modelo: m } = await llamarClaude<Borrador>({ sistema, contenido, herramienta: HERRAMIENTA, web, modelo })
    llamadas.push({ modelo: m, uso })
    return {
      respuesta: String(b.respuesta ?? '').trim(),
      confianza: (['alta', 'media', 'baja'].includes(b.confianza) ? b.confianza : 'baja') as Borrador['confianza'],
      falta_dato: b.falta_dato || null,
      web, modelo: m,
    }
  }
  // Un reintento si falla (corte de la IA o "no devolvió un borrador").
  let b = await pedir(MODELO_SIMPLE).catch(() => pedir(MODELO_SIMPLE))
  b = { ...b, respuesta: sinTercero(b.respuesta) }
  // Verificador (31-10): lo que la IA da por seguro se busca afirmación por afirmación en los datos; si algo no está
  // escrito o falta una parte, baja a "baja" (lo revisa una persona). Con búsqueda web no aplica (ya va a verificar).
  let verificacion: string | null = null
  // 08-11: la respuesta automática verifica también las de confianza baja (verificarBaja): si el verificador las aprueba
  // pueden salir solas (el dueño marcó 40 de 41 "podía salir sola"). La confianza no sube: queda anotada como estaba.
  if (!web && b.respuesta && (b.confianza !== 'baja' || verificarBaja)) {
    const v = await verificarBorrador(contenido, c.pregunta.texto, b.respuesta, MODELO_SIMPLE, v2).catch(() => null)
    if (v) {
      llamadas.push(v.llamada)
      if (!v.ok) { verificacion = v.motivo; b = { ...b, confianza: 'baja', falta_dato: b.falta_dato ?? v.motivo } }
      else verificacion = 'ok'
    }
  }
  return { ...b, llamadas, verificacion }
}

/** 10-11 (el dueño): «según la descripción de la publicación» y parecidas suenan a alguien de afuera; se quitan solas.
 *  Lo que no se puede quitar sin romper la frase («la publicación no especifica…») sigue frenando (TERCERO). */
export function sinTercero(t: string) {
  return t
    .replace(/,?\s*(seg[uú]n|como (lo )?(indica|dice|menciona|muestra))\s+(la|esta|nuestra)\s+(publicaci[oó]n|ficha( t[eé]cnica)?|descripci[oó]n)( de (la|esta) publicaci[oó]n)?/gi, '')
    .replace(/\b(la|esta) (publicaci[oó]n|ficha|descripci[oó]n) (indica|dice|menciona|muestra) que\s+/gi, '')
    .replace(/\b(la|esta) (publicaci[oó]n|ficha|descripci[oó]n) (indica|dice|menciona|muestra)\s+/gi, 'tiene ')
    .replace(/\s+([.,;])/g, '$1').replace(/\s{2,}/g, ' ').trim()
}

// Receta económica (04-11-2026, simulación en paralelo de lib/iaEconomica.ts): lo que usan los bots de ~$0,01 por
// respuesta. Contexto chico (la publicación y pocas respuestas parecidas, no todo), Haiku para todas, Sonnet solo si
// la pregunta es técnica y Haiku no quedó seguro, y el verificador solo si la respuesta afirma números, colores o medidas.
export const CONTEXTO_ECONOMICO: Recorte = { descripcion: 1200, mismo: 4, parecidas: 3, otras: 2, fichaOtra: 80 }
const AFIRMA_DATOS = /\d|negr|blanc|roj|azul|verde|amarill|gris|rosad|dorad|platead|transparent|color|talla|medida|\bcm\b|\bmm\b|pulgad|volt|wat|mah|metro/i

export async function pedirBorradorEconomico(c: Contexto, modeloSimple = MODELO_SIMPLE): Promise<Borrador & { llamadas: LlamadaIA[]; modelo: string; verificacion: string | null }> {
  // 04-11: le faltaba decir el mínimo para envío gratis al confirmar disponibilidad (una de las marcadas mal).
  const contenido = bloqueContexto(c, CONTEXTO_ECONOMICO) +
    '\n\nRECUERDA: no digas cuántas unidades hay ni el precio con cifra ("el precio es el publicado BCV"). Si una respuesta rápida ' +
    'que aplica pide un mínimo para el envío gratis, inclúyelo tal cual al confirmar disponibilidad.'
  const llamadas: LlamadaIA[] = []
  // Un reintento si falla (04-11: 7 de 177 sin respuesta: corte de la IA o "no devolvió un borrador").
  const llamar = (modelo?: string) => llamarClaude<Borrador>({ sistema: SISTEMA, contenido, herramienta: HERRAMIENTA, modelo, maxTokens: 800 })
  const pedir = async (modelo?: string) => {
    const { resultado: b, uso, modelo: m } = await llamar(modelo).catch(() => llamar(modelo))
    llamadas.push({ modelo: m, uso })
    return {
      respuesta: String(b.respuesta ?? '').trim(),
      confianza: (['alta', 'media', 'baja'].includes(b.confianza) ? b.confianza : 'baja') as Borrador['confianza'],
      falta_dato: b.falta_dato || null,
      web: false, modelo: m,
    }
  }
  let b = await pedir(modeloSimple)
  if (!(b.confianza === 'alta' && b.respuesta) && TECNICO.test(c.pregunta.texto)) b = await pedir()
  let verificacion: string | null = null
  if (b.respuesta && b.confianza !== 'baja' && AFIRMA_DATOS.test(b.respuesta)) {
    const v = await verificarBorrador(contenido, c.pregunta.texto, b.respuesta, modeloSimple).catch(() => null)
    if (v) {
      llamadas.push(v.llamada)
      if (!v.ok) { verificacion = v.motivo; b = { ...b, confianza: 'baja', falta_dato: b.falta_dato ?? v.motivo } }
      else verificacion = 'ok'
    }
  }
  return { ...b, llamadas, modelo: [...new Set(llamadas.map(l => l.modelo))].join(' → '), verificacion }
}

// ── Sugerencias (gratis, sin IA): respuestas ya dadas a preguntas parecidas ──────────────────

// Palabras de PRESENTACIÓN (cómo se vende: por par, kit, combo…). Una respuesta que las nombra solo
// vale para publicaciones que se venden igual (la palabra está en su título). "Mínimo 2 unidades"
// (envío gratis) no es presentación: no se filtra.
const PRESENTACION = /\b(par|pares|combo|kit|pack|juego|set|docena|\d+\s*x|x\s*\d+)\b/gi
function presentacionAjena(respuesta: string, tituloActual: string | null) {
  const palabras = respuesta.toLowerCase().match(PRESENTACION)
  if (!palabras) return false
  const titulo = (tituloActual ?? '').toLowerCase()
  return palabras.some(w => !titulo.includes(w.replace(/\s+/g, ' ').trim()))
}
export interface SugerenciaPregunta { pregunta: string; respuesta: string; parecido: number; mismaPublicacion: boolean; titulo: string | null }

/** Hasta 3 respuestas propias a preguntas parecidas (las de la misma publicación pesan más),
 *  de TODAS las respondidas (la misma memoria que usa la IA). Sin repetir respuestas. */
export async function sugerenciasPregunta(db: Pool, preguntaId: number): Promise<SugerenciaPregunta[]> {
  const { rows } = await db.query(
    `WITH q AS (SELECT id, item_id, texto, item_titulo FROM ml_preguntas WHERE id = $1)
     SELECT p.texto AS pregunta, p.respuesta, similarity(p.texto, q.texto)::float AS parecido,
            p.item_id = q.item_id AS "mismaPublicacion", p.item_titulo AS titulo, q.item_titulo AS "tituloActual",
            q.texto AS "textoActual", similarity(COALESCE(p.item_titulo, ''), COALESCE(q.item_titulo, ''))::float AS "parecidoTitulo"
     FROM ml_preguntas p, q
     WHERE p.id <> q.id AND p.estado = 'ANSWERED' AND p.respuesta IS NOT NULL
       AND (p.texto % q.texto OR (p.item_id = q.item_id AND similarity(p.texto, q.texto) > 0.15))
     ORDER BY similarity(p.texto, q.texto) + CASE WHEN p.item_id = q.item_id THEN 0.15 ELSE 0 END DESC, p.fecha DESC
     LIMIT 30`, [preguntaId])
  const vistas = new Set<string>()
  const out: SugerenciaPregunta[] = []
  for (const x of rows) {
    // De OTRA publicación no sirve una respuesta sobre su presentación ("precio por el par", "kit de
    // 5 ruedas") si esta publicación no se vende así: la pregunta se escribe igual, la respuesta no.
    if (!x.mismaPublicacion && presentacionAjena(x.respuesta, x.tituloActual)) continue
    // 29-10 (alarma de moto: salían respuestas de una silla gamer y de un dock de discos por "es compatible"): una
    // pregunta del producto (compatible, medida, modelo, números…) solo toma respuestas de OTRA publicación si es del
    // mismo tipo de producto (títulos parecidos). Las generales (disponible, envío) siguen igual.
    if (!x.mismaPublicacion && x.parecidoTitulo < 0.2 && riesgoDe(x.textoActual)) continue
    const clave = x.respuesta.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, ' ').trim()
    if (vistas.has(clave)) continue
    vistas.add(clave)
    delete x.tituloActual; delete x.textoActual; delete x.parecidoTitulo
    out.push(x)
    if (out.length === 3) break
  }
  return out
}
