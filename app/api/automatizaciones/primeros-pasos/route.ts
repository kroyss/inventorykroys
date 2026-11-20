import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { dbGlobal } from '@/lib/db'
import { faltanMiIA, TEMAS_MI_IA } from '@/lib/miIA'
import { configIA } from '@/lib/iaAutomatica'
import { avisosHabilitados } from '@/lib/avisosTelegram'

// «Primeros pasos» del Inicio de Automatizaciones (20-11, el dueño; idea vista en Mercasist). Lo único NECESARIO es
// conectar MercadoLibre; Mi IA, las respuestas automáticas y Telegram son opcionales (se puede trabajar a mano solo con
// la cuenta conectada). Cada paso se marca solo con lo que la empresa ya hizo. «Comprendo, ocultar» se guarda por
// empresa (app_settings.guia_automatizaciones_oculta) y no vuelve a salir. Solo para quien conecta las cuentas de ML.
const CLAVE = 'guia_automatizaciones_oculta'

async function acceso() {
  const s = await getSessionDb()
  if (!s.session || !s.db) return { error: unauthorized() }
  const u = s.session.user
  if (!tieneModulo(u, 'preguntas') || !puede(u, 'ml_cuentas')) return { error: forbidden() }
  return { db: s.db, u }
}

export async function GET() {
  const a = await acceso()
  if ('error' in a) return a.error
  const { db, u } = a
  try {
    const { rows: [r] } = await db.query(
      `SELECT EXISTS (SELECT 1 FROM ml_conexiones WHERE estado = 'activa') AS ml,
              COALESCE((SELECT value FROM app_settings WHERE key = '${CLAVE}'), '') = '1' AS oculta`)
    // Sin MercadoLibre conectado sale igual (es lo único necesario), aunque la hayan ocultado.
    if (r.oculta && r.ml) return NextResponse.json({ oculta: true })
    // Cada paso opcional sale solo si la empresa lo tiene y la persona puede hacerlo.
    const config = puede(u, 'automatizaciones_config')
    const conMiIA = config && tieneModulo(u, 'mi_ia')
    const conAuto = conMiIA && tieneModulo(u, 'ia_automatica')
    const [faltan, ia, telegram] = await Promise.all([
      conMiIA ? faltanMiIA(db) : Promise.resolve(null),
      conAuto ? configIA(db) : Promise.resolve(null),
      avisosHabilitados(u.organizacionId).then(async si => si
        ? (await dbGlobal().query(`SELECT 1 FROM telegram_usuarios WHERE user_id = $1 AND chat_id IS NOT NULL`, [u.id])).rowCount! > 0
        : null).catch(() => null),
    ])
    return NextResponse.json({
      oculta: false, ml: r.ml,
      miIA: faltan ? { faltan: faltan.length, total: TEMAS_MI_IA.length } : null,
      auto: ia ? ia.modo === 'real' : null,
      telegram,   // null = no lo tiene; true/false = vinculado o no (es de cada persona)
    })
  } catch (err) { return apiError(err) }
}

const Body = z.object({ ocultar: z.boolean() })

export async function POST(req: NextRequest) {
  const a = await acceso()
  if ('error' in a) return a.error
  try {
    const p = Body.safeParse(await req.json().catch(() => null))
    if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    await a.db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [CLAVE, p.data.ocultar ? '1' : ''])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
