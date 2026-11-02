// Cobros (02-11-2026, migración 141). El cliente ve en "Mi plan" cuánto le toca según sus ventas, paga por Pago Móvil
// (Bs a tasa BCV) o Binance (USDT), adjunta la captura y la referencia; el dueño lo confirma a mano y lo aprueba en
// Plataforma → Cobros. Nada automático: aprobar = lo mismo que registrar el plan en Plataforma → Plan y pagos.
//
// Escalón = ventas de MercadoLibre de los últimos 30 días de TODAS sus cuentas conectadas (ml_ordenes, sin canceladas),
// incluidas las que procesa por fuera del sistema; margen del 10% sobre el tope (lib/planes.ts). Con plan activo el
// escalón solo cambia si los DOS últimos períodos de 30 días quedan del mismo lado (regla de los 2 meses seguidos).
// Sin ventas → el escalón más bajo.
//
// Vencido o en prueba vencida no puede iniciar sesión: entra a /renovar con su usuario y clave y recibe un acceso
// firmado (2 h) que solo sirve para "Mi plan".
import { createHmac, timingSafeEqual } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import type { Pool, PoolClient } from 'pg'
import { compare } from 'bcryptjs'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { estadoEfectivo, type EstadoCuenta } from '@/lib/cuenta'
import { CUENTAS_INCLUIDAS, ESCALONES, MODULOS_CONTROLADOS, MODULOS_PLAN, PLANES, RADAR_PRO, montoPlan, planConRadar, sumarMeses, type Plan } from '@/lib/planes'
import { currentDate } from '@/lib/tz'
import { UPLOAD_DIR } from '@/lib/uploads'
import { chatsDuenoPlataforma } from '@/lib/registro'
import { enviarFotoTelegram, enviarTelegram, enviarTelegramId, ENTORNO, esc, telegramConfigurado, urlSistema } from '@/lib/telegram'
import type { Country } from '@/lib/types'

export const COBROS_DIR = path.join(UPLOAD_DIR, 'cobros')
export const MAX_MB_COMPROBANTE = 5
export const TIPOS_COMPROBANTE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' }
export type Metodo = 'pago_movil' | 'binance'
export const NOMBRE_METODO: Record<Metodo, string> = { pago_movil: 'Pago Móvil', binance: 'Binance' }

export interface DatosCobro {
  pago_movil: { banco: string; cedula: string; telefono: string }
  binance: { id: string; nombre: string; correo: string; moneda: string }
}
const DATOS_DEFECTO: DatosCobro = {
  pago_movil: { banco: 'Bancamiga (0172)', cedula: '16.982.769', telefono: '0414-7133665' },
  binance: { id: '213358749', nombre: 'Kr0ys', correo: 'kroyss@gmail.com', moneda: 'USDT' },
}

export async function leerDatosCobro(): Promise<DatosCobro> {
  const { rows: [r] } = await dbGlobal().query(`SELECT valor FROM plataforma_config WHERE clave = 'datos_cobro'`)
  const v = (r?.valor ?? {}) as Partial<DatosCobro>
  return { pago_movil: { ...DATOS_DEFECTO.pago_movil, ...v.pago_movil }, binance: { ...DATOS_DEFECTO.binance, ...v.binance } }
}

export async function guardarDatosCobro(d: DatosCobro) {
  await dbGlobal().query(
    `INSERT INTO plataforma_config (clave, valor, updated_at) VALUES ('datos_cobro', $1, NOW())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()`, [JSON.stringify(d)])
}

// ── Escalón por ventas ────────────────────────────────────────────────────────────────────────────────────────────
const TOPES = [50, 300, 1000]          // ESCALONES: hasta 50 · 51 a 300 · 301 a 1.000 · más
const MARGEN = 1.1                     // 10% sobre el tope antes de subir (regla interna, lib/planes.ts)

export function escalonPorVentas(ventas: number) {
  const i = TOPES.findIndex(t => ventas <= Math.floor(t * MARGEN))
  return i === -1 ? TOPES.length : i
}

/** Ventas de MercadoLibre de la organización (todas sus empresas y cuentas, sin canceladas) y sus cuentas conectadas. */
export async function ventasOrganizacion(orgId: number) {
  const { rows: empresas } = await dbGlobal().query(
    `SELECT id, country FROM empresas WHERE organizacion_id = $1 AND is_active ORDER BY id`, [orgId])
  let v30 = 0, vAnt = 0, cuentas = 0
  for (const e of empresas as { id: number; country: Country }[]) {
    const r = await conEmpresa(e.id, e.country, async db => {
      const { rows: [v] } = await db.query(
        `SELECT COUNT(*) FILTER (WHERE fecha > NOW() - INTERVAL '30 days')::int AS v30,
                COUNT(*) FILTER (WHERE fecha <= NOW() - INTERVAL '30 days')::int AS ant
         FROM ml_ordenes WHERE fecha > NOW() - INTERVAL '60 days' AND COALESCE(estado, '') <> 'cancelled'`)
      const { rows: [c] } = await db.query(`SELECT COUNT(*)::int AS n FROM ml_conexiones WHERE estado = 'activa'`)
      return { v30: v.v30 as number, ant: v.ant as number, cuentas: c.n as number }
    })
    v30 += r.v30; vAnt += r.ant; cuentas += r.cuentas
  }
  return { v30, vAnt, cuentas }
}

/** Escalón que le toca: sin plan → por los últimos 30 días; con plan, solo cambia si los dos períodos coinciden. */
export function escalonSugerido(v30: number, vAnt: number, actual: number | null) {
  const ultimo = escalonPorVentas(v30)
  if (actual == null) return ultimo
  const anterior = escalonPorVentas(vAnt)
  if (ultimo > actual && anterior > actual) return Math.min(ultimo, anterior)
  if (ultimo < actual && anterior < actual) return Math.max(ultimo, anterior)
  return actual
}

export async function tasaBCV(): Promise<number | null> {
  const { rows: [r] } = await dbGlobal().query(
    `SELECT official_rate::float AS t FROM venezuela_exchange_rates ORDER BY rate_date DESC, created_at DESC LIMIT 1`)
  return r?.t ?? null
}

// ── Situación de la cuenta ("Mi plan") ───────────────────────────────────────────────────────────────────────────
export interface CobroFila {
  id: number; plan: string; escalon: number; ciclo: string; radar_pro: boolean; monto_usd: number; metodo: Metodo
  tasa_bcv: number | null; monto_bs: number | null; referencia: string; fecha_pago: string; estado: 'revision' | 'aprobado' | 'rechazado'
  motivo: string | null; creado_at: string; revisado_at: string | null; tiene_comprobante: boolean; hasta: string | null
}
const SELECT_COBRO = `SELECT k.id, k.plan, k.escalon, k.ciclo, k.radar_pro, k.monto_usd::float, k.metodo, k.tasa_bcv::float,
  k.monto_bs::float, k.referencia, to_char(k.fecha_pago, 'YYYY-MM-DD') AS fecha_pago, k.estado, k.motivo, k.creado_at,
  k.revisado_at, k.comprobante IS NOT NULL AS tiene_comprobante, to_char(p.hasta, 'YYYY-MM-DD') AS hasta
  FROM organizacion_cobros k LEFT JOIN organizacion_pagos p ON p.id = k.pago_id`

export interface OpcionPlan { id: Plan['id']; nombre: string; resumen: string; mensual: number; trimestral: number; radar: boolean }
export interface SituacionPlan {
  organizacion: string; estado: EstadoCuenta; fundador: boolean
  plan: Plan['id'] | null; escalon: number | null; ciclo: string | null
  vence: string | null              // plan_hasta (activo) o prueba_hasta (prueba)
  radarProHasta: string | null
  ventas30: number; ventasAnt: number; cuentas: number; cuentasExtra: number
  escalonSugerido: number; escalonNombre: string
  opciones: OpcionPlan[]; planSugerido: Plan['id']
  radarPro: { precio: number; disponible: boolean; regalo: boolean }   // regalo: el 1er plan con Radar trae 1 mes PRO
  tasaBcv: number | null
  datos: DatosCobro
  ultimo: CobroFila | null; anteriores: CobroFila[]
}

export async function situacionPlan(orgId: number): Promise<SituacionPlan> {
  const { rows: [o] } = await dbGlobal().query(
    `SELECT nombre, estado, fundador, plan, escalon, ciclo, to_char(plan_hasta, 'YYYY-MM-DD') AS plan_hasta,
            to_char(prueba_hasta, 'YYYY-MM-DD') AS prueba_hasta, to_char(radar_pro_hasta, 'YYYY-MM-DD') AS radar_pro_hasta
     FROM organizaciones WHERE id = $1`, [orgId])
  if (!o) throw new Error('Organización no encontrada')
  const hoy = currentDate()
  const estado = estadoEfectivo(o.estado, o.prueba_hasta, hoy)
  const conPlan = !!o.plan && o.escalon != null
  const [{ v30, vAnt, cuentas }, tasa, datos, { rows: cobros }] = await Promise.all([
    ventasOrganizacion(orgId), tasaBCV(), leerDatosCobro(),
    dbGlobal().query(`${SELECT_COBRO} WHERE k.organizacion_id = $1 ORDER BY k.creado_at DESC LIMIT 12`, [orgId]),
  ])
  const escalon = escalonSugerido(v30, vAnt, conPlan ? Number(o.escalon) : null)
  const cuentasExtra = Math.max(0, cuentas - CUENTAS_INCLUIDAS)
  const opciones = PLANES.map(p => ({
    id: p.id, nombre: p.nombre, resumen: p.resumen, radar: planConRadar(p.id),
    mensual: montoPlan(p.id, escalon, 'mensual', !!o.fundador, cuentasExtra).total,
    trimestral: montoPlan(p.id, escalon, 'trimestral', !!o.fundador, cuentasExtra).total,
  }))
  const planSugerido = (conPlan && PLANES.some(p => p.id === o.plan) ? o.plan : 'automatizaciones') as Plan['id']
  return {
    organizacion: o.nombre, estado, fundador: !!o.fundador,
    plan: conPlan ? o.plan : null, escalon: conPlan ? Number(o.escalon) : null, ciclo: o.ciclo ?? null,
    vence: estado === 'activo' ? o.plan_hasta : o.estado === 'prueba' ? o.prueba_hasta : o.plan_hasta,
    radarProHasta: o.radar_pro_hasta,
    ventas30: v30, ventasAnt: vAnt, cuentas, cuentasExtra,
    escalonSugerido: escalon, escalonNombre: ESCALONES[escalon]?.ventas ?? '',
    opciones, planSugerido,
    // PRO pagado: se ofrece a quien ya tuvo el de regalo (radar_pro_hasta). El primer plan con Radar lo trae 1 mes gratis.
    radarPro: { precio: RADAR_PRO.precio, disponible: !!o.radar_pro_hasta, regalo: !o.radar_pro_hasta },
    tasaBcv: tasa, datos,
    ultimo: (cobros[0] as CobroFila | undefined) ?? null, anteriores: cobros.slice(1) as CobroFila[],
  }
}

/** Monto que se cobra (lo recalcula el servidor: nunca se toma el que manda la pantalla). */
export function montoCobro(s: SituacionPlan, plan: Plan['id'], ciclo: 'mensual' | 'trimestral', radarPro: boolean) {
  const op = s.opciones.find(x => x.id === plan)
  if (!op) throw new Error('Plan inválido')
  const meses = ciclo === 'trimestral' ? 3 : 1
  const pro = radarPro && op.radar && s.radarPro.disponible ? RADAR_PRO.precio * meses : 0
  const usd = (ciclo === 'trimestral' ? op.trimestral : op.mensual) + pro
  return { usd: Math.round(usd * 100) / 100, pro: pro > 0, meses }
}

// ── Reportar ─────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Reporte {
  plan: Plan['id']; ciclo: 'mensual' | 'trimestral'; radarPro: boolean; metodo: Metodo
  referencia: string; fechaPago: string
  archivo: { tipo: string; datos: Buffer } | null
}

export async function reportarCobro(orgId: number, userId: number, r: Reporte) {
  const s = await situacionPlan(orgId)
  if (s.ultimo?.estado === 'revision') throw new ErrorCobro('Ya tienes un pago en revisión: te avisamos apenas lo confirmemos.')
  const m = montoCobro(s, r.plan, r.ciclo, r.radarPro)
  const tasa = r.metodo === 'pago_movil' ? s.tasaBcv : null
  if (r.metodo === 'pago_movil' && !tasa) throw new ErrorCobro('No hay tasa BCV cargada hoy: intenta más tarde o paga por Binance.')
  const { rows: [k] } = await dbGlobal().query(
    `INSERT INTO organizacion_cobros (organizacion_id, user_id, plan, escalon, ciclo, radar_pro, cuentas_extra, ventas_30d,
                                      monto_usd, metodo, tasa_bcv, monto_bs, referencia, fecha_pago)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [orgId, userId, r.plan, s.escalonSugerido, r.ciclo, m.pro, s.cuentasExtra, s.ventas30, m.usd, r.metodo,
     tasa, tasa ? Math.round(m.usd * tasa * 100) / 100 : null, r.referencia.trim(), r.fechaPago])
  const id = Number(k.id)
  if (r.archivo) {
    await mkdir(COBROS_DIR, { recursive: true })
    const archivo = `${id}.${TIPOS_COMPROBANTE[r.archivo.tipo] ?? 'bin'}`
    await writeFile(path.join(COBROS_DIR, archivo), r.archivo.datos)
    await dbGlobal().query(`UPDATE organizacion_cobros SET comprobante = $2 WHERE id = $1`, [id, archivo])
  }
  avisarDueno(id, r.archivo).catch(e => console.error('[cobros telegram]', e instanceof Error ? e.message : e))
  return id
}

export class ErrorCobro extends Error {}

/** Otras veces que se usó la misma referencia (alerta para el dueño, no bloquea). */
const SQL_REF_REPETIDA = `(SELECT COUNT(*)::int FROM organizacion_cobros r WHERE lower(r.referencia) = lower(k.referencia)
  AND r.id <> k.id AND r.estado <> 'rechazado')`

async function avisarDueno(id: number, archivo: Reporte['archivo']) {
  if (!telegramConfigurado()) return
  const { rows: [k] } = await dbGlobal().query(
    `SELECT k.*, k.monto_usd::float AS usd, k.monto_bs::float AS bs, o.nombre AS org, COALESCE(u.full_name, u.username) AS persona,
            ${SQL_REF_REPETIDA} AS repetida
     FROM organizacion_cobros k JOIN organizaciones o ON o.id = k.organizacion_id LEFT JOIN users u ON u.id = k.user_id
     WHERE k.id = $1`, [id])
  if (!k) return
  const plan = PLANES.find(p => p.id === k.plan)?.nombre ?? k.plan
  const html = `💰 <b>Pago reportado</b>${ENTORNO === 'staging' ? ' · <i>staging</i>' : ''}\n`
    + `🏢 ${esc(k.org)} · 👤 ${esc(k.persona ?? '—')}\n`
    + `${esc(plan)} · ${k.ciclo}${k.radar_pro ? ' + Radar PRO' : ''} · <b>$${k.usd}</b>`
    + `${k.bs ? ` = Bs ${Number(k.bs).toLocaleString('de-DE', { minimumFractionDigits: 2 })}` : ''}\n`
    + `${NOMBRE_METODO[k.metodo as Metodo]} · ref. <b>${esc(k.referencia)}</b>`
    + `${k.repetida ? `\n⚠️ Esa referencia ya se reportó ${k.repetida} vez/veces` : ''}`
  for (const chat of await chatsDuenoPlataforma()) {
    try {
      const mid = await enviarTelegramId(chat, html, [[{ texto: 'Revisar en Plataforma', url: urlSistema('/plataforma?vista=cobros') }]])
      if (archivo && archivo.tipo.startsWith('image/')) await enviarFotoTelegram(chat, archivo.datos, `pago-${id}`, archivo.tipo, mid)
    } catch (e) { console.error('[cobros telegram]', e instanceof Error ? e.message : e) }
  }
}

// ── Plataforma: aprobar / rechazar ───────────────────────────────────────────────────────────────────────────────

/**
 * Registra un plan pagado (Plataforma → Plan y pagos y la aprobación de un cobro): estado activo, plan, escalón,
 * ciclo, pagado hasta, módulos del plan y créditos del escalón. El primer plan con Radar trae 1 mes de PRO de regalo.
 * Créditos de IA (mig. 140): el primer plan o el que vuelve tras vencer arranca su mes hoy; renovar uno vigente no.
 */
export async function registrarPlan(client: PoolClient, org: number, b: {
  plan: Plan['id']; escalon: number; ciclo: 'mensual' | 'trimestral'; hasta: string; monto: number; nota?: string | null
}, por: number | null) {
  const { rows: [o] } = await client.query(
    `SELECT estado, to_char(plan_hasta, 'YYYY-MM-DD') AS plan_hasta, to_char(radar_pro_hasta, 'YYYY-MM-DD') AS radar_pro_hasta
     FROM organizaciones WHERE id = $1 FOR UPDATE`, [org])
  const hoy = currentDate()
  const desde = o.plan_hasta && o.plan_hasta >= hoy ? o.plan_hasta : hoy
  const bienvenida = planConRadar(b.plan) && !o.radar_pro_hasta
  await client.query(
    `UPDATE organizaciones SET estado = 'activo', plan = $2, escalon = $3, ciclo = $4, plan_hasta = $5,
       prueba_dias = NULL, motivo_pausa = NULL, pausa_fecha = NULL,
       radar_pro_hasta = CASE WHEN $6 THEN $7::date ELSE radar_pro_hasta END,
       creditos_desde = CASE WHEN $8 THEN NOW() ELSE creditos_desde END
     WHERE id = $1`, [org, b.plan, b.escalon, b.ciclo, b.hasta, bienvenida, sumarMeses(hoy, 1),
      !(o.estado === 'activo' && o.plan_hasta && o.plan_hasta >= hoy)])
  await client.query(
    `UPDATE empresas SET
       modulos = ARRAY(SELECT DISTINCT m FROM unnest(
         ARRAY(SELECT x FROM unnest(modulos) x WHERE x <> ALL($2::text[])) || $3::text[]) m),
       ia_limite_mes = $4
     WHERE organizacion_id = $1`, [org, [...MODULOS_CONTROLADOS], [...MODULOS_PLAN[b.plan]], ESCALONES[b.escalon].creditos])
  const { rows: [p] } = await client.query(
    `INSERT INTO organizacion_pagos (organizacion_id, tipo, monto, plan, escalon, ciclo, desde, hasta, nota, por)
     VALUES ($1, 'plan', $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [org, b.monto, b.plan, b.escalon, b.ciclo, desde, b.hasta, b.nota || null, por])
  await client.query(`INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle, por) VALUES ($1, $2, $3, $4)`,
    [org, o.estado === 'activo' ? 'renovada' : 'activa', `${b.plan} hasta ${b.hasta}`, por])
  return { pagoId: Number(p.id), bienvenida }
}

export async function aprobarCobro(id: number, por: number) {
  const client = await dbGlobal().connect()
  let resultado: { org: number; userId: number | null; hasta: string; plan: string }
  try {
    await client.query('BEGIN')
    const { rows: [k] } = await client.query(
      `SELECT k.*, k.monto_usd::float AS usd, to_char(o.plan_hasta, 'YYYY-MM-DD') AS plan_hasta,
              to_char(o.radar_pro_hasta, 'YYYY-MM-DD') AS radar_pro_hasta
       FROM organizacion_cobros k JOIN organizaciones o ON o.id = k.organizacion_id WHERE k.id = $1 FOR UPDATE OF k`, [id])
    if (!k) throw new ErrorCobro('Pago no encontrado')
    if (k.estado !== 'revision') throw new ErrorCobro('Ese pago ya se revisó')
    if (k.organizacion_id === ORGANIZACION_PLATAFORMA) throw new ErrorCobro('Tu organización es la propietaria: no tiene plan')
    const hoy = currentDate()
    const meses = k.ciclo === 'trimestral' ? 3 : 1
    const hasta = sumarMeses(k.plan_hasta && k.plan_hasta >= hoy ? k.plan_hasta : hoy, meses)
    const metodo = NOMBRE_METODO[k.metodo as Metodo]
    const { pagoId } = await registrarPlan(client, k.organizacion_id, {
      plan: k.plan, escalon: k.escalon, ciclo: k.ciclo, hasta, monto: k.usd,
      nota: `${metodo} ref. ${k.referencia}${k.radar_pro ? ' (incluye Radar PRO)' : ''} · reportado en Mi plan`,
    }, por)
    if (k.radar_pro) {
      const { rows: [o] } = await client.query(`SELECT to_char(radar_pro_hasta, 'YYYY-MM-DD') AS h FROM organizaciones WHERE id = $1`, [k.organizacion_id])
      const desde = o.h && o.h >= hoy ? o.h : hoy
      const proHasta = sumarMeses(desde, meses)
      await client.query(`UPDATE organizaciones SET radar_pro_hasta = $2 WHERE id = $1`, [k.organizacion_id, proHasta])
      await client.query(
        `INSERT INTO organizacion_pagos (organizacion_id, tipo, monto, desde, hasta, nota, por) VALUES ($1, 'radar_pro', 0, $2, $3, $4, $5)`,
        [k.organizacion_id, desde, proHasta, `Incluido en el pago del plan (cobro #${id})`, por])
    }
    await client.query(`UPDATE organizacion_cobros SET estado = 'aprobado', revisado_por = $2, revisado_at = NOW(), pago_id = $3 WHERE id = $1`,
      [id, por, pagoId])
    await client.query('COMMIT')
    resultado = { org: k.organizacion_id, userId: k.user_id, hasta, plan: k.plan }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally { client.release() }
  const plan = PLANES.find(p => p.id === resultado.plan)?.nombre ?? resultado.plan
  avisarCliente(resultado.userId, `✅ <b>Pago aprobado</b>\nTu plan ${esc(plan)} está activo hasta el <b>${resultado.hasta.split('-').reverse().join('/')}</b>. ¡Gracias!`)
  return resultado
}

export async function rechazarCobro(id: number, motivo: string, por: number) {
  const { rows: [k] } = await dbGlobal().query(
    `UPDATE organizacion_cobros SET estado = 'rechazado', motivo = $2, revisado_por = $3, revisado_at = NOW()
     WHERE id = $1 AND estado = 'revision' RETURNING user_id`, [id, motivo, por])
  if (!k) throw new ErrorCobro('Ese pago ya se revisó')
  avisarCliente(k.user_id, `⚠️ <b>No pudimos confirmar tu pago</b>\n${esc(motivo)}\n\nPuedes volver a reportarlo en Mi plan.`)
}

function avisarCliente(userId: number | null, html: string) {
  if (!userId || !telegramConfigurado()) return
  dbGlobal().query(
    `SELECT chat_id::text AS chat_id FROM telegram_usuarios WHERE user_id = $1 AND chat_id IS NOT NULL AND entorno = $2`, [userId, ENTORNO])
    .then(({ rows: [t] }) => t && enviarTelegram(t.chat_id, html, [[{ texto: 'Ver Mi plan', url: urlSistema('/mi-plan') }]]))
    .catch(e => console.error('[cobros telegram]', e instanceof Error ? e.message : e))
}

/** Lo que ve Plataforma → Cobros: por revisar, los que vencen pronto y lo último revisado. */
export async function panelCobros() {
  const db = dbGlobal()
  const [{ rows: pendientes }, { rows: vencen }, { rows: recientes }, datos] = await Promise.all([
    db.query(`SELECT k.id, k.organizacion_id, o.nombre AS organizacion, COALESCE(u.full_name, u.username) AS persona, k.plan, k.escalon,
                     k.ciclo, k.radar_pro, k.cuentas_extra, k.ventas_30d, k.monto_usd::float, k.metodo, k.tasa_bcv::float, k.monto_bs::float,
                     k.referencia, to_char(k.fecha_pago, 'YYYY-MM-DD') AS fecha_pago, k.creado_at, k.comprobante IS NOT NULL AS tiene_comprobante,
                     o.estado AS org_estado, to_char(COALESCE(o.plan_hasta, o.prueba_hasta), 'YYYY-MM-DD') AS vence,
                     ${SQL_REF_REPETIDA} AS repetida
              FROM organizacion_cobros k JOIN organizaciones o ON o.id = k.organizacion_id LEFT JOIN users u ON u.id = k.user_id
              WHERE k.estado = 'revision' ORDER BY k.creado_at`),
    db.query(`SELECT o.id, o.nombre, o.estado, o.plan, to_char(COALESCE(CASE WHEN o.estado = 'activo' THEN o.plan_hasta END, o.prueba_hasta, o.plan_hasta), 'YYYY-MM-DD') AS vence,
                     (SELECT k.estado FROM organizacion_cobros k WHERE k.organizacion_id = o.id ORDER BY k.creado_at DESC LIMIT 1) AS ultimo_cobro
              FROM organizaciones o
              WHERE o.id <> $1 AND o.estado IN ('prueba', 'activo')
                AND COALESCE(CASE WHEN o.estado = 'activo' THEN o.plan_hasta END, o.prueba_hasta)
                    BETWEEN (NOW() AT TIME ZONE 'America/Caracas')::date AND (NOW() AT TIME ZONE 'America/Caracas')::date + 7
              ORDER BY 5, o.nombre`, [ORGANIZACION_PLATAFORMA]),
    db.query(`SELECT k.id, o.nombre AS organizacion, k.plan, k.monto_usd::float, k.metodo, k.referencia, k.estado, k.motivo,
                     k.revisado_at, k.comprobante IS NOT NULL AS tiene_comprobante
              FROM organizacion_cobros k JOIN organizaciones o ON o.id = k.organizacion_id
              WHERE k.estado <> 'revision' ORDER BY k.revisado_at DESC NULLS LAST LIMIT 20`),
    leerDatosCobro(),
  ])
  return { pendientes, vencen, recientes, datos }
}

// ── Comprobante ──────────────────────────────────────────────────────────────────────────────────────────────────
export async function leerComprobante(id: number) {
  const { rows: [k] } = await dbGlobal().query(`SELECT organizacion_id, comprobante FROM organizacion_cobros WHERE id = $1`, [id])
  if (!k?.comprobante || !/^\d+\.(png|jpg|webp|pdf)$/.test(k.comprobante)) return null
  try {
    const datos = await readFile(path.join(COBROS_DIR, k.comprobante))
    const ext = k.comprobante.split('.').pop() as string
    const tipo = Object.entries(TIPOS_COMPROBANTE).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream'
    return { org: Number(k.organizacion_id), datos, tipo }
  } catch { return null }
}

// ── Acceso de /renovar (cuenta vencida: sin sesión) ─────────────────────────────────────────────────────────────
const HORAS_ACCESO = 2
const firma = (s: string) => createHmac('sha256', process.env.NEXTAUTH_SECRET ?? 'sin-secreto').update(`renovar:${s}`).digest('base64url')

export function firmarAcceso(userId: number, orgId: number) {
  const cuerpo = `${userId}.${orgId}.${Date.now() + HORAS_ACCESO * 3600_000}`
  return `${cuerpo}.${firma(cuerpo)}`
}

export function verificarAcceso(token: string | null): { userId: number; orgId: number } | null {
  if (!token) return null
  const partes = token.split('.')
  if (partes.length !== 4) return null
  const cuerpo = partes.slice(0, 3).join('.')
  const a = Buffer.from(firma(cuerpo)), b = Buffer.from(partes[3])
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const [u, o, exp] = partes.slice(0, 3).map(Number)
  if (!u || !o || !(exp > Date.now())) return null
  return { userId: u, orgId: o }
}

/** Usuario y clave → la organización (no la propietaria) donde es admin. Para /renovar. */
export async function entrarParaRenovar(db: Pool, usuario: string, clave: string) {
  const { rows: [u] } = await db.query(
    `SELECT id, password_hash, is_active FROM users WHERE username = $1`, [usuario.toLowerCase().trim()])
  if (!u || !u.is_active || !(await compare(clave, u.password_hash))) return null
  const { rows: [o] } = await db.query(
    `SELECT DISTINCT e.organizacion_id AS id FROM usuario_empresas ue JOIN empresas e ON e.id = ue.empresa_id
     WHERE ue.user_id = $1 AND ue.role = 'admin' AND e.organizacion_id <> $2 ORDER BY 1 LIMIT 1`, [u.id, ORGANIZACION_PLATAFORMA])
  return o ? { userId: Number(u.id), orgId: Number(o.id) } : { userId: Number(u.id), orgId: null }
}
