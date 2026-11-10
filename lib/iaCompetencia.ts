// Comparar con la competencia (10-11-2026, el dueño; mig 161): Plataforma → Interno → Competencia.
// Toma las preguntas que un cliente con bot externo (Mercasist) respondió FUERA del sistema y genera la respuesta que daría
// nuestra IA hoy (la misma de la respuesta automática: v2 + verificador + motivosRevisar). No publica, no escribe borrador
// ni toca la pregunta, y no se cuenta en el consumo del cliente (el costo queda en ia_competencia). Los frenos de fábrica
// (tope por comprador, horarios) no se aplican: dependen del momento y aquí se mira hacia atrás.
import { conEmpresa, dbGlobal } from '@/lib/db'
import type { Country } from '@/lib/types'
import { armarContexto, datosCompatibilidad, datosPublicacion, pedirBorrador, textoVendedor } from '@/lib/preguntas'
import { costoDe } from '@/lib/ia'
import { motivosRevisar } from '@/lib/iaAutomatica'

/** Las empresas con Mercasist que se comparan (Gerardo = SHOPIT_VE, Gonzalez Urdaneta). */
export const EMPRESAS_COMPETENCIA = [6, 24]

/** Carga (sin generar) las preguntas de los últimos `dias` respondidas fuera del sistema. Devuelve cuántas nuevas. */
export async function cargarCompetencia(dias: number): Promise<number> {
  const { rows: empresas } = await dbGlobal().query(`SELECT id, country FROM empresas WHERE id = ANY($1)`, [EMPRESAS_COMPETENCIA])
  let nuevas = 0
  for (const e of empresas) {
    const filas = await conEmpresa(e.id, e.country as Country, async db => (await db.query(
      `SELECT id, fecha, item_id, item_titulo, item_permalink, texto, respuesta,
              GREATEST(0, EXTRACT(EPOCH FROM respuesta_fecha - fecha))::int AS segundos
       FROM ml_preguntas
       WHERE estado = 'ANSWERED' AND respuesta IS NOT NULL AND respondida_por IS NULL
         AND COALESCE(ia_auto->>'publicada', 'false') <> 'true' AND fecha > NOW() - make_interval(days => $1)
       ORDER BY fecha DESC`, [dias])).rows)
    for (const f of filas) {
      const { rowCount } = await dbGlobal().query(
        `INSERT INTO ia_competencia (empresa_id, pregunta_id, fecha, item_id, item_titulo, item_permalink, pregunta, respuesta_ellos, segundos)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (pregunta_id) DO NOTHING`,
        [e.id, f.id, f.fecha, f.item_id, f.item_titulo, f.item_permalink, f.texto, f.respuesta, f.segundos])
      nuevas += rowCount ?? 0
    }
  }
  return nuevas
}

/** Genera nuestra respuesta para hasta `n` pendientes (de a 4 en paralelo). Devuelve cuántas quedan. */
export async function generarCompetencia(n = 8): Promise<number> {
  const { rows } = await dbGlobal().query(
    `SELECT c.id, c.empresa_id, c.pregunta_id, e.country FROM ia_competencia c JOIN empresas e ON e.id = c.empresa_id
     WHERE c.generada_at IS NULL ORDER BY c.fecha DESC LIMIT $1`, [n])
  const uno = async (r: { id: number; empresa_id: number; pregunta_id: string; country: string }) => {
    try {
      const out = await conEmpresa(r.empresa_id, r.country as Country, async db => {
        const c = await armarContexto(db, Number(r.pregunta_id), r.country)
        const b = await pedirBorrador(c, false, undefined, true, true)
        const motivos = motivosRevisar(b, c.item?.status ?? null, c.pregunta.texto, datosPublicacion(c), true, textoVendedor(c), datosCompatibilidad(c))
        return { respuesta: b.respuesta, motivos, costo: b.llamadas.reduce((a, l) => a + costoDe(l.modelo, l.uso, l.lote), 0) }
      })
      await dbGlobal().query(
        `UPDATE ia_competencia SET respuesta_nuestra = $2, decision = $3, motivos = $4, costo = $5, error = NULL, generada_at = NOW() WHERE id = $1`,
        [r.id, out.respuesta, out.motivos.length ? 'revisar' : 'sola', JSON.stringify(out.motivos), out.costo])
    } catch (e) {
      await dbGlobal().query(`UPDATE ia_competencia SET error = $2, decision = 'revisar', generada_at = NOW() WHERE id = $1`,
        [r.id, (e instanceof Error ? e.message : String(e)).slice(0, 300)])
    }
  }
  for (let i = 0; i < rows.length; i += 4) await Promise.all(rows.slice(i, i + 4).map(uno))
  const { rows: [q] } = await dbGlobal().query(`SELECT COUNT(*)::int AS n FROM ia_competencia WHERE generada_at IS NULL`)
  return q.n
}
