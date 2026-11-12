import { NextRequest, NextResponse } from 'next/server'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { costoDe, comoPruebaInterna } from '@/lib/ia'
import { armarContexto } from '@/lib/preguntas'
import { corregible, corregirPregunta } from '@/lib/iaAutomatica'
import { borradorMensaje } from '@/lib/mensajesIA'
import { mensajeCorregible, motivosMensaje } from '@/lib/mensajesIAPrueba'
import { leerMiIA, MI_IA_KEY } from '@/lib/miIA'
import type { Country } from '@/lib/types'

// Medición interna (12-11, idea del dueño): las FRENADAS que se pueden arreglar escribiendo, corregidas con la MISMA
// función que usa la respuesta automática (corregirPregunta / borradorMensaje con corrección). No publica, no guarda.
//   curl "http://127.0.0.1:8504/api/cron/ia-corregir?key=…&empresa=1&n=10&offset=0[&tipo=mensajes]"
// 12-11: prueba interna del dueño → su gasto va como 'interna' (ia_uso e ia_gasto), no como consumo de la cuenta.
export const GET = (req: NextRequest) => comoPruebaInterna(() => correr(req))

async function correr(req: NextRequest) {
  const q = new URL(req.url).searchParams
  if (!process.env.CRON_SECRET || q.get('key') !== process.env.CRON_SECRET) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresa = Number(q.get('empresa') ?? 1)
  const n = Math.max(1, Math.min(12, Number(q.get('n') ?? 10))), offset = Number(q.get('offset') ?? 0)
  const desde = q.get('desde') ?? '2026-11-07'
  const { rows: [e] } = await dbGlobal().query(`SELECT country, 'inventario' = ANY(modulos) AS inv FROM empresas WHERE id = $1`, [empresa])
  if (!e) return NextResponse.json({ error: 'Empresa no existe' }, { status: 404 })
  const resultados = await conEmpresa(empresa, e.country as Country, async db => {
    const out = []
    if (q.get('tipo') === 'mensajes') {
      const { rows } = await db.query(
        `SELECT i.id::text, i.pack_id::text, i.conexion_id, i.mensaje_at, i.comprador, i.respuesta, i.motivos, i.marca, x.ml_user_id
         FROM ml_mensajes_ia i JOIN ml_conexiones x ON x.id = i.conexion_id
         WHERE i.decision = 'revisar' AND i.mensaje_at >= $1::timestamptz ORDER BY i.mensaje_at`, [desde])
      const { rows: [mi] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [MI_IA_KEY])
      const persona = leerMiIA(mi?.value)?.persona ?? []
      for (const r of rows.filter(r => mensajeCorregible(r.motivos ?? [])).slice(offset, offset + n)) {
        try {
          const fecha = new Date(r.mensaje_at).toISOString()
          const { rows: antes } = await db.query(`SELECT texto FROM ml_mensajes WHERE pack_id = $1 AND propio AND fecha < $2 ORDER BY fecha`, [r.pack_id, fecha])
          const k = await borradorMensaje(db, r.conexion_id, Number(r.ml_user_id), r.pack_id, e.country, e.inv, fecha, { anterior: r.respuesta ?? '', problemas: r.motivos })
          const motivos = k.respuesta ? motivosMensaje(k, r.comprador ?? '', persona, antes.map(x => String(x.texto)).join('\n')) : ['vacía']
          out.push({ id: r.id, pregunta: r.comprador, marca: r.marca, antes: r.respuesta, motivosAntes: r.motivos, despues: k.respuesta,
            confianza: k.confianza, decision: motivos.length ? 'revisar' : 'sola', motivos, costo: costoDe(k.modelo, k.uso) })
        } catch (err) { out.push({ id: r.id, error: err instanceof Error ? err.message : String(err) }) }
      }
      return out
    }
    const { rows } = await db.query(
      `SELECT p.id::text, p.texto, p.item_estado, p.ia_auto FROM ml_preguntas p
       WHERE p.ia_auto->>'decision' = 'revisar' AND p.ia_auto->>'fecha' >= $1 ORDER BY p.ia_auto->>'fecha'`, [desde])
    for (const r of rows.filter(r => corregible(r.ia_auto.motivos ?? [])).slice(offset, offset + n)) {
      try {
        const a = r.ia_auto
        const c = await armarContexto(db, Number(r.id), e.country)
        const b = { respuesta: a.respuesta ?? '', confianza: a.confianza ?? 'baja', falta_dato: null, verificacion: a.verificacion ?? null }
        const k = await corregirPregunta(c, b, a.motivos ?? [], r.item_estado ?? 'active')
        out.push({ id: r.id, pregunta: r.texto, marca: a.marca ?? null, antes: a.respuesta, motivosAntes: a.motivos, despues: k?.b.respuesta ?? '',
          decision: k && !k.motivos.length ? 'sola' : 'revisar', motivos: k?.motivos ?? ['no se pudo corregir'],
          costo: (k?.llamadas ?? []).reduce((s, l) => s + costoDe(l.modelo, l.uso), 0), costoOriginal: a.costo ?? null })
      } catch (err) { out.push({ id: r.id, pregunta: r.texto, error: err instanceof Error ? err.message : String(err) }) }
    }
    return out
  })
  return NextResponse.json({ resultados })
}
