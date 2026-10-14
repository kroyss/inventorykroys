// Lado servidor de las respuestas sugeridas (lib/sugerenciasPreguntas.ts): calibración con el
// historial de la empresa (en caché un día), la sugerencia de cada pregunta pendiente y lo que se
// aprende de cada respuesta publicada (envío gratis por producto, ml_item_hechos, migración 078).
import type { Pool } from 'pg'
import { createHash } from 'crypto'
import { leerPlantillas, idPlantilla, type Plantilla } from '@/lib/preguntasTexto'
import { calibrar, respaldo, sugerir, probable, palabrasQueActivan, ofreceEnvioGratis, NIEGA_ENVIO, normalizar, type Calibracion } from '@/lib/sugerenciasPreguntas'
import { aprender, conAprendidas, CLAVE_APRENDIDAS, CLAVE_QUITADAS, type Aprendidas, type Quitadas } from '@/lib/palabrasAprendidas'
import { fueEditada } from '@/lib/respuestasOrigen'

const HISTORIAL = 3000           // preguntas respondidas con las que se calibra
const CACHE_HORAS = 24

export interface SugeridaPregunta {
  plantilla: string; titulo: string; texto: string
  respaldo: number               // % de acierto en el historial de la empresa
  sin_confirmar: boolean         // promete envío gratis y el producto todavía no está confirmado
  por_palabras?: string[]        // la activaron sus palabras (aprendidas o propias), no la calibración por temas
}

async function leerJSON<T>(db: Pool, clave: string, vacio: T): Promise<T> {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [clave])
  try { return r ? JSON.parse(r.value) as T : vacio } catch { return vacio }
}
async function guardarJSON(db: Pool, clave: string, valor: unknown) {
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [clave, JSON.stringify(valor)])
}

/** Las respuestas rápidas tal como las guardó el vendedor (sin lo aprendido). */
export async function plantillasBase(db: Pool) {
  const { rows: [pl] } = await db.query(`SELECT value FROM app_settings WHERE key = 'preguntas_plantillas'`)
  return leerPlantillas(pl?.value)
}

/** Las respuestas rápidas con sus palabras aprendidas (lib/palabrasAprendidas.ts): con estas se sugiere. */
export async function plantillasDe(db: Pool) {
  return conAprendidas(await plantillasBase(db), await leerJSON<Aprendidas>(db, CLAVE_APRENDIDAS, {}))
}
export const aprendidasDe = (db: Pool) => leerJSON<Aprendidas>(db, CLAVE_APRENDIDAS, {})
export const quitadasDe = (db: Pool) => leerJSON<Quitadas>(db, CLAVE_QUITADAS, {})

/** Calibración de la empresa: en caché (app_settings) un día o hasta que cambien sus respuestas rápidas
 *  (o las palabras que quitó). Al recalcular, primero aprende las palabras y después calibra con ellas. */
export async function calibracionDe(db: Pool, _plantillas?: Plantilla[]): Promise<Calibracion> {
  const base = await plantillasBase(db)
  const quitadas = await quitadasDe(db)
  const firma = createHash('sha1').update(JSON.stringify([base, quitadas])).digest('hex').slice(0, 12)
  const { rows: [c] } = await db.query(
    `SELECT value, updated_at > NOW() - make_interval(hours => $1) AS fresca FROM app_settings WHERE key = 'preguntas_calibracion'`,
    [CACHE_HORAS])
  if (c?.fresca) {
    try { const v = JSON.parse(c.value); if (v.firma === firma) return v.cal } catch { /* se recalcula */ }
  }
  const { rows } = await db.query(
    `SELECT q.id::text, q.texto, q.respuesta, q.item_id, q.item_titulo,
            CASE WHEN COALESCE(q.item_moneda, 'USD') = 'USD' THEN q.item_precio::float END AS precio,
            h.envio_gratis AS "envioGratis"
     FROM ml_preguntas q LEFT JOIN ml_item_hechos h ON h.item_id = q.item_id
     WHERE q.respuesta IS NOT NULL AND length(q.respuesta) > 3
     ORDER BY q.fecha DESC LIMIT ${HISTORIAL}`)
  // El botón que se tocó en cada pregunta (el último, si hubo varios).
  const { rows: clics } = await db.query(
    `SELECT DISTINCT ON (ref) ref, plantilla FROM respuestas_origen
     WHERE modulo = 'preguntas' AND plantilla IS NOT NULL AND fuente IN ('rapida', 'sugerida', 'automatica')
     ORDER BY ref, fecha DESC`)
  const botones = new Map(clics.map(r => [String(r.ref), String(r.plantilla)]))
  const apr = aprender(rows, botones, base, quitadas, await aprendidasDe(db))
  await guardarJSON(db, CLAVE_APRENDIDAS, apr)
  const cal = calibrar(rows, conAprendidas(base, apr))
  await guardarJSON(db, 'preguntas_calibracion', { firma, cal })
  return cal
}

/** Vuelve a calcular en la próxima consulta (al quitar una palabra aprendida). */
export async function invalidarCalibracion(db: Pool) {
  await db.query(`DELETE FROM app_settings WHERE key = 'preguntas_calibracion'`)
}

/** La sugerencia de cada pregunta pendiente (probadas en el historial o activadas por sus palabras, en
 *  publicaciones activas) y, para las que no tienen, el botón más probable (se resalta, no se escribe). */
export async function sugerenciasPara(db: Pool, preguntas: { id: string; texto: string; item_id: string;
  item_precio: number | null; item_moneda: string | null; item_estado: string | null }[]) {
  const out = new Map<string, SugeridaPregunta>()
  const probables = new Map<string, string>()
  if (!preguntas.length) return { sugeridas: out, probables }
  const cal = await calibracionDe(db)
  const plantillas = await plantillasDe(db)
  if (!plantillas.length) return { sugeridas: out, probables }
  const { rows: hechos } = await db.query(
    `SELECT item_id, envio_gratis, precio_ref::float FROM ml_item_hechos WHERE item_id = ANY($1::text[])`, [preguntas.map(p => p.item_id)])
  const envio = new Map(hechos.map(h => [h.item_id as string, h as { envio_gratis: boolean | null; precio_ref: number | null }]))
  for (const p of preguntas) {
    if (p.item_estado && p.item_estado !== 'active') continue      // pausada: ML no deja responder
    const precio = p.item_precio && (p.item_moneda ?? 'USD') === 'USD' ? Number(p.item_precio) : null
    // Confirmado con envío gratis, pero el precio bajó más de 20% desde entonces: se vuelve a confirmar.
    const h = envio.get(p.item_id)
    const envioGratis = h?.envio_gratis === true && h.precio_ref && precio !== null && precio < h.precio_ref * 0.8 ? null : h?.envio_gratis ?? null
    const item = { precio, stock: null, item_id: p.item_id, envioGratis }
    const s = sugerir(p.texto, item, plantillas)
    if (s.tipo === 'sugerida') {
      const id = idPlantilla(s.plantilla)
      const r = respaldo(cal, id, s.temas)
      // Sus palabras (aprendidas de lo que el vendedor hizo, o escritas por él) bastan: la calibración
      // por temas no puede probar una palabra que recién se aprendió.
      const palabras = s.temas.includes(`p:${id}`) ? palabrasQueActivan(s.plantilla, p.texto) : []
      if (r !== null || palabras.length) {
        out.set(p.id, { plantilla: id, titulo: s.plantilla.titulo, texto: s.plantilla.texto, respaldo: r ?? 0,
          sin_confirmar: s.sinConfirmar, ...(r === null ? { por_palabras: palabras } : {}) })
        continue
      }
    }
    const pr = probable(p.texto, item, plantillas, cal)
    if (pr) probables.set(p.id, pr)
  }
  return { sugeridas: out, probables }
}

export async function sugeridasPara(db: Pool, preguntas: Parameters<typeof sugerenciasPara>[1]) {
  return (await sugerenciasPara(db, preguntas)).sugeridas
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
