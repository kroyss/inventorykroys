import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { currentDate } from '@/lib/tz'
import {
  diasInscripcion, evaluar, fechaTanda, saltaAContacto, FECHA_LIMITE_ACTIVACION, INSTAGRAM_RE, MENSAJE_MAX, normalizarInstagram, normalizarTelegram,
  PREGUNTAS, proximaInscripcion, RONDA_ACTUAL, tandaInscribiendo, TELEGRAM_RE, TZ_FUNDADORES, type Tanda,
} from '@/lib/fundadores'

// Programa Fundadores (PÚBLICO, sin login; el proxy no protege /api).
//   GET  → estado de las tandas (cupos y cuántos ya entraron), para la página.
//   PATCH → visita (vista / empezó el formulario / envió), para medir el embudo (migración 061).
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
  // Telegram o Instagram: al menos uno (2026-10-08). Vacío = no lo dio.
  telegram: z.string().max(80).optional().transform(v => (v ? normalizarTelegram(v) : '') || null)
    .refine(t => t === null || TELEGRAM_RE.test(t), 'Revisa tu usuario de Telegram: empieza con una letra y tiene de 5 a 32 letras, números o _'),
  instagram: z.string().max(120).optional().transform(v => (v ? normalizarInstagram(v) : '') || null)
    .refine(t => t === null || INSTAGRAM_RE.test(t), 'Revisa tu usuario de Instagram: letras, números, punto o _ (no un número de teléfono)'),
  acepta_plazo: z.literal(true, { message: `Marca que inicias tu activación antes del ${fechaTanda(FECHA_LIMITE_ACTIVACION)}` }),
  nick_ml: z.string().trim().max(40).optional().transform(v => v?.replace(/^@/, '').trim() || null),
  mensaje: z.string().trim().max(MENSAJE_MAX, `El mensaje tiene un máximo de ${MENSAJE_MAX} caracteres`).optional()
    .transform(v => v || null),
  tipo: opcion('tipo'),
  // Opcionales en el esquema: quien marca "hago marketing" no las responde (salta al contacto). Para los
  // demás se exigen abajo (refine).
  ventas_mes: opcion('ventas_mes').optional(),
  cuentas: opcion('cuentas').optional(),
  despacho: opciones('despacho').optional(),
  dolor: opciones('dolor').optional(),
  activacion: opcion('activacion').optional(),
  inventario: opcion('inventario').optional(),
  herramientas: opciones('herramientas').optional(),
  compromiso: opcion('compromiso').optional(),
  navegador_id: z.string().max(64).optional(),
  sitio: z.string().max(200).optional(),          // trampa para bots: un humano no lo ve ni lo llena
}).refine(s => s.telegram || s.instagram, { message: 'Escribe tu usuario de Telegram o de Instagram (al menos uno)' })
  .refine(s => saltaAContacto(s) || PREGUNTAS.every(p => s[p.campo]), { message: 'Responde todas las preguntas' })

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
        error: prox ? `Las postulaciones son el ${diasInscripcion(prox)}.` : 'Las postulaciones están cerradas.',
      }, { status: 403 })
    }

    const db = dbGlobal()
    const ip = ipDe(req)
    const ipHash = ip ? createHash('sha256').update(`${ip}|${process.env.NEXTAUTH_SECRET ?? ''}`).digest('hex').slice(0, 32) : null

    // Una solicitud por ronda por usuario de Telegram o de Instagram.
    const { rows: [ya] } = await db.query(
      `SELECT id FROM fundadores_solicitudes WHERE ronda = $1 AND (telegram = $2 OR instagram = $3)`, [RONDA_ACTUAL, s.telegram, s.instagram])
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
      `SELECT COALESCE(telegram, instagram) AS telegram, estado, navegador_id = $3 AS mismo_nav
       FROM fundadores_solicitudes
       WHERE ronda = $1 AND telegram IS DISTINCT FROM $4 AND instagram IS DISTINCT FROM $5 AND ((navegador_id IS NOT NULL AND navegador_id = $3) OR (ip_hash IS NOT NULL AND ip_hash = $2))
       ORDER BY created_at LIMIT 3`, [RONDA_ACTUAL, ipHash, s.navegador_id ?? null, s.telegram, s.instagram])
    const sospechosa = otras.length
      ? otras.map(o => `${o.mismo_nav ? 'mismo navegador' : 'misma conexión'} que @${o.telegram}${o.estado === 'descartado' ? ' (descartada)' : ''}`).join(' · ')
      : null

    const { puntaje, estado } = evaluar(s as Parameters<typeof evaluar>[0], s.nick_ml)
    await db.query(
      `INSERT INTO fundadores_solicitudes
         (ronda, nombre, telegram, nick_ml, ventas_mes, cuentas, despacho, dolor, inventario,
          puntaje, estado, sospechosa, ip_hash, navegador_id, user_agent, mensaje, compromiso, herramientas,
          tipo, activacion, instagram, acepta_plazo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,TRUE)
       ON CONFLICT DO NOTHING`,
      [RONDA_ACTUAL, s.nombre, s.telegram, s.nick_ml, s.ventas_mes ?? '', s.cuentas ?? '', s.despacho ?? '', s.dolor ?? '', s.inventario ?? '',
       puntaje, estado, sospechosa, ipHash, s.navegador_id ?? null, req.headers.get('user-agent')?.slice(0, 300) ?? null,
       s.mensaje, s.compromiso ?? null, s.herramientas ?? null, s.tipo, s.activacion ?? null, s.instagram])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}

// ── Visitas (PATCH): el embudo de la página, sin IP ni cookies de terceros ──────────────────

const Visita = z.object({
  navegador_id: z.string().regex(/^[0-9a-f-]{36}$/i),
  evento: z.enum(['vista', 'empezo', 'enviado']),
  utm_source: z.string().max(60).optional(),
  utm_campaign: z.string().max(60).optional(),
  referrer: z.string().max(300).optional(),
})
const BOT = /bot|crawl|spider|preview|headless|externalhit|curl|python|wget/i
// No se cuenta de nuevo la misma vista en 30 minutos (recargas) ni el mismo paso en 12 horas.
const REPETIDA = { vista: '30 minutes', empezo: '12 hours', enviado: '12 hours' } as const

/** De dónde llegó: el utm del anuncio; si no, el sitio que la mandó; si no, la app desde la que
 *  abrió (Instagram y Facebook abren los links en su navegador y no dicen de dónde vienen). */
function origenDe(v: z.infer<typeof Visita>, ua: string) {
  const utm = v.utm_source?.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 30)
  if (utm) return utm
  let host = ''
  try { host = v.referrer ? new URL(v.referrer).hostname.replace(/^www\./, '') : '' } catch { /* referrer raro */ }
  if (/instagram/.test(host)) return 'instagram'
  if (/facebook|fb\.|messenger/.test(host)) return 'facebook'
  if (/whatsapp|wa\.me/.test(host)) return 'whatsapp'
  if (/t\.me|telegram/.test(host)) return 'telegram'
  if (/google/.test(host)) return 'google'
  if (host && !host.endsWith('elcomerciantedigital.com')) return host.slice(0, 40)
  if (/Instagram/.test(ua)) return 'instagram'
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'facebook'
  if (/WhatsApp/i.test(ua)) return 'whatsapp'
  return 'directo'
}

export async function PATCH(req: NextRequest) {
  try {
    const ua = req.headers.get('user-agent') ?? ''
    const v = Visita.safeParse(await req.json().catch(() => null))
    if (!v.success || BOT.test(ua)) return new NextResponse(null, { status: 204 })
    const d = v.data
    await dbGlobal().query(
      `INSERT INTO fundadores_visitas (navegador_id, evento, origen, campana, movil)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (SELECT 1 FROM fundadores_visitas
                         WHERE navegador_id = $1 AND evento = $2 AND fecha > NOW() - $6::interval)`,
      [d.navegador_id, d.evento, origenDe(d, ua), d.utm_campaign?.trim().slice(0, 40) || null,
       /Android|iPhone|iPad|Mobile/i.test(ua), REPETIDA[d.evento]])
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
