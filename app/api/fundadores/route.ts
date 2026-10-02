import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { currentDate } from '@/lib/tz'
import {
  diasInscripcion, evaluar, normalizarTelegram, PREGUNTAS, proximaInscripcion, RONDA_ACTUAL, tandaInscribiendo,
  TELEGRAM_RE, TZ_FUNDADORES, type Tanda,
} from '@/lib/fundadores'

// Programa Fundadores (PÚBLICO, sin login; el proxy no protege /api).
//   GET  → estado de las tandas (cupos y cuántos ya entraron), para la página.
//   POST → solicitud. Solo en los días de inscripción de una tanda (hora Caracas). La respuesta es SIEMPRE la misma para el vendedor (calificado o no):
//          así nadie sabe qué respuesta lo dejó afuera ni prueba de nuevo con otra.

async function leerTandas() {
  const { rows } = await dbGlobal().query<Tanda>(
    `SELECT t.numero, t.cupos, t.abierta, to_char(t.inscribe_desde, 'YYYY-MM-DD') AS inscribe_desde,
            to_char(t.inscribe_hasta, 'YYYY-MM-DD') AS inscribe_hasta,
            (SELECT COUNT(*)::int FROM fundadores_solicitudes s WHERE s.tanda = t.numero AND s.estado = 'aprobado') AS tomados
     FROM fundadores_tandas t WHERE t.ronda = $1 ORDER BY t.numero`, [RONDA_ACTUAL])
  return rows
}

export async function GET() {
  try {
    return NextResponse.json({ tandas: await leerTandas() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return apiError(err)
  }
}

const valores = (campo: string) =>
  z.enum(PREGUNTAS.find(p => p.campo === campo)!.opciones.map(o => o.valor) as [string, ...string[]], {
    message: 'Responde todas las preguntas',
  })
const opcion = valores
// Varias opciones: llega una lista; se guarda sin repetir, en el orden de la pregunta, separada por coma.
const opciones = (campo: string) => {
  const orden = PREGUNTAS.find(p => p.campo === campo)!.opciones.map(o => o.valor)
  return z.array(valores(campo)).min(1, 'Responde todas las preguntas').max(orden.length)
    .transform(v => orden.filter(o => v.includes(o)).join(','))
}

const Solicitud = z.object({
  nombre: z.string().trim().min(2, 'Escribe tu nombre').max(80),
  telegram: z.string().max(80).transform(normalizarTelegram)
    .refine(t => TELEGRAM_RE.test(t), 'Revisa tu usuario de Telegram (5 a 32 letras, números o _)'),
  nick_ml: z.string().trim().max(40).optional().transform(v => v?.replace(/^@/, '').trim() || null),
  ventas_mes: opcion('ventas_mes'),
  cuentas: opcion('cuentas'),
  despacho: opciones('despacho'),
  dolor: opciones('dolor'),
  inventario: opcion('inventario'),
  navegador_id: z.string().max(64).optional(),
  sitio: z.string().max(200).optional(),          // trampa para bots: un humano no lo ve ni lo llena
})

function ipDe(req: NextRequest) {
  return req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null)
    const parsed = Solicitud.safeParse(raw)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    const s = parsed.data
    if (s.sitio) return NextResponse.json({ ok: true })      // bot: se le dice que sí y no se guarda

    // Solo en los días de inscripción de una tanda (hora de Caracas).
    const tandas = await leerTandas()
    const hoy = currentDate(TZ_FUNDADORES)
    if (!tandaInscribiendo(tandas, hoy)) {
      const prox = proximaInscripcion(tandas, hoy)
      return NextResponse.json({
        error: prox ? `La inscripción es el ${diasInscripcion(prox)}.` : 'Las inscripciones están cerradas.',
      }, { status: 403 })
    }

    const db = dbGlobal()
    const ip = ipDe(req)
    const ipHash = ip ? createHash('sha256').update(`${ip}|${process.env.NEXTAUTH_SECRET ?? ''}`).digest('hex').slice(0, 32) : null

    // Una solicitud por ronda por usuario de Telegram.
    const { rows: [ya] } = await db.query(
      `SELECT id FROM fundadores_solicitudes WHERE ronda = $1 AND telegram = $2`, [RONDA_ACTUAL, s.telegram])
    if (ya) return NextResponse.json({ ok: true, repetida: true })

    // Freno a los que insisten: más de 5 solicitudes desde la misma conexión en un día no se guardan.
    if (ipHash) {
      const { rows: [n] } = await db.query(
        `SELECT COUNT(*)::int AS n FROM fundadores_solicitudes WHERE ip_hash = $1 AND created_at > NOW() - INTERVAL '1 day'`, [ipHash])
      if (n.n >= 5) return NextResponse.json({ ok: true })
    }

    // ¿La misma persona con otros datos? (mismo navegador o misma conexión, otro Telegram).
    // No se bloquea: en Venezuela mucha gente comparte la IP de CANTV o de los datos móviles.
    // Queda marcada para mirarla antes de aprobar.
    const { rows: otras } = await db.query(
      `SELECT telegram, estado, navegador_id = $3 AS mismo_nav
       FROM fundadores_solicitudes
       WHERE ronda = $1 AND telegram <> $4 AND ((navegador_id IS NOT NULL AND navegador_id = $3) OR (ip_hash IS NOT NULL AND ip_hash = $2))
       ORDER BY created_at LIMIT 3`, [RONDA_ACTUAL, ipHash, s.navegador_id ?? null, s.telegram])
    const sospechosa = otras.length
      ? otras.map(o => `${o.mismo_nav ? 'mismo navegador' : 'misma conexión'} que @${o.telegram}${o.estado === 'descartado' ? ' (descartada)' : ''}`).join(' · ')
      : null

    const { puntaje, estado } = evaluar(s, s.nick_ml)
    await db.query(
      `INSERT INTO fundadores_solicitudes
         (ronda, nombre, telegram, nick_ml, ventas_mes, cuentas, despacho, dolor, inventario,
          puntaje, estado, sospechosa, ip_hash, navegador_id, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (ronda, telegram) DO NOTHING`,
      [RONDA_ACTUAL, s.nombre, s.telegram, s.nick_ml, s.ventas_mes, s.cuentas, s.despacho, s.dolor, s.inventario,
       puntaje, estado, sospechosa, ipHash, s.navegador_id ?? null, req.headers.get('user-agent')?.slice(0, 300) ?? null])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
