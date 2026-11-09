// Cola de tareas para MercadoLibre (08-11-2026, mig 155).
// Todo lo que se manda a ML en cantidad (descripciones, precios, lecturas, promociones) queda en ml_pub_lotes /
// ml_pub_lote_items y lo procesa el servidor solo: no hace falta tener la pantalla abierta.
//
// Ritmo (pedido del dueño): TOPE GENERAL de POR_MINUTO publicaciones por minuto, sumando todas las empresas (todas
// usan la misma aplicación de ML), repartido en partes iguales entre las cuentas que tienen algo pendiente. Si ML
// responde 429 ("espera"), el tope baja a la mitad unos minutos y la publicación vuelve a la cola.
//
// Cuidado con las conexiones (caída 06-10): una sola conexión para el candado y una por empresa mientras se procesa
// (de a una empresa por vez). Dentro de una empresa trabajan A_LA_VEZ publicaciones en paralelo sobre la MISMA
// conexión: las consultas se encolan solas; los tokens se renuevan ANTES de arrancar (la renovación usa BEGIN).
import type { Pool } from 'pg'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { tokenVigente } from '@/lib/ml'
import { procesarItemLote } from '@/lib/lotesPublicaciones'
import { procesarItemPromocion } from '@/lib/promocionesCola'
import type { Country } from '@/lib/types'

export const POR_MINUTO = 60
const A_LA_VEZ = 8
const TIEMPO_MS = 50_000              // el cron corre cada minuto: no se toma nada nuevo pasado este tiempo
const CANDADO = 7_724_551             // pg_advisory_lock: una sola pasada a la vez (aunque haya 2 copias de la app)
let frenoHasta = 0

const tope = () => (Date.now() < frenoHasta ? Math.floor(POR_MINUTO / 2) : POR_MINUTO)

/** Lo que devuelve cada tipo de tarea por publicación. `reintentarEn` = vuelve a la cola en esos ms (p. ej. comprobar). */
export interface ResultadoTarea { estado: 'ok' | 'sin_cambio' | 'saltada' | 'error' | 'pendiente'; mensaje?: string | null;
  resultado?: Record<string, unknown> | null; reintentarEn?: number
  /** Vuelve a la cola sin contar un intento (ML pidió esperar: no llegó a hacerse). */
  sinContar?: boolean }
export interface ItemTarea { lote_id: number; item_id: string; datos: Record<string, unknown>; intentos: number }
export interface LoteTarea { tipo: string; parametros: Record<string, unknown>; user_id: number | null }

/** El cron: una pasada (si no hay otra en curso). */
export async function procesarColaML() {
  const g = await dbGlobal().connect()
  try {
    const { rows: [l] } = await g.query(`SELECT pg_try_advisory_lock($1) AS ok`, [CANDADO])
    if (!l?.ok) return { omitido: 'otra pasada en curso' }
    try { return await pasada() } finally { await g.query(`SELECT pg_advisory_unlock($1)`, [CANDADO]).catch(() => {}) }
  } finally { g.release() }
}

const SQL_TOMABLE = `l.estado = 'en_curso' AND i.estado = 'pendiente' AND (i.no_antes IS NULL OR i.no_antes <= NOW())`

async function pasada() {
  const inicio = Date.now()
  // Empresas con algo en curso (la lista de empresas es global; las tareas, por empresa con RLS).
  const { rows: empresas } = await dbGlobal().query<{ id: number; country: Country }>(
    `SELECT id, country FROM empresas WHERE is_active AND ('publicaciones' = ANY(modulos) OR 'promociones' = ANY(modulos)) ORDER BY id`)
  const grupos: { e: number; country: Country; con: number | null; n: number; cupo: number }[] = []
  for (const e of empresas) {
    const { rows } = await conEmpresa(e.id, e.country, async db => {
      // Las que quedaron "procesando" por un corte (deploy): vuelven. Las de promoción, primero a COMPROBAR (pudieron entrar).
      await db.query(
        `UPDATE ml_pub_lote_items i SET estado = 'pendiente', tomado_at = NULL,
                intentos = CASE WHEN l.tipo = 'promocion' THEN GREATEST(i.intentos, 1) ELSE i.intentos END
         FROM ml_pub_lotes l WHERE l.id = i.lote_id AND i.estado = 'procesando' AND i.tomado_at < NOW() - INTERVAL '10 minutes'`)
      return db.query<{ con: number | null; n: number }>(
        `SELECT i.conexion_id AS con, COUNT(*)::int AS n FROM ml_pub_lote_items i JOIN ml_pub_lotes l ON l.id = i.lote_id
         WHERE ${SQL_TOMABLE} GROUP BY 1`)
    })
    for (const r of rows) grupos.push({ e: e.id, country: e.country, con: r.con, n: r.n, cupo: 0 })
  }
  if (!grupos.length) return null
  // Reparto: de a 1 por cuenta, en vueltas, hasta llenar el tope (la que tiene pocas termina y las demás siguen).
  let libre = tope()
  while (libre > 0 && grupos.some(g => g.cupo < g.n)) {
    for (const g of grupos) if (libre > 0 && g.cupo < g.n) { g.cupo++; libre-- }
  }
  const r = { hechas: 0, errores: 0, frenada: false }
  for (const id of [...new Set(grupos.map(g => g.e))]) {
    if (Date.now() - inicio > TIEMPO_MS) break
    const suyos = grupos.filter(g => g.e === id)
    await conEmpresa(id, suyos[0].country, db => procesarEmpresa(db, suyos, inicio, r))
  }
  return r
}

async function procesarEmpresa(db: Pool, grupos: { con: number | null; cupo: number }[], inicio: number,
  r: { hechas: number; errores: number; frenada: boolean }) {
  // Tokens al día ANTES de trabajar en paralelo (renovar usa una transacción sobre esta conexión).
  const { rows: cons } = await db.query<{ id: number }>(`SELECT id FROM ml_conexiones WHERE estado = 'activa'`)
  for (const c of cons) await tokenVigente(db, c.id).catch(() => {})
  const lotes = new Map<number, LoteTarea>()
  const loteDe = async (id: number) => {
    if (!lotes.has(id)) {
      const { rows: [l] } = await db.query(`SELECT tipo, parametros, user_id FROM ml_pub_lotes WHERE id = $1`, [id])
      lotes.set(id, l)
    }
    return lotes.get(id)!
  }
  let turno = 0
  const tomar = async (): Promise<ItemTarea | null> => {
    while (Date.now() - inicio < TIEMPO_MS && !r.frenada) {
      const conCupo = grupos.filter(g => g.cupo > 0)
      if (!conCupo.length) return null
      const g = conCupo[turno++ % conCupo.length]
      const { rows: [it] } = await db.query(
        `UPDATE ml_pub_lote_items i SET estado = 'procesando', tomado_at = NOW()
         FROM (SELECT i2.lote_id, i2.item_id FROM ml_pub_lote_items i2 JOIN ml_pub_lotes l ON l.id = i2.lote_id
               WHERE ${SQL_TOMABLE.replace(/\bi\./g, 'i2.')} AND i2.conexion_id IS NOT DISTINCT FROM $1
               ORDER BY l.creado_at, i2.item_id LIMIT 1 FOR UPDATE OF i2 SKIP LOCKED) x
         WHERE i.lote_id = x.lote_id AND i.item_id = x.item_id
         RETURNING i.lote_id::int, i.item_id, i.datos, i.intentos`, [g.con])
      if (!it) { g.cupo = 0; continue }
      g.cupo--
      return it as ItemTarea
    }
    return null
  }
  const trabajador = async () => {
    for (let it = await tomar(); it; it = await tomar()) {
      let res: ResultadoTarea
      try {
        const l = await loteDe(it.lote_id)
        res = l.tipo === 'promocion' ? await procesarItemPromocion(db, l, it) : await procesarItemLote(db, l, it)
      } catch (e) {
        res = { estado: 'error', mensaje: e instanceof Error ? e.message : String(e) }
      }
      // ML pidió esperar: freno general y la publicación vuelve a la cola (no es un error de ella).
      if (res.estado === 'error' && /\b429\b|too many requests/i.test(res.mensaje ?? '')) {
        frenoHasta = Date.now() + 5 * 60_000; r.frenada = true
        res = { estado: 'pendiente', reintentarEn: 120_000, sinContar: true }
      }
      if (res.estado === 'pendiente') {
        await db.query(
          `UPDATE ml_pub_lote_items SET estado = 'pendiente', tomado_at = NULL, intentos = intentos + $5,
                  no_antes = NOW() + make_interval(secs => $3), resultado = COALESCE($4::jsonb, resultado)
           WHERE lote_id = $1 AND item_id = $2`,
          [it.lote_id, it.item_id, Math.round((res.reintentarEn ?? 15_000) / 1000), res.resultado ? JSON.stringify(res.resultado) : null, res.sinContar ? 0 : 1])
        continue
      }
      await db.query(
        `UPDATE ml_pub_lote_items SET estado = $3, mensaje = $4, resultado = COALESCE($5::jsonb, resultado), hecho_at = NOW()
         WHERE lote_id = $1 AND item_id = $2`,
        [it.lote_id, it.item_id, res.estado, res.mensaje ?? null, res.resultado ? JSON.stringify(res.resultado) : null])
      if (res.estado === 'error') r.errores++; else r.hechas++
    }
  }
  await Promise.all(Array.from({ length: A_LA_VEZ }, trabajador))
  await db.query(
    `UPDATE ml_pub_lotes l SET estado = 'terminado', terminado_at = NOW()
     WHERE l.estado = 'en_curso' AND NOT EXISTS (SELECT 1 FROM ml_pub_lote_items i WHERE i.lote_id = l.id AND i.estado IN ('pendiente', 'procesando'))`)
}
