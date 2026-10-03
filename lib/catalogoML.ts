// Catálogo del vendedor e historial completo de preguntas (migración 059): más contexto para la IA.
//
//   - Catálogo: todas las publicaciones activas/pausadas de cada cuenta, con su ficha resumida.
//     Sirve para que la IA recomiende OTRO modelo del vendedor cuando el de la pregunta no cumple
//     (el dueño lo hace a mano: "este no se empareja; el PRO sí: <link>"). Cada 6 h por cuenta.
//   - Historial: la búsqueda general de ML corta en 1.000 preguntas por cuenta; por publicación
//     (/questions/search?item=) se llega a TODAS. Una vez por publicación, de a pocas por pasada.
// Solo LEE de MercadoLibre. Lo corre el cron de preguntas en segundo plano.
import type { Pool } from 'pg'
import { mlFetch } from '@/lib/ml'
import { idsDe } from '@/lib/alertasStock'
import { guardarPregunta, type PreguntaML } from '@/lib/preguntas'

export const HORAS_CATALOGO = 6
const POR_MULTIGET = 20
const HISTORIAL_POR_PASADA = 4             // publicaciones por pasada del cron (cada minuto)

interface ItemCatalogo {
  id: string; title: string; status: string; price: number | null; currency_id: string | null
  category_id: string | null; available_quantity: number; permalink?: string
  attributes?: { name: string; value_name: string | null }[]
}

// Atributos que no ayudan a responder (códigos internos, garantías de ML, etc.).
const ATRIBUTO_INUTIL = /^(SKU|C[oó]digo universal|GTIN|Condici[oó]n del [ií]tem|Tipo de garant[ií]a|Tiempo de garant[ií]a|Es kit|Con env[ií]o gratis|Origen|Unidades por pack|Formato de venta)/i

export const fichaDeAtributos = (attrs: ItemCatalogo['attributes']) =>
  (attrs ?? []).filter(a => a.value_name && !ATRIBUTO_INUTIL.test(a.name))
    .slice(0, 18).map(a => `${a.name}: ${a.value_name}`).join(' · ') || null

/** Refresca el catálogo de una cuenta si pasaron HORAS_CATALOGO (la reserva es atómica). */
export async function actualizarCatalogo(db: Pool, conexionId: number) {
  const { rows: [c] } = await db.query(
    `UPDATE ml_conexiones SET catalogo_at = NOW()
     WHERE id = $1 AND estado = 'activa' AND (catalogo_at IS NULL OR catalogo_at < NOW() - make_interval(hours => $2))
     RETURNING ml_user_id`, [conexionId, HORAS_CATALOGO])
  if (!c) return null
  const seller = Number(c.ml_user_id)
  const ids = [...new Set([...await idsDe(db, conexionId, seller, 'active'), ...await idsDe(db, conexionId, seller, 'paused')])]
  const inicio = new Date()
  let n = 0
  for (let i = 0; i < ids.length; i += POR_MULTIGET) {
    const r = await mlFetch<{ code: number; body: ItemCatalogo }[]>(db, conexionId,
      `/items?ids=${ids.slice(i, i + POR_MULTIGET).join(',')}` +
      '&attributes=id,title,status,price,currency_id,category_id,available_quantity,permalink,attributes')
    for (const x of r) {
      const it = x.code === 200 ? x.body : null
      if (!it || (it.status !== 'active' && it.status !== 'paused')) continue
      await db.query(
        `INSERT INTO ml_catalogo (item_id, conexion_id, titulo, precio, moneda, category_id, disponible, estado, permalink, ficha, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
         ON CONFLICT (empresa_id, item_id) DO UPDATE SET conexion_id = EXCLUDED.conexion_id, titulo = EXCLUDED.titulo,
           precio = EXCLUDED.precio, moneda = EXCLUDED.moneda, category_id = EXCLUDED.category_id,
           disponible = EXCLUDED.disponible, estado = EXCLUDED.estado, permalink = EXCLUDED.permalink,
           ficha = EXCLUDED.ficha, actualizado_at = NOW()`,
        [it.id, conexionId, it.title, it.price, it.currency_id, it.category_id, it.available_quantity ?? 0,
         it.status, it.permalink ?? null, fichaDeAtributos(it.attributes)])
      n++
    }
  }
  // Lo que ya no está activo ni pausado (finalizado, borrado) sale del catálogo.
  await db.query(`DELETE FROM ml_catalogo WHERE conexion_id = $1 AND actualizado_at < $2`, [conexionId, inicio])
  return n
}

/** Trae TODAS las preguntas respondidas de unas pocas publicaciones que todavía no tienen su
 *  historial (tope de ML: 1.000 por publicación). Devuelve cuántas preguntas guardó. */
export async function importarHistorial(db: Pool) {
  const { rows } = await db.query(
    `UPDATE ml_catalogo SET historial_at = NOW()
     WHERE (empresa_id, item_id) IN (
       SELECT empresa_id, item_id FROM ml_catalogo WHERE historial_at IS NULL
       ORDER BY actualizado_at LIMIT ${HISTORIAL_POR_PASADA} FOR UPDATE SKIP LOCKED)
     RETURNING item_id, conexion_id`)
  let guardadas = 0
  for (const it of rows) {
    try {
      for (let offset = 0; offset < 1000; offset += 50) {
        const r = await mlFetch<{ total: number; questions: PreguntaML[] }>(db, it.conexion_id,
          `/questions/search?item=${it.item_id}&api_version=4&limit=50&offset=${offset}` +
          '&sort_fields=date_created&sort_types=DESC')
        const qs = r.questions ?? []
        for (const q of qs) {
          if (q.status !== 'ANSWERED' || !q.answer?.text) continue
          await guardarPregunta(db, it.conexion_id, q)
          guardadas++
        }
        if (qs.length < 50 || offset + 50 >= (r.total ?? 0)) break
      }
    } catch (e) {
      // Queda para otra pasada.
      await db.query(`UPDATE ml_catalogo SET historial_at = NULL WHERE item_id = $1`, [it.item_id])
      console.error('[historial ML]', it.item_id, e instanceof Error ? e.message : e)
    }
  }
  // Título y link de las preguntas recién traídas: del catálogo (sin otra llamada a ML).
  if (guardadas) await db.query(
    `UPDATE ml_preguntas q SET item_titulo = c.titulo, item_permalink = c.permalink, item_estado = c.estado
     FROM ml_catalogo c WHERE c.item_id = q.item_id AND q.item_titulo IS NULL`)
  return guardadas
}

export interface OtraPublicacion { item_id: string; titulo: string; precio: number | null; moneda: string | null; permalink: string | null; ficha: string | null; disponible: number }

/** Otras publicaciones del vendedor que podrían servirle al comprador: misma categoría o título
 *  parecido, activas y con stock. Para que la IA recomiende otro modelo si el de la pregunta no cumple. */
export async function otrasPublicaciones(db: Pool, itemId: string, titulo: string, pregunta: string, limite = 12): Promise<OtraPublicacion[]> {
  // Primero las que comparten palabras con la PREGUNTA ("¿venden el modelo pro?" → las "Pro"),
  // después las de la misma categoría y las de título parecido. Hasta `limite` (una categoría
  // puede tener muchas variantes del mismo producto: con 6 se quedaban afuera las que importaban).
  const { rows } = await db.query(
    `WITH yo AS (SELECT category_id FROM ml_catalogo WHERE item_id = $1),
          qw AS (SELECT tsvector_to_array(to_tsvector('spanish', $3)) AS w)
     SELECT c.item_id, c.titulo, c.precio::float AS precio, c.moneda, c.permalink, c.ficha, c.disponible
     FROM ml_catalogo c CROSS JOIN qw
     JOIN LATERAL (SELECT COUNT(*)::int AS n FROM unnest(tsvector_to_array(to_tsvector('spanish', c.titulo))) t
                   WHERE t = ANY(qw.w)) x ON TRUE
     WHERE c.item_id <> $1 AND c.estado = 'active' AND c.disponible > 0
       AND (c.category_id = (SELECT category_id FROM yo) OR similarity(c.titulo, $2) > 0.25 OR x.n >= 2)
     ORDER BY x.n DESC, (c.category_id = (SELECT category_id FROM yo)) DESC NULLS LAST, similarity(c.titulo, $2) DESC
     LIMIT $4`, [itemId, titulo, pregunta, limite])
  return rows
}
