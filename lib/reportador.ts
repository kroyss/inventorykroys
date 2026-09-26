// Reportador conectado: el programa de escritorio que le escribe a cada comprador su
// guía. Toma la cola directo del sistema (sin CSV) y devuelve el resultado de cada
// mensaje apenas lo envía, así nada se reporta dos veces aunque se corte a la mitad.
//
// Auth del equipo: token largo (se entrega una sola vez al vincular con un código de
// la pantalla Despachos). El prefijo del token dice el país → qué DB usar.
import { createHash, randomBytes, randomInt } from 'crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { Pool } from 'pg'
import { getDb } from '@/lib/db'
import { REMITENTE_DEFAULT } from '@/lib/despachos'

// MercadoLibre corta el mensaje en 350 caracteres SIN AVISAR (main_reportador.py).
export const LIMITE_CARACTERES = 350
// Reserva de la cola por equipo: si un equipo se cae, otro puede tomarla después de esto.
export const RESERVA_HORAS = 2

export const ESTADOS_RESULTADO = ['ENVIADO', 'SIN_CHAT', 'RECHAZADO', 'ERROR'] as const
export type EstadoResultado = typeof ESTADOS_RESULTADO[number]

// Pendiente de reportar: nunca intentado, o intentado con error/rechazo (se reintenta,
// como el script que los dejaba en la cola). ENVIADO / SIN_CHAT / CSV son finales.
export const SQL_PENDIENTE = `(e.reporte_estado IS NULL OR e.reporte_estado IN ('RECHAZADO', 'ERROR'))`

// Envíos que entran al Reportador: impresos, no reimpresiones (ese comprador ya fue
// reportado), de jornadas CERRADAS (el paquete ya se entregó a ZOOM).
export const SQL_REPORTABLE = `
  e.impresa AND NOT e.reimpresion
  AND l.status = 'GENERADO'
  AND j.status = 'CERRADA'`

// ── Tokens ──────────────────────────────────────────────────────────────────
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

export function nuevoToken(country: 'VE' | 'CO') {
  return `${country.toLowerCase()}_${randomBytes(24).toString('hex')}`
}

// Código de vinculación legible: sin 0/O/1/I para que no se confundan al tipearlo.
export function nuevoCodigo() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const parte = () => Array.from({ length: 3 }, () => abc[randomInt(abc.length)]).join('')
  return `${parte()}-${parte()}`
}

export interface Equipo { id: number; nombre: string | null }

/** Autentica al equipo por `Authorization: Bearer <token>`. */
export async function autenticarEquipo(req: NextRequest):
  Promise<{ db: Pool; equipo: Equipo } | { error: NextResponse }> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const m = /^(ve|co)_[0-9a-f]{48}$/.exec(token)
  if (!m) return { error: NextResponse.json({ error: 'Equipo no vinculado' }, { status: 401 }) }
  const db = getDb(m[1].toUpperCase() as 'VE' | 'CO')
  const version = (req.headers.get('x-reportador-version') ?? '').slice(0, 40) || null
  const { rows: [equipo] } = await db.query(
    `UPDATE reportador_equipos SET last_seen_at = NOW(), version = COALESCE($2, version)
     WHERE token_hash = $1 AND revocado_at IS NULL
     RETURNING id, nombre`,
    [hashToken(token), version])
  if (!equipo) {
    return { error: NextResponse.json({ error: 'Este equipo fue desvinculado. Vuelve a vincularlo desde Despachos.' }, { status: 401 }) }
  }
  return { db, equipo }
}

// ── Configuración de mensajes ───────────────────────────────────────────────
export interface Cuenta { nombre: string; filtro: string; pagina: string }
export interface ConfigReportador { cuentas: Cuenta[]; plantillas: string[]; bloque: string }

function parse<T>(v: string | undefined, def: T): T {
  if (!v) return def
  try { return JSON.parse(v) as T } catch { return def }
}

export async function leerConfig(db: Pick<Pool, 'query'>): Promise<ConfigReportador> {
  const { rows } = await db.query(
    `SELECT key, value FROM app_settings
     WHERE key IN ('reportador_cuentas', 'reportador_plantillas', 'reportador_bloque')`)
  const kv = Object.fromEntries(rows.map(r => [r.key, r.value as string]))
  return {
    cuentas:    parse<Cuenta[]>(kv.reportador_cuentas, []),
    plantillas: parse<string[]>(kv.reportador_plantillas, []),
    bloque:     kv.reportador_bloque ?? '',
  }
}

export function rellenar(plantilla: string, bloque: string, pagina: string, guia: string) {
  return (plantilla + bloque).split('{pagina}').join(pagina).split('{guia}').join(guia)
}

/** Problemas de la config (vacío = OK). Mismo criterio que validar_plantillas() del
 *  script: el peor caso (página más larga + guía de 12 dígitos) no pasa de 350. */
export function problemasConfig(c: ConfigReportador): string[] {
  const p: string[] = []
  if (c.cuentas.length === 0) p.push('Falta al menos una cuenta de MercadoLibre')
  if (c.plantillas.length === 0) p.push('Falta al menos una plantilla de mensaje')
  c.plantillas.forEach((t, i) => {
    if (!t.includes('{guia}')) p.push(`La plantilla ${i + 1} no tiene {guia}`)
  })
  const filtros = c.cuentas.map(x => x.filtro.trim().toUpperCase())
  if (new Set(filtros).size !== filtros.length) p.push('Dos cuentas tienen el mismo comienzo de remitente')
  const paginaLarga = c.cuentas.reduce((a, x) => (x.pagina.length > a.length ? x.pagina : a), '')
  c.plantillas.forEach((t, i) => {
    const largo = rellenar(t, c.bloque, paginaLarga, '9'.repeat(12)).length
    if (largo > LIMITE_CARACTERES) {
      p.push(`La plantilla ${i + 1} llega a ${largo} caracteres (máximo ${LIMITE_CARACTERES}): MercadoLibre la cortaría`)
    }
  })
  return p
}

/** Cuenta a la que pertenece un envío según el comienzo de su remitente. */
export function cuentaDe(remitente: string | null, cuentas: Cuenta[]) {
  const r = (remitente?.trim() || REMITENTE_DEFAULT).toUpperCase()
  return cuentas.find(c => r.startsWith(c.filtro.trim().toUpperCase())) ?? null
}
