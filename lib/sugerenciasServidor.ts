// Lado servidor de las respuestas sugeridas (lib/sugerenciasPreguntas.ts): calibración con el
// historial de la empresa (en caché un día), la sugerencia de cada pregunta pendiente y lo que se
// aprende de cada respuesta publicada (envío gratis por producto, ml_item_hechos, migración 078).
import type { Pool } from 'pg'
import { createHash } from 'crypto'
import { leerPlantillas, idPlantilla, type Plantilla } from '@/lib/preguntasTexto'
import { calibrar, respaldo, sugerir, ofreceEnvioGratis, NIEGA_ENVIO, normalizar, type Calibracion } from '@/lib/sugerenciasPreguntas'
import { fueEditada } from '@/lib/respuestasOrigen'

const HISTORIAL = 3000           // preguntas respondidas con las que se calibra
const CACHE_HORAS = 24

export interface SugeridaPregunta {
  plantilla: string; titulo: string; texto: string
  respaldo: number               // % de acierto en el historial de la empresa
  sin_confirmar: boolean         // promete envío gratis y el producto todavía no está confirmado
}

export async function plantillasDe(db: Pool) {
  const { rows: [pl] } = await db.query(`SELECT value FROM app_settings WHERE key = 'preguntas_plantillas'`)
  return leerPlantillas(pl?.value)
}

/** Calibración de la empresa: en caché (app_settings) un día o hasta que cambien sus respuestas rápidas. */
export async function calibracionDe(db: Pool, plantillas: Plantilla[]): Promise<Calibracion> {
  const firma = createHash('sha1').update(JSON.stringify(plantillas)).digest('hex').slice(0, 12)
  const { rows: [c] } = await db.query(
    `SELECT value, updated_at > NOW() - make_interval(hours => $1) AS fresca FROM app_settings WHERE key = 'preguntas_calibracion'`,
    [CACHE_HORAS])
  if (c?.fresca) {
    try { const v = JSON.parse(c.value); if (v.firma === firma) return v.cal } catch { /* se recalcula */ }
  }
  const { rows } = await db.query(
    `SELECT q.texto, q.respuesta, q.item_id,
            CASE WHEN COALESCE(q.item_moneda, 'USD') = 'USD' THEN q.item_precio::float END AS precio,
            h.envio_gratis AS "envioGratis"
     FROM ml_preguntas q LEFT JOIN ml_item_hechos h ON h.item_id = q.item_id
     WHERE q.respuesta IS NOT NULL AND length(q.respuesta) > 3
     ORDER BY q.fecha DESC LIMIT ${HISTORIAL}`)
  const cal = calibrar(rows, plantillas)
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ('preguntas_calibracion', $1)
     ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify({ firma, cal })])
  return cal
}

/** La sugerencia de cada pregunta pendiente (solo las probadas en el historial y en publicaciones activas). */
export async function sugeridasPara(db: Pool, preguntas: { id: string; texto: string; item_id: string;
  item_precio: number | null; item_moneda: string | null; item_estado: string | null }[]) {
  const out = new Map<string, SugeridaPregunta>()
  if (!preguntas.length) return out
  const plantillas = await plantillasDe(db)
  if (!plantillas.length) return out
  const cal = await calibracionDe(db, plantillas)
  const { rows: hechos } = await db.query(
    `SELECT item_id, envio_gratis, precio_ref::float FROM ml_item_hechos WHERE item_id = ANY($1::text[])`, [preguntas.map(p => p.item_id)])
  const envio = new Map(hechos.map(h => [h.item_id as string, h as { envio_gratis: boolean | null; precio_ref: number | null }]))
  for (const p of preguntas) {
    if (p.item_estado && p.item_estado !== 'active') continue      // pausada: ML no deja responder
    const precio = p.item_precio && (p.item_moneda ?? 'USD') === 'USD' ? Number(p.item_precio) : null
    // Confirmado con envío gratis, pero el precio bajó más de 20% desde entonces: se vuelve a confirmar.
    const h = envio.get(p.item_id)
    const envioGratis = h?.envio_gratis === true && h.precio_ref && precio !== null && precio < h.precio_ref * 0.8 ? null : h?.envio_gratis ?? null
    const s = sugerir(p.texto, { precio, stock: null, item_id: p.item_id, envioGratis }, plantillas)
    if (s.tipo !== 'sugerida') continue
    const id = idPlantilla(s.plantilla)
    const r = respaldo(cal, id, s.temas)
    if (r === null) continue
    out.set(p.id, { plantilla: id, titulo: s.plantilla.titulo, texto: s.plantilla.texto, respaldo: r, sin_confirmar: s.sinConfirmar })
  }
  return out
}

/**
 * Lo que se aprende de una respuesta publicada sobre SU publicación:
 *   dice "por unidad no tiene envío gratis" (o similar) → envio_gratis = false;
 *   envió SIN CAMBIOS una respuesta rápida/sugerida que promete envío gratis → envio_gratis = true.
 * Nunca hace fallar la publicación.
 */
export async function aprenderDeRespuesta(db: Pool, o: { itemId: string; precio: number | null; texto: string;
  fuente?: string; base?: string; plantilla?: string | null }) {
  try {
    let valor: boolean | null = null, fuente = ''
    if (NIEGA_ENVIO.test(normalizar(o.texto))) { valor = false; fuente = 'respuesta' }
    else if (o.plantilla && ['rapida', 'sugerida'].includes(o.fuente ?? '') && !fueEditada(o.base, o.texto)) {
      const p = (await plantillasDe(db)).find(x => idPlantilla(x) === o.plantilla)
      if (p && ofreceEnvioGratis(p)) { valor = true; fuente = 'clic' }
    }
    if (valor === null) return
    await db.query(
      `INSERT INTO ml_item_hechos (item_id, envio_gratis, fuente, precio_ref) VALUES ($1, $2, $3, $4)
       ON CONFLICT (empresa_id, item_id) DO UPDATE SET envio_gratis = EXCLUDED.envio_gratis, fuente = EXCLUDED.fuente,
         precio_ref = EXCLUDED.precio_ref, actualizado_at = NOW()`, [o.itemId, valor, fuente, o.precio])
  } catch (e) { console.error('[aprender respuesta]', e) }
}
