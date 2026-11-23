import { createHash } from 'crypto'
import type { NextRequest } from 'next/server'
import { dbGlobal } from '@/lib/db'

// Embudo de /registro (23-11-2026, migración 196): cada paso del visitante queda en registro_visitas con su evento.
// El visitante es la misma huella de la 128 (IP + navegador, sin guardar la IP), así se siguen sus pasos sin datos
// personales. Nunca se guarda lo que la persona escribe: solo el nombre del campo o el mensaje de error del sistema.

export const EVENTOS = ['vista', 'empezo', 'error', 'salio', 'registro'] as const
export type EventoRegistro = typeof EVENTOS[number]

/** Campos del formulario que pueden quedar como «último campo que tocó». */
export const CAMPOS = ['negocio', 'nombre', 'whatsapp', 'telegram', 'correo', 'clave'] as const

export const ROBOT = /bot|crawl|spider|facebookexternalhit|preview|headless|lighthouse/i

export function visitanteDe(req: NextRequest): string {
  const ua = req.headers.get('user-agent') ?? ''
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  return createHash('sha256').update(`${ip}|${ua}|${process.env.NEXTAUTH_SECRET ?? ''}`).digest('hex').slice(0, 32)
}

/** Texto corto en minúsculas (origen y campaña del link), o null. */
export function corto(v: unknown, max = 60): string | null {
  return typeof v === 'string' ? v.trim().toLowerCase().slice(0, max) || null : null
}

/** Anota un paso. Nunca falla hacia quien lo llama (la página o el registro siguen igual). */
export async function anotarEvento(req: NextRequest, e: {
  evento: EventoRegistro; origen?: string | null; campana?: string | null; detalle?: string | null; segundos?: number | null
}): Promise<void> {
  try {
    if (ROBOT.test(req.headers.get('user-agent') ?? '')) return
    await dbGlobal().query(
      `INSERT INTO registro_visitas (visitante, origen, campana, evento, detalle, segundos) VALUES ($1, $2, $3, $4, $5, $6)`,
      [visitanteDe(req), e.origen ?? null, e.campana ?? null, e.evento, e.detalle?.slice(0, 120) ?? null,
       e.segundos == null ? null : Math.max(0, Math.min(86_400, Math.round(e.segundos)))])
  } catch (err) {
    console.error('[registro/embudo]', err instanceof Error ? err.message : err)
  }
}
