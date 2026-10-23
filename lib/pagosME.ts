// Pagos MercadoEnvíos (migración 076, módulo `pagos_me`; para clientes desde la 093).
//
// El vigilante (extensión de Chrome en la PC del antiguo Reportador, un perfil por cuenta) trae del
// portal de MercadoEnvíos las órdenes pagadas de los últimos 7 días: datos del pago, comprobante y
// guía. Aquí se guardan (me_pagos), se verifican por lote y, al registrar la venta, su guía entra
// sola al lote pendiente de Despachos. Despachos no imprime una guía con el pago sin verificar
// salvo "Despachar igual" (despacho_etiquetas.pago_forzado_*).
//
// Dos modos, según cómo trabaja la empresa (igual que Despachos, `ventasDesdeML`):
//  - con ventas CARGADAS (SolucionesMC): la guía entra a Despachos al registrar la venta en Ventas;
//  - con las ventas de MercadoLibre (sin inventario, Fundadores): la guía entra a Despachos apenas llega.
import { SQL_RETIRO_EN_TIENDA } from '@/lib/pagosMEComun'
import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import type { Pool } from 'pg'
import { dbEmpresa, dbGlobal } from '@/lib/db'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { tieneModulo, ventasDesdeML } from '@/lib/modulos'
import { leerEtiquetas, sha256 } from '@/lib/despachos'
import { currentYearMonth } from '@/lib/tz'
export type { PagoME } from '@/lib/pagosMEComun'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'
const DIR = path.join(UPLOAD_DIR, 'pagos-me')
export const MAX_ARCHIVO = 5 * 1024 * 1024
/** Un pedido de "Traer pagos y guías" vale por este tiempo: después los perfiles lo ignoran. */
export const PEDIDO_VIGENTE_MIN = 30
/** En pantalla, una traída se muestra "trayendo" a lo sumo esto (una normal tarda 1–2 min): pasado
 *  este tiempo, la cuenta que no respondió se muestra como "no respondió: revisa la PC". */
export const TRAIDA_EN_CURSO_MIN = 5
/** Sin latido en estos minutos, el perfil se muestra como desconectado. */
export const LATIDO_MIN = 3


export const SELECT_PAGOS = `
  SELECT p.id, p.venta, p.cuenta, p.estado_me, p.fecha_orden, p.total_orden::float, p.total_orden_usd::float,
         p.metodo_pago, p.banco_emisor, p.banco_receptor, p.referencia, p.fecha_pago, p.monto_pagado::float,
         p.envio_metodo, p.envio_opcion, p.carrier, p.guia,
         (p.comprobante_path IS NOT NULL) AS tiene_comprobante, (p.guia_path IS NOT NULL) AS tiene_guia,
         p.verificacion, u.username AS verificado_por, p.verificado_at, p.nota,
         s.id AS sale_id, s.status AS sale_status, s.total_amount::float AS sale_total,
         EXISTS (SELECT 1 FROM despacho_etiquetas e WHERE e.venta = p.venta) AS en_despachos,
         EXISTS (SELECT 1 FROM despacho_etiquetas e WHERE e.venta = p.venta AND e.impresa) AS guia_impresa,
         (SELECT e.apartado FROM despacho_etiquetas e WHERE e.venta = p.venta AND e.apartado IS NOT NULL LIMIT 1) AS apartado,
         (SELECT u.estado FROM ((SELECT o.estado FROM ml_ordenes o WHERE o.id = v.num LIMIT 1)
           UNION ALL (SELECT o.estado FROM ml_ordenes o WHERE o.pack_id = v.num LIMIT 1)) u LIMIT 1) AS ml_estado
  FROM me_pagos p
  CROSS JOIN LATERAL (SELECT CASE WHEN p.venta ~ '^[0-9]{1,18}$' THEN p.venta::bigint END AS num) v
  LEFT JOIN users u ON u.id = p.verificado_por
  LEFT JOIN LATERAL (SELECT id, status, total_amount FROM sales WHERE ml_order_number = p.venta ORDER BY id DESC LIMIT 1) s ON TRUE`

/** Sesión con el módulo prendido (y Venezuela: MercadoEnvíos es de MLV). */
export async function sesionPagosME() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: unauthorized() } as const
  if (session.user.country !== 'VE' || !tieneModulo(session.user, 'pagos_me')) return { error: forbidden() } as const
  return { session, db, userId: parseInt(session.user.id, 10), desdeML: ventasDesdeML(session.user) } as const
}

// ── Clave del vigilante ─────────────────────────────────────────────────────
export const hashClave = (t: string) => createHash('sha256').update(t).digest('hex')
export const nuevaClave = () => `me_${randomBytes(24).toString('hex')}`

// ── Código de conexión (migración 093): corto, para escribirlo a mano; vale 60 min ──
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'   // sin 0/O, 1/I/L: no se confunden al copiar
export const CODIGO_VIGENTE_MIN = 60
export function nuevoCodigo() {
  const b = randomBytes(8)
  const c = [...b].map(x => LETRAS[x % LETRAS.length]).join('')
  return `${c.slice(0, 4)}-${c.slice(4)}`
}
/** Como lo escriba la persona (minúsculas, sin guion, con espacios) → la forma guardada. */
export const normalizarCodigo = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '')
export const hashCodigo = (c: string) => hashClave(`codigo:${normalizarCodigo(c)}`)

/** El vigilante se autentica con `Authorization: Bearer me_…` y dice su perfil (`x-perfil`). */
export async function autenticarVigilante(req: NextRequest):
  Promise<{ db: Pool; perfil: string; desdeML: boolean; modulos: string[] } | { error: NextResponse }> {
  // `x-vigilante-clave` además de Bearer: en staging el Authorization lo usa la clave de nginx.
  const clave = (req.headers.get('x-vigilante-clave') ?? (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')).trim()
  if (!/^me_[0-9a-f]{48}$/.test(clave)) return { error: NextResponse.json({ error: 'Clave del vigilante inválida' }, { status: 401 }) }
  const perfil = (req.headers.get('x-perfil') ?? '').trim().slice(0, 40)
  if (!perfil) return { error: NextResponse.json({ error: 'Falta el nombre del perfil' }, { status: 400 }) }
  // La clave no dice la empresa: función SECURITY DEFINER (migración 076), como el Reportador.
  const { rows: [emp] } = await dbGlobal().query(
    `SELECT empresa_id, country, modulos FROM me_vigilante_empresa($1)`, [hashClave(clave)])
  if (!emp || !emp.modulos?.includes('pagos_me')) {
    return { error: NextResponse.json({ error: 'Clave revocada o módulo apagado' }, { status: 401 }) }
  }
  return { db: dbEmpresa(emp.empresa_id, emp.country), perfil, desdeML: ventasDesdeML({ modulos: emp.modulos }), modulos: emp.modulos ?? [] }
}

// ── Archivos ────────────────────────────────────────────────────────────────
export async function guardarArchivoME(data: Buffer, ext: string) {
  const sub = path.join(DIR, currentYearMonth('America/Caracas'))
  await mkdir(sub, { recursive: true })
  const p = path.join(sub, `${randomBytes(12).toString('hex')}.${ext}`)
  await writeFile(p, data)
  return p
}
export const leerArchivoME = (p: string) => readFile(p)

// ── Venta registrada → pago verificado + guía a Despachos ───────────────────
/**
 * Conecta el pago de MercadoEnvíos con la venta del sistema (se llama al guardar la venta y al
 * verificar el pago):
 *  - si el pago está VÁLIDO y la venta está en BORRADOR → pasa a PAGO_VERIFICADO (como el botón);
 *  - si la venta ya está registrada y la guía no está en Despachos → entra al lote pendiente
 *    (aunque el pago siga sin verificar: Despachos la marca "Pago sin verificar" y no la imprime).
 * Con las ventas de MercadoLibre (`desdeML`) no hay venta que registrar: la guía entra directo.
 */
export async function conectarVenta(db: Pool, venta: string, userId: number | null, desdeML = false) {
  const { rows: [p] } = await db.query(
    `SELECT id, verificacion, guia_path, ${SQL_RETIRO_EN_TIENDA} AS retiro FROM me_pagos WHERE venta = $1`, [venta])
  if (!p) return { pago: false }
  if (desdeML) {
    const guia = p.retiro ? 'retiro' as const : p.guia_path ? await guiaALote(db, venta, p.guia_path, userId) : 'sin_guia' as const
    return { pago: true, venta: true, verificada: false, guia }
  }
  if (userId == null) return { pago: true, venta: false }
  const { rows: [s] } = await db.query(
    `SELECT id, status FROM sales WHERE ml_order_number = $1 ORDER BY id DESC LIMIT 1`, [venta])
  if (!s) return { pago: true, venta: false }
  let verificada = false
  if (p.verificacion === 'valido' && s.status === 'BORRADOR') {
    const { rowCount } = await db.query(
      `UPDATE sales SET status = 'PAGO_VERIFICADO', payment_verified_by = $1, payment_verified_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND status = 'BORRADOR'`, [userId, s.id])
    verificada = !!rowCount
  }
  let guia: 'agregada' | 'ya_estaba' | 'sin_guia' | 'retiro' = 'sin_guia'
  // Retiro en tienda: su PDF es el comprobante de retiro, no una guía: no va a Despachos.
  if (p.retiro) guia = 'retiro'
  else if (p.guia_path) guia = await guiaALote(db, venta, p.guia_path, userId)
  return { pago: true, venta: true, verificada, guia }
}

/** La guía entra al lote PENDIENTE más reciente (o a uno nuevo), salvo que la venta ya esté en Despachos. */
async function guiaALote(db: Pool, venta: string, guiaPath: string, userId: number | null) {
  const { rows: [ya] } = await db.query(`SELECT 1 FROM despacho_etiquetas WHERE venta = $1 LIMIT 1`, [venta])
  if (ya) return 'ya_estaba' as const
  const data = await readFile(guiaPath)
  // TEALCA solo trae la venta en el nombre del archivo (guide-2000….pdf).
  const nombre = `guide-${venta}.pdf`
  const [e] = await leerEtiquetas([data], [nombre])
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const { rows: [l] } = await client.query(
      `SELECT id FROM despacho_lotes WHERE status = 'PENDIENTE' ORDER BY id DESC LIMIT 1 FOR UPDATE`)
    const loteId = l?.id ?? (await client.query(
      `INSERT INTO despacho_lotes (created_by) VALUES ($1) RETURNING id`, [userId])).rows[0].id
    await client.query(
      `INSERT INTO despacho_etiquetas
         (lote_id, original_name, file_path, sha256, page_count, venta, guia,
          remitente, remitente_limpio, destinatario, read_error, carrier,
          fac_documento, fac_telefono, fac_ciudad, fac_direccion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [loteId, nombre, guiaPath, sha256(data), e.paginas ?? null, e.venta ?? venta, e.guia ?? null,
       e.remitente ?? null, e.remitente_limpio ?? null, e.destinatario_limpio ?? null, e.error,
       e.carrier ?? 'ZOOM', e.fac_documento ?? null, e.fac_telefono ?? null, e.fac_ciudad ?? null,
       e.fac_direccion ?? null])
    await client.query('COMMIT')
    return 'agregada' as const
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// ── ¿De qué cuenta de MercadoLibre es este perfil? (migración 096) ──────────
export type VerificacionCuenta = {
  estado: 'ok' | 'distinta' | 'sin_datos'
  nickname: string | null           // la cuenta de ML conectada en el sistema (PIKEKE…)
  cuenta: string | null             // el nombre que da el portal de MercadoEnvíos
  coincidencias: number
  revisadas: number
}

/**
 * Cruza las ventas que el perfil ve en el portal de MercadoEnvíos con las ventas de ML de las cuentas
 * conectadas en la empresa. Si coinciden, el perfil queda unido a esa cuenta; si ninguna coincide (y hay
 * con qué comparar), es OTRA cuenta de MercadoEnvíos: no se guarda nada de ella. Sin ventas propias
 * recientes en el sistema (cuenta recién conectada) no se puede saber: no se bloquea.
 */
export async function verificarCuenta(db: Pool, perfil: string, cuentaPortal: string | null, ventas: string[]): Promise<VerificacionCuenta> {
  const nums = [...new Set(ventas.filter(v => /^\d{1,18}$/.test(v)))].slice(0, 500)
  let estado: VerificacionCuenta['estado'] = 'sin_datos', nickname: string | null = null, conexion: number | null = null, coincidencias = 0
  if (nums.length) {
    const { rows } = await db.query(
      `SELECT o.conexion_id, x.nickname, COUNT(DISTINCT v.n)::int AS n
       FROM unnest($1::bigint[]) AS v(n)
       JOIN LATERAL (SELECT * FROM ((SELECT conexion_id FROM ml_ordenes WHERE id = v.n LIMIT 1)
         UNION ALL (SELECT conexion_id FROM ml_ordenes WHERE pack_id = v.n LIMIT 1)) u LIMIT 1) o ON TRUE
       JOIN ml_conexiones x ON x.id = o.conexion_id
       GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 1`, [nums])
    if (rows[0]) {
      estado = 'ok'; nickname = rows[0].nickname; conexion = rows[0].conexion_id; coincidencias = rows[0].n
    } else if (nums.length >= 3) {
      // Solo si la empresa tiene ventas sincronizadas recientes: si no, no hay con qué comparar.
      const { rows: [h] } = await db.query(`SELECT EXISTS (SELECT 1 FROM ml_ordenes WHERE fecha > NOW() - INTERVAL '10 days') AS hay`)
      if (h.hay) estado = 'distinta'
    }
  }
  await db.query(
    `INSERT INTO me_latidos (perfil, cuenta, conexion_id, verificacion, verificado_at, visto_at) VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (empresa_id, perfil) DO UPDATE SET cuenta = COALESCE(EXCLUDED.cuenta, me_latidos.cuenta),
       conexion_id = EXCLUDED.conexion_id, verificacion = EXCLUDED.verificacion, verificado_at = NOW()`,
    [perfil, cuentaPortal, conexion, estado])
  return { estado, nickname, cuenta: cuentaPortal, coincidencias, revisadas: nums.length }
}
