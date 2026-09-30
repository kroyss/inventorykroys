// Conexión con la API de MercadoLibre (cuentas autorizadas por cada empresa).
//
// Configuración del servidor (variables de entorno, NUNCA en el repo):
//   ML_CLIENT_ID       id de la app "Auto Envios Venezuela"
//   ML_CLIENT_SECRET   secreto de la app
//   ML_REDIRECT_URI    https://<dominio>/api/ml/callback — idéntica a la registrada en ML
//   ML_TOKEN_KEY       32 bytes en base64 (openssl rand -base64 32): cifra los tokens en la base
//
// Reglas de ML verificadas contra la cuenta real (ver traspaso de la API de preguntas):
//   - el access token dura lo que diga `expires_in` (hoy 6 h), no la documentación;
//   - el refresh token es de UN SOLO USO: cada renovación trae uno nuevo e invalida el
//     anterior. Dos renovaciones a la vez desconectan la cuenta → se serializan con
//     SELECT … FOR UPDATE sobre la fila de la conexión;
//   - no hay cabeceras de rate limit: ante un 429 se reintenta con espera creciente.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import type { Pool } from 'pg'
import type { Country } from '@/lib/types'

export const ML_API = 'https://api.mercadolibre.com'
const AUTH_HOST: Record<Country, string> = {
  VE: 'https://auth.mercadolibre.com.ve',
  CO: 'https://auth.mercadolibre.com.co',
}

export function mlConfigurado() {
  return !!(process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET
    && process.env.ML_REDIRECT_URI && process.env.ML_TOKEN_KEY)
}

// ── Cifrado de tokens (AES-256-GCM) ─────────────────────────────────────────
function clave() {
  const k = Buffer.from(process.env.ML_TOKEN_KEY ?? '', 'base64')
  if (k.length !== 32) throw new Error('ML_TOKEN_KEY debe ser de 32 bytes en base64')
  return k
}
export function cifrar(texto: string) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', clave(), iv)
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), datos]).toString('base64')
}
export function descifrar(guardado: string) {
  if (!guardado.startsWith('v1:')) throw new Error('Token con formato desconocido')
  const b = Buffer.from(guardado.slice(3), 'base64')
  const d = createDecipheriv('aes-256-gcm', clave(), b.subarray(0, 12))
  d.setAuthTag(b.subarray(12, 28))
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')
}

// ── OAuth ───────────────────────────────────────────────────────────────────
export function urlAutorizacion(country: Country, state: string) {
  const u = new URL('/authorization', AUTH_HOST[country])
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', process.env.ML_CLIENT_ID!)
  u.searchParams.set('redirect_uri', process.env.ML_REDIRECT_URI!)
  u.searchParams.set('state', state)
  return u.toString()
}

export interface TokenML {
  access_token: string; refresh_token: string; expires_in: number; user_id: number; scope?: string
}

async function pedirToken(params: Record<string, string>): Promise<TokenML> {
  const body = new URLSearchParams({
    client_id: process.env.ML_CLIENT_ID!, client_secret: process.env.ML_CLIENT_SECRET!, ...params,
  })
  const r = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body, cache: 'no-store',
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d.access_token) {
    const e = new Error(`ML oauth ${r.status}: ${d.error ?? ''} ${d.message ?? ''}`.trim()) as Error & { codigo?: string }
    e.codigo = d.error
    throw e
  }
  return d as TokenML
}

export const canjearCodigo = (code: string) =>
  pedirToken({ grant_type: 'authorization_code', code, redirect_uri: process.env.ML_REDIRECT_URI! })

// ── Token vigente de una conexión (renueva si hace falta, serializado) ─────
const MARGEN_MS = 5 * 60 * 1000

export class CuentaDesconectada extends Error {}

export async function tokenVigente(db: Pool, conexionId: number, forzar = false): Promise<string> {
  const { rows: [c] } = await db.query(
    `SELECT access_token_enc, expira_en, estado FROM ml_conexiones WHERE id = $1`, [conexionId])
  if (!c) throw new Error('Conexión no encontrada')
  if (c.estado !== 'activa') throw new CuentaDesconectada('La cuenta está desconectada: vuelve a conectarla')
  if (!forzar && new Date(c.expira_en).getTime() - Date.now() > MARGEN_MS) return descifrar(c.access_token_enc)

  await db.query('BEGIN')
  try {
    const { rows: [f] } = await db.query(
      `SELECT access_token_enc, refresh_token_enc, expira_en, estado FROM ml_conexiones WHERE id = $1 FOR UPDATE`,
      [conexionId])
    // Otro proceso la renovó mientras esperábamos el candado: sirve la suya.
    if (f.estado === 'activa' && new Date(f.expira_en).getTime() - Date.now() > MARGEN_MS
        && (!forzar || f.access_token_enc !== c.access_token_enc)) {
      await db.query('COMMIT')
      return descifrar(f.access_token_enc)
    }
    let t: TokenML
    try {
      t = await pedirToken({ grant_type: 'refresh_token', refresh_token: descifrar(f.refresh_token_enc) })
    } catch (e) {
      const codigo = (e as { codigo?: string }).codigo
      if (codigo === 'invalid_grant') {
        await db.query(
          `UPDATE ml_conexiones SET estado = 'desconectada', ultimo_error = $2, updated_at = NOW() WHERE id = $1`,
          [conexionId, 'ML rechazó la renovación (clave cambiada, permisos revocados o 4 meses sin uso)'])
        await db.query('COMMIT')
        throw new CuentaDesconectada('MercadoLibre desconectó la cuenta: vuelve a conectarla')
      }
      throw e
    }
    await db.query(
      `UPDATE ml_conexiones
       SET access_token_enc = $2, refresh_token_enc = $3, expira_en = NOW() + make_interval(secs => $4),
           scopes = COALESCE($5, scopes), ultimo_error = NULL, updated_at = NOW()
       WHERE id = $1`,
      [conexionId, cifrar(t.access_token), cifrar(t.refresh_token), t.expires_in, t.scope ?? null])
    await db.query('COMMIT')
    return t.access_token
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {})
    throw e
  }
}

// ── Llamadas a la API ───────────────────────────────────────────────────────
export class ErrorML extends Error {
  constructor(readonly status: number, readonly datos: unknown, mensaje: string) { super(mensaje) }
}

const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

/** GET/POST a la API con el token de la conexión. Reintenta 429/5xx y renueva ante 401. */
export async function mlFetch<T = unknown>(db: Pool, conexionId: number, ruta: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let token = await tokenVigente(db, conexionId)
  let renovado = false
  for (let intento = 0; ; intento++) {
    const r = await fetch(`${ML_API}${ruta}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/json',
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    })
    if (r.status === 401 && !renovado) { token = await tokenVigente(db, conexionId, true); renovado = true; continue }
    if ((r.status === 429 || r.status >= 500) && intento < 3) { await espera(800 * 2 ** intento); continue }
    const d = await r.json().catch(() => null)
    if (!r.ok) {
      const msg = (d as { message?: string; error?: string } | null)?.message ?? (d as { error?: string } | null)?.error ?? ''
      throw new ErrorML(r.status, d, `MercadoLibre respondió ${r.status}${msg ? `: ${msg}` : ''}`)
    }
    return d as T
  }
}

/** Datos de la cuenta recién autorizada (para guardar su nombre). */
export async function usuarioML(accessToken: string) {
  const r = await fetch(`${ML_API}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  if (!r.ok) throw new Error(`ML /users/me ${r.status}`)
  return r.json() as Promise<{ id: number; nickname: string; site_id: string }>
}
