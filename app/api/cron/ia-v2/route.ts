import { NextRequest, NextResponse } from 'next/server'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { costoDe, comoPruebaInterna } from '@/lib/ia'
import { armarContexto, datosCompatibilidad, datosPublicacion, pedirBorrador, textoVendedor } from '@/lib/preguntas'
import { motivosRevisar } from '@/lib/iaAutomatica'
import type { Country } from '@/lib/types'

// Prueba interna (07-11, pedido del dueño): la IA de preguntas versión 2 (más corta, verificador más justo, frases seguras)
// contra la de producción, en preguntas YA respondidas. Si la pregunta ya pasó por la IA automática se usa esa decisión
// guardada (con la marca bien/mal del dueño); si no, se calcula también la de producción. No publica nada ni guarda nada
// ni descuenta créditos. Solo con CRON_SECRET, desde el servidor:
//   curl "http://127.0.0.1:8504/api/cron/ia-v2?key=…&empresa=1&n=10&offset=0"
// 12-11: prueba interna del dueño → su gasto va como 'interna' (ia_uso e ia_gasto), no como consumo de la cuenta.
export const GET = (req: NextRequest) => comoPruebaInterna(() => correr(req))

async function correr(req: NextRequest) {
  const q = new URL(req.url).searchParams
  if (!process.env.CRON_SECRET || q.get('key') !== process.env.CRON_SECRET) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresa = Number(q.get('empresa') ?? 1)
  const n = Math.max(1, Math.min(10, Number(q.get('n') ?? 5))), offset = Number(q.get('offset') ?? 0)
  const { rows: [e] } = await dbGlobal().query(`SELECT country FROM empresas WHERE id = $1`, [empresa])
  if (!e) return NextResponse.json({ error: 'Empresa no existe' }, { status: 404 })
  const resultados = await conEmpresa(empresa, e.country as Country, async db => {
    const { rows } = await db.query(
      `SELECT p.id::text, p.texto, p.respuesta, p.item_estado, p.ia_auto FROM ml_preguntas p
       WHERE p.estado = 'ANSWERED' AND p.respuesta IS NOT NULL AND p.fecha > NOW() - INTERVAL '30 days'
       ORDER BY p.fecha DESC OFFSET $1 LIMIT $2`, [offset, n])
    const out = []
    for (const r of rows) {
      try {
        const c = await armarContexto(db, Number(r.id), e.country)
        const datos = datosPublicacion(c), estado = c.item?.status ?? r.item_estado
        const correr = async (v2: boolean) => {
          const b = await pedirBorrador(c, false, undefined, v2)
          const motivos = motivosRevisar(b, estado, c.pregunta.texto, datos, v2, textoVendedor(c), datosCompatibilidad(c))
          return { respuesta: b.respuesta, confianza: b.confianza, decision: motivos.length ? 'revisar' : 'sola', motivos,
            costo: b.llamadas.reduce((a, l) => a + costoDe(l.modelo, l.uso, l.lote), 0) }
        }
        const guardada = r.ia_auto?.decision ? {
          respuesta: r.ia_auto.respuesta, confianza: r.ia_auto.confianza, decision: r.ia_auto.decision,
          motivos: r.ia_auto.motivos ?? [], marca: r.ia_auto.marca ?? null, guardada: true,
        } : null
        out.push({ id: r.id, pregunta: r.texto, real: r.respuesta, antes: guardada ?? await correr(false), v2: await correr(true) })
      } catch (err) {
        out.push({ id: r.id, pregunta: r.texto, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return out
  })
  return NextResponse.json({ resultados })
}
