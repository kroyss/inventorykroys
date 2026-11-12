import { NextRequest, NextResponse } from 'next/server'
import { comoPruebaInterna } from '@/lib/ia'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { repasarEco55 } from '@/lib/iaAutomatica'
import type { Country } from '@/lib/types'

// Prueba de Haiku 5.5 (06-11, pedido del dueño): la receta económica con Haiku 5.5 sobre las preguntas que la económica
// ya procesó (primero las que el dueño marcó bien/mal). No publica nada; se compara en Preguntas → Configuración →
// Versión económica. Solo con CRON_SECRET, desde el servidor:
//   curl "http://127.0.0.1:8504/api/cron/ia-eco55?key=…&empresa=1&n=20"
// 12-11: prueba interna del dueño → su gasto va como 'interna' (ia_uso e ia_gasto), no como consumo de la cuenta.
export const GET = (req: NextRequest) => comoPruebaInterna(() => correr(req))

async function correr(req: NextRequest) {
  const q = new URL(req.url).searchParams
  if (!process.env.CRON_SECRET || q.get('key') !== process.env.CRON_SECRET) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresa = Number(q.get('empresa') ?? 1)
  const n = Math.max(1, Math.min(25, Number(q.get('n') ?? 10)))
  const { rows: [e] } = await dbGlobal().query(`SELECT country FROM empresas WHERE id = $1`, [empresa])
  if (!e) return NextResponse.json({ error: 'Empresa no existe' }, { status: 404 })
  const hechas = await conEmpresa(empresa, e.country as Country, db => repasarEco55(db, e.country, n))
  return NextResponse.json({ hechas })
}
