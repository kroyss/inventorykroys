import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { sesionAvisos } from '@/lib/avisosSesion'
import { avisosDisponibles, leerPrefs, MINUTOS_OPCIONES, procesarActualizaciones, PREFS_INICIALES } from '@/lib/avisosTelegram'
import { ENTORNO, enviarTelegram, nombreBot } from '@/lib/telegram'

// "Mis avisos" (2026-10-14): el Telegram de la persona y qué avisos quiere en la empresa actual.
//   GET  → estado (?revisar=1: además lee los "Iniciar" pendientes del bot, mientras espera la conexión)
//   PUT  → guarda las preferencias de ESTA empresa
//   DELETE → desconecta su Telegram (de todas sus empresas)

let ultimaRevision = 0

export async function GET(req: NextRequest) {
  const s = await sesionAvisos()
  if ('error' in s) return s.error
  try {
    // Esperando que toque "Iniciar": leer la cola del bot (como mucho cada 2 s entre todos).
    if (req.nextUrl.searchParams.get('revisar') && Date.now() - ultimaRevision > 2000) {
      ultimaRevision = Date.now()
      await procesarActualizaciones().catch(e => console.error('[avisos telegram] revisar', e instanceof Error ? e.message : e))
    }
    const [{ rows: [t] }, { rows: [ue] }, bot] = await Promise.all([
      dbGlobal().query(
        `SELECT chat_id IS NOT NULL AND entorno = $2 AS conectado, tg_usuario, tg_nombre, vinculado_at, error
         FROM telegram_usuarios WHERE user_id = $1`, [s.userId, ENTORNO]),
      dbGlobal().query(`SELECT avisos FROM usuario_empresas WHERE user_id = $1 AND empresa_id = $2`, [s.userId, s.empresaId]),
      nombreBot().catch(() => null),
    ])
    return NextResponse.json({
      bot,
      conectado: t?.conectado ? { usuario: t.tg_usuario, nombre: t.tg_nombre, desde: t.vinculado_at } : null,
      error: t && !t.conectado ? t.error : null,
      prefs: leerPrefs(ue?.avisos),
      disponibles: avisosDisponibles({ role: s.user.role, permisos: s.user.permisos ?? null, modulos: s.user.modulos ?? [] }),
      empresa: s.user.empresaNombre ?? null,
      staging: ENTORNO === 'staging',
    })
  } catch (err) {
    return apiError(err)
  }
}

const hora = z.number().int().min(0).max(23)
const Prefs = z.object({
  desconectada: z.boolean(),
  pregunta: z.boolean(), pregunta_min: z.number().int().refine(v => (MINUTOS_OPCIONES as readonly number[]).includes(v)),
  mensaje: z.boolean(), mensaje_min: z.number().int().refine(v => (MINUTOS_OPCIONES as readonly number[]).includes(v)),
  negativa: z.boolean(), neutral: z.boolean(),
  contradictoria: z.boolean(),
  concreta_sola: z.boolean(),
  agotada: z.boolean(), bajo: z.boolean(),
  promos: z.boolean(),
  cierre: z.boolean(), cierre_hora: hora,
  resumen: z.boolean(), resumen_hora: hora,
  silencio: z.boolean(), silencio_desde: hora, silencio_hasta: hora,
}).strict()

export async function PUT(req: NextRequest) {
  const s = await sesionAvisos()
  if ('error' in s) return s.error
  const r = Prefs.safeParse({ ...PREFS_INICIALES, ...(await req.json().catch(() => ({}))) })
  if (!r.success) return NextResponse.json({ error: r.error.message }, { status: 400 })
  try {
    await dbGlobal().query(`UPDATE usuario_empresas SET avisos = $3 WHERE user_id = $1 AND empresa_id = $2`,
      [s.userId, s.empresaId, JSON.stringify(r.data)])
    return NextResponse.json({ ok: true, prefs: r.data })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE() {
  const s = await sesionAvisos()
  if ('error' in s) return s.error
  try {
    const { rows: [t] } = await dbGlobal().query(
      `SELECT chat_id::text AS chat FROM telegram_usuarios WHERE user_id = $1 AND chat_id IS NOT NULL AND entorno = $2`, [s.userId, ENTORNO])
    await dbGlobal().query(`UPDATE telegram_usuarios SET chat_id = NULL, error = NULL, actualizado_at = NOW() WHERE user_id = $1`, [s.userId])
    if (t?.chat) {
      await enviarTelegram(t.chat, '👋 Desconectaste este Telegram de <b>El Comerciante Digital</b>. Ya no te llegarán avisos.\n\nPuedes volver a conectarlo cuando quieras desde <i>Mis avisos</i>.').catch(() => {})
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
