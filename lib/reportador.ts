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
import { dbEmpresa, dbGlobal } from '@/lib/db'
import { ES_STAGING, MENSAJE_STAGING_REPORTADOR } from '@/lib/entorno'

// MercadoLibre corta el mensaje en 350 caracteres SIN AVISAR (main_reportador.py).
export const LIMITE_CARACTERES = 350
// Reserva de la cola por equipo: si un equipo se cae, otro puede tomarla después de esto.
export const RESERVA_HORAS = 2

// Órdenes desde la web (mig 028): el equipo pregunta cada ~30 s. Una orden que nadie tomó
// en ORDEN_VENCE_HORAS vence (no se dispara a destiempo si el equipo estuvo apagado).
export const ORDEN_VENCE_HORAS = 12
// "En línea" = preguntó hace menos de esto (3 consultas perdidas de margen).
export const EN_LINEA_SEGUNDOS = 100

export const ESTADOS_RESULTADO =['ENVIADO', 'SIN_CHAT', 'RECHAZADO', 'ERROR'] as const
export type EstadoResultado = typeof ESTADOS_RESULTADO[number]

// Pendiente de reportar: nunca intentado, o intentado con error/rechazo (se reintenta,
// como el script que los dejaba en la cola). ENVIADO / SIN_CHAT / CSV son finales.
export const SQL_PENDIENTE = `(e.reporte_estado IS NULL OR e.reporte_estado IN ('RECHAZADO', 'ERROR'))`

// Envíos que entran al Reportador: impresos, no reimpresiones (ese comprador ya fue
// reportado), de jornadas CERRADAS (el paquete ya se entregó al transportista). Los
// TEALCA solo cuando ya tienen su guía FINAL: la pre-guía de la etiqueta no sirve para
// rastrear. Los ZOOM entran siempre (su guía ya es la real).
export const SQL_REPORTABLE = `
  e.impresa AND NOT e.reimpresion
  AND (e.carrier = 'ZOOM' OR e.guia_final IS NOT NULL)
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
  if (ES_STAGING) return { error: NextResponse.json({ error: MENSAJE_STAGING_REPORTADOR }, { status: 403 }) }
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const m = /^(ve|co)_[0-9a-f]{48}$/.exec(token)
  if (!m) return { error: NextResponse.json({ error: 'Equipo no vinculado' }, { status: 401 }) }
  // El token no dice la empresa: se busca con una función que salta RLS SOLO para esto
  // (db/multiempresa/04_funciones.sql) y desde ahí se trabaja con la conexión de su empresa.
  const { rows: [emp] } = await dbGlobal().query(
    `SELECT empresa_id, country, modulos FROM reportador_empresa_por_token($1)`, [hashToken(token)])
  if (!emp || !emp.modulos?.includes('reportador')) {
    return { error: NextResponse.json({ error: 'Este equipo fue desvinculado. Vuelve a vincularlo desde Despachos.' }, { status: 401 }) }
  }
  const db = dbEmpresa(emp.empresa_id, emp.country)
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

/** Mismo mensaje para Tealca: donde diga ZOOM se pone TEALCA (respeta mayúsculas/minúsculas).
 *  Espejo de para_tealca() en reportador/corrida.py: si cambia uno, cambia el otro. */
export function paraTealca(texto: string) {
  return texto.replace(/zoom/gi, m => (m === m.toUpperCase() ? 'TEALCA' : m[0] === m[0].toUpperCase() ? 'Tealca' : 'tealca'))
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
    // El peor caso incluye la versión Tealca (TEALCA tiene 2 letras más que ZOOM).
    const armado = rellenar(t, c.bloque, paginaLarga, '9'.repeat(12))
    const largo = Math.max(armado.length, paraTealca(armado).length)
    if (largo > LIMITE_CARACTERES) {
      p.push(`La plantilla ${i + 1} llega a ${largo} caracteres (máximo ${LIMITE_CARACTERES}): MercadoLibre la cortaría`)
    }
  })
  return p
}

/** Cuenta a la que pertenece un envío según el comienzo de su remitente. */
export function cuentaDe(remitente: string | null, cuentas: Cuenta[], remitenteDefault: string) {
  const r = (remitente?.trim() || remitenteDefault).toUpperCase()
  return cuentas.find(c => r.startsWith(c.filtro.trim().toUpperCase())) ?? null
}

// ── Órdenes desde la web ────────────────────────────────────────────────────
/** Al cerrar una jornada con algo que reportar: una orden para cada equipo con
 *  `auto_reportar` que no tenga ya una en marcha. Si varios equipos la toman, la reserva
 *  de la cola (tomar) evita que dos le escriban al mismo comprador. */
export async function crearOrdenesAuto(db: Pick<Pool, 'query'>, jornadaId: number, userId: number) {
  const { rowCount } = await db.query(
    `INSERT INTO reportador_ordenes (equipo_id, origen, created_by)
     SELECT q.id, 'AUTO', $2
     FROM reportador_equipos q
     WHERE q.auto_reportar AND q.token_hash IS NOT NULL AND q.revocado_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM reportador_ordenes o
                       WHERE o.equipo_id = q.id AND o.estado IN ('PENDIENTE', 'EN_CURSO'))
       AND EXISTS (SELECT 1 FROM despacho_etiquetas e
                   JOIN despacho_lotes l ON l.id = e.lote_id
                   WHERE l.jornada_id = $1 AND e.impresa AND NOT e.reimpresion AND l.status = 'GENERADO')`,
    [jornadaId, userId])
  return rowCount ?? 0
}
