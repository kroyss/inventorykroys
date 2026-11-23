import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { leerPlantillasCal, sqlBandeja, sqlGemelas, sqlLista, sqlListaEl } from '@/lib/calificacionesML'
import { ventasDesdeML } from '@/lib/modulos'

// GET /api/calificaciones/venta?pack=… (23-11, el dueño: «calificar el mismo día desde Mensajes») → cómo está la
// calificación de las ventas de esa conversación (un paquete puede traer varias): ya calificada, sugerencia del
// sistema, si sigue en los días de espera y si parece una compra duplicada. Lo usa el botón «Calificar» de Mensajes.
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas('ver_calificaciones')
  if ('error' in s) return s.error
  const pack = new URL(req.url).searchParams.get('pack') ?? ''
  if (!/^\d{6,20}$/.test(pack)) return NextResponse.json({ error: 'Venta inválida' }, { status: 400 })
  try {
    const { rows: [pl] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_plantillas'`)
    const plantillas = leerPlantillasCal(pl?.value)
    const { rows: ordenes } = await s.db.query(
      `SELECT id::text, cal_vendedor, cal_concretada, fecha FROM ml_ordenes WHERE id = $1::bigint OR pack_id = $1::bigint ORDER BY id`, [pack])
    if (!ordenes.length) return NextResponse.json({ ordenes: [], plantillas })
    const sinCalificar = ordenes.filter(o => !o.cal_vendedor).map(o => o.id as string)
    const { rows: bandeja } = sinCalificar.length ? await s.db.query(
      `SELECT b.id, b.sugerencia,
              (b.sugerencia <> 'no_concretada' AND NOT ${sqlLista(plantillas.esperaDias)}) AS en_espera,
              ${sqlListaEl(plantillas.esperaDias)} AS lista_el,
              CASE WHEN b.sugerencia <> 'concretada' THEN ${sqlGemelas()} END AS gemelas
       FROM (${sqlBandeja(ventasDesdeML(s.session.user))}) b WHERE b.id = ANY($2::text[])`,
      [plantillas.noConcretada.dias, sinCalificar]) : { rows: [] }
    // La gemela concretada: ya calificada así en ML, o el sistema la sugiere concretada.
    const gemelaConcretada = async (g: { id: string; conc: boolean | null }[] | null) => {
      for (const x of g ?? []) {
        if (x.conc === true) return x.id
        const { rows: [b] } = await s.db.query(
          `SELECT b.sugerencia FROM (${sqlBandeja(ventasDesdeML(s.session.user))}) b WHERE b.id = $2`, [plantillas.noConcretada.dias, x.id])
        if (b?.sugerencia === 'concretada') return x.id
      }
      return null
    }
    const res = []
    for (const o of ordenes) {
      const b = bandeja.find(x => x.id === o.id)
      res.push({ id: o.id, cal_vendedor: o.cal_vendedor, cal_concretada: o.cal_concretada,
        sugerencia: b?.sugerencia ?? null, en_espera: b?.en_espera ?? false, lista_el: b?.lista_el ?? null,
        duplicada_de: b ? await gemelaConcretada(b.gemelas) : null })
    }
    return NextResponse.json({ ordenes: res, plantillas })
  } catch (err) {
    return apiError(err)
  }
}
