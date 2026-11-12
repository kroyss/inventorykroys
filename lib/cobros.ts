// Cobros (02-11-2026, migración 141). El cliente ve en "Mi plan" cuánto le toca según sus ventas, paga por Pago Móvil
// (Bs a tasa BCV) o Binance (USDT), adjunta la captura y la referencia; el dueño lo confirma a mano y lo aprueba en
// Plataforma → Cobros. Nada automático: aprobar = lo mismo que registrar el plan en Plataforma → Plan y pagos.
//
// Escalón = ventas de MercadoLibre del último MES CALENDARIO cerrado (del 1 al último día, igual para todos sin importar
// cuándo se afilió) de TODAS sus cuentas conectadas (ml_ordenes, sin canceladas), incluidas las que procesa por fuera
// del sistema; margen del 10% sobre el tope (lib/planes.ts). Al conectar ML se traen 90 días de ventas, así que una
// cuenta recién llegada ya tiene sus meses anteriores. Con plan activo el escalón solo cambia si los DOS últimos meses
// cerrados quedan del mismo lado (regla de los 2 meses seguidos). Sin ventas → el escalón más bajo. Para pagar tiene
// que haber conectado al menos una cuenta de ML (03-11, el dueño).
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
import { CUENTAS_INCLUIDAS, CUENTA_EXTRA, DESCUENTO_FUNDADOR, DESCUENTO_TRIMESTRAL, ESCALONES, MODULOS_CONTROLADOS, MODULOS_PLAN, PLANES, PLANES_PROXIMAMENTE, RADAR_PRO, RECARGAS_IA, montoPlan, planConRadar, precioRadarMes, sumarMeses, type Plan } from '@/lib/planes'
import { soloRadar } from '@/lib/modulos'
import { currentDate } from '@/lib/tz'
import { UPLOAD_DIR } from '@/lib/uploads'
import { chatsDuenoPlataforma } from '@/lib/registro'
import { enviarFotoTelegram, enviarTelegram, enviarTelegramId, ENTORNO, esc, telegramConfigurado, urlSistema } from '@/lib/telegram'
import type { Country } from '@/lib/types'
import { cupoIA } from '@/lib/ia'

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
  let vMes = 0, vAnt = 0, cuentas = 0, conectadas = 0
  // Meses en la hora del país de cada empresa (conEmpresa fija la TimeZone): el mes pasado y el anterior.
  for (const e of empresas as { id: number; country: Country }[]) {
    const r = await conEmpresa(e.id, e.country, async db => {
      const { rows: [v] } = await db.query(
        `SELECT COUNT(*) FILTER (WHERE fecha >= date_trunc('month', NOW()) - INTERVAL '1 month')::int AS mes,
                COUNT(*) FILTER (WHERE fecha <  date_trunc('month', NOW()) - INTERVAL '1 month')::int AS ant
         FROM ml_ordenes
         WHERE fecha >= date_trunc('month', NOW()) - INTERVAL '2 months' AND fecha < date_trunc('month', NOW())
           AND COALESCE(estado, '') <> 'cancelled'`)
      const { rows: [c] } = await db.query(
        `SELECT COUNT(*) FILTER (WHERE estado = 'activa')::int AS n, COUNT(*)::int AS total FROM ml_conexiones`)
      return { mes: v.mes as number, ant: v.ant as number, cuentas: c.n as number, total: c.total as number }
    })
    vMes += r.mes; vAnt += r.ant; cuentas += r.cuentas; conectadas += r.total
  }
  return { vMes, vAnt, cuentas, conectadas }
}

/** Escalón que le toca: sin plan → por el último mes cerrado; con plan, solo cambia si los dos últimos meses coinciden. */
export function escalonSugerido(vMes: number, vAnt: number, actual: number | null) {
  const ultimo = escalonPorVentas(vMes)
  if (actual == null) return ultimo
  const anterior = escalonPorVentas(vAnt)
  if (ultimo > actual && anterior > actual) return Math.min(ultimo, anterior)
  if (ultimo < actual && anterior < actual) return Math.max(ultimo, anterior)
  return actual
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** Nombre del último mes cerrado (hora de Caracas), el de las ventas que deciden el escalón. */
function mesPasado() {
  const m = Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Caracas', month: 'numeric' }).format(new Date()))
  return MESES[(m + 10) % 12]
}

export async function tasaBCV(): Promise<number | null> {
  const { rows: [r] } = await dbGlobal().query(
    `SELECT official_rate::float AS t FROM venezuela_exchange_rates ORDER BY rate_date DESC, created_at DESC LIMIT 1`)
  return r?.t ?? null
}

// ── Desglose (06-11, mig. 143) ───────────────────────────────────────────────────────────────────────────────────
// Qué se paga: plan (elegir/renovar), Radar PRO (1 mes aparte, como una recarga) o mejora de plan a mitad de período.
// El desglose (líneas con su monto y las fechas que cubre) se guarda en organizacion_cobros.detalle para que el dueño
// vea en Plataforma → Cobros qué contrató cada cliente; los cobros viejos (sin detalle) se reconstruyen de sus columnas.
export type TipoCobro = 'plan' | 'radar_pro' | 'upgrade' | 'recarga' | 'radar_mes'
export interface Linea { texto: string; usd: number }
export interface Detalle { lineas: Linea[]; desde: string | null; hasta: string | null; /** recarga (mig. 157): créditos del paquete. */ creditos?: number }

const r2 = (n: number) => Math.round(n * 100) / 100
const fmt = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })}`
const nombrePlan = (p: string) => PLANES.find(x => x.id === p)?.nombre ?? p
const ddmm = (f: string) => f.split('-').reverse().join('/')
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const descuentoDe = (fundador: boolean, ciclo: string | null) =>
  Math.max(fundador ? DESCUENTO_FUNDADOR : 0, ciclo === 'trimestral' ? DESCUENTO_TRIMESTRAL : 0)
const nombreDescuento = (fundador: boolean, d: number) => `Descuento ${fundador && d === DESCUENTO_FUNDADOR ? 'Fundador' : 'trimestral'} −${d}%`

/** Líneas de un pago de plan: el plan por meses, el descuento (solo el plan), cuentas extra y Radar PRO (cobros viejos). */
export function desglosePlan(plan: string, escalon: number, ciclo: 'mensual' | 'trimestral', fundador: boolean, cuentasExtra: number, radarUsd = 0): Linea[] {
  const m = montoPlan(plan as Plan['id'], escalon, ciclo, fundador, cuentasExtra)
  const meses = `${m.meses} ${m.meses === 1 ? 'mes' : 'meses'}`
  const l: Linea[] = [{ texto: `${nombrePlan(plan)} · escalón ${ESCALONES[escalon]?.ventas ?? escalon} ventas · ${fmt(m.base)}/mes × ${meses}`, usd: m.base * m.meses }]
  if (m.descuento) l.push({ texto: `${nombreDescuento(fundador, m.descuento)} (solo el plan)`, usd: -r2(m.base * m.meses * m.descuento / 100) })
  if (m.extras) l.push({ texto: `${cuentasExtra} cuenta(s) de ML extra · ${fmt(CUENTA_EXTRA)} × ${meses}`, usd: m.extras * m.meses })
  if (radarUsd > 0) l.push({ texto: `Radar PRO · ${Math.round(radarUsd / RADAR_PRO.precio)} mes(es) × ${fmt(RADAR_PRO.precio)} (sin descuento)`, usd: r2(radarUsd) })
  return l
}

export interface Mejora { plan: Plan['id']; nombre: string; monto: number; dias: number; lineas: Linea[] }

/** Pasar a un plan más caro a mitad de período: diferencia por mes × días que quedan / 30, con el descuento del plan. */
export function calcularMejora(actual: string, nuevo: Plan['id'], escalon: number, ciclo: string | null, fundador: boolean, hoy: string, hasta: string): Mejora | null {
  const precios = ESCALONES[escalon]?.precios
  if (!precios) return null
  const pa = precios[actual as Plan['id']] ?? 0, pn = precios[nuevo]
  const dias = diasEntre(hoy, hasta)
  if (!(pn > pa) || dias < 1) return null
  const dif = pn - pa
  const d = descuentoDe(fundador, ciclo)
  const mes = r2(dif * (100 - d) / 100)
  const monto = Math.max(0.01, r2(mes * dias / 30))
  const lineas: Linea[] = [{ texto: `Diferencia ${nombrePlan(actual)} → ${nombrePlan(nuevo)}: ${fmt(pn)} − ${fmt(pa)} = ${fmt(dif)}/mes`, usd: dif }]
  if (d) lineas.push({ texto: nombreDescuento(fundador, d), usd: r2(mes - dif) })
  lineas.push({ texto: `Solo los ${dias} días que le quedan al plan (hasta el ${ddmm(hasta)}) de 30`, usd: r2(monto - mes) })
  return { plan: nuevo, nombre: nombrePlan(nuevo), monto, dias, lineas }
}

// ── Situación de la cuenta ("Mi plan") ───────────────────────────────────────────────────────────────────────────
export interface CobroFila {
  id: number; plan: string; escalon: number; ciclo: string; radar_pro: boolean; monto_usd: number; metodo: Metodo
  tasa_bcv: number | null; monto_bs: number | null; referencia: string; fecha_pago: string; estado: 'revision' | 'aprobado' | 'rechazado'
  motivo: string | null; creado_at: string; revisado_at: string | null; tiene_comprobante: boolean; hasta: string | null; tipo: TipoCobro
}
const SELECT_COBRO = `SELECT k.id, k.tipo, k.plan, k.escalon, k.ciclo, k.radar_pro, k.monto_usd::float, k.metodo, k.tasa_bcv::float,
  k.monto_bs::float, k.referencia, to_char(k.fecha_pago, 'YYYY-MM-DD') AS fecha_pago, k.estado, k.motivo, k.creado_at,
  k.revisado_at, k.comprobante IS NOT NULL AS tiene_comprobante, COALESCE(k.detalle->>'hasta', to_char(p.hasta, 'YYYY-MM-DD')) AS hasta
  FROM organizacion_cobros k LEFT JOIN organizacion_pagos p ON p.id = k.pago_id`

export interface OpcionPlan {
  id: Plan['id']; nombre: string; resumen: string; mensual: number; trimestral: number; radar: boolean
  /** 12-11: para el resumen tipo factura de Mi plan: precio de lista por mes, cuentas extra por mes y el descuento de cada ciclo. */
  base: number; extrasMes: number; desc: { mensual: number; trimestral: number }
}
export interface SituacionPlan {
  organizacion: string; estado: EstadoCuenta; fundador: boolean
  plan: Plan['id'] | null; escalon: number | null; ciclo: string | null
  vence: string | null              // plan_hasta (activo) o prueba_hasta (prueba)
  radarProHasta: string | null
  ventasMes: number; ventasMesAnt: number; mes: string; cuentas: number; conectadas: number; cuentasExtra: number
  escalonSugerido: number; escalonNombre: string
  /** Créditos de IA que le quedan (saldo de su empresa principal); null = sin límite o no se pudo leer. */
  saldoIA: number | null
  /** Créditos de IA que suma el PRIMER plan (escalón sugerido); 0 si ya los recibió (mig. 156: una sola vez). */
  creditosPrimerPlan: number
  opciones: OpcionPlan[]; planSugerido: Plan['id']
  radarPro: { precio: number; regalo: boolean }   // regalo: el 1er plan con Radar trae 1 mes PRO (una sola vez en la vida)
  /** Radar PRO aparte (06-11): 1 mes cuando quiera, con plan activo que traiga Radar. null = no se puede ahora. */
  radarProCompra: { precio: number; desde: string; hasta: string } | null
  /** Planes más caros a los que puede pasar ahora pagando la diferencia (plan activo). */
  mejoras: Mejora[]
  /** 09-11 (mig. 159): la organización tiene SOLO el Radar (se registró en el Radar): Mi plan ofrece el Radar mensual. */
  soloRadar: boolean
  /** Radar mensual: hasta cuándo lo tiene y lo que costaría 1 mes pagado hoy (a continuación del vigente). */
  radarMes: { hasta: string | null; precio: number; lista: number; promo: string | null; desde: string; nuevoHasta: string }
  /** Desde qué día cuenta un plan pagado hoy (fin del plan vigente, de la prueba o hoy). */
  inicioPlan: string
  tasaBcv: number | null
  datos: DatosCobro
  ultimo: CobroFila | null; anteriores: CobroFila[]
}

export async function situacionPlan(orgId: number): Promise<SituacionPlan> {
  const { rows: [o] } = await dbGlobal().query(
    `SELECT nombre, estado, fundador, plan, escalon, ciclo, to_char(plan_hasta, 'YYYY-MM-DD') AS plan_hasta,
            to_char(prueba_hasta, 'YYYY-MM-DD') AS prueba_hasta, to_char(radar_pro_hasta, 'YYYY-MM-DD') AS radar_pro_hasta,
            to_char(radar_mes_hasta, 'YYYY-MM-DD') AS radar_mes_hasta,
            (SELECT bool_and(modulos <@ ARRAY['radar', 'radar_dia']::text[] AND cardinality(modulos) > 0) FROM empresas WHERE organizacion_id = organizaciones.id) AS solo_radar
     FROM organizaciones WHERE id = $1`, [orgId])
  if (!o) throw new Error('Organización no encontrada')
  const hoy = currentDate()
  const estado = estadoEfectivo(o.estado, o.prueba_hasta, hoy)
  const conPlan = !!o.plan && o.escalon != null
  const [{ vMes, vAnt, cuentas, conectadas }, tasa, datos, { rows: cobros }] = await Promise.all([
    ventasOrganizacion(orgId), tasaBCV(), leerDatosCobro(),
    dbGlobal().query(`${SELECT_COBRO} WHERE k.organizacion_id = $1 ORDER BY k.creado_at DESC LIMIT 12`, [orgId]),
  ])
  const { rows: [emp] } = await dbGlobal().query(`SELECT id, country FROM empresas WHERE organizacion_id = $1 ORDER BY id LIMIT 1`, [orgId])
  const saldoIA = emp ? await conEmpresa(emp.id, emp.country as Country, db => cupoIA(db, emp.id)).then(c => c.quedan).catch(() => null) : null
  const { rows: [yaPlan] } = await dbGlobal().query(
    `SELECT 1 FROM ia_creditos c JOIN empresas e ON e.id = c.empresa_id WHERE e.organizacion_id = $1 AND c.motivo = 'plan' LIMIT 1`, [orgId])
  const escalon = escalonSugerido(vMes, vAnt, conPlan ? Number(o.escalon) : null)
  const cuentasExtra = Math.max(0, cuentas - CUENTAS_INCLUIDAS)
  const opciones = PLANES.map(p => ({
    id: p.id, nombre: p.nombre, resumen: p.resumen, radar: planConRadar(p.id),
    mensual: montoPlan(p.id, escalon, 'mensual', !!o.fundador, cuentasExtra).total,
    trimestral: montoPlan(p.id, escalon, 'trimestral', !!o.fundador, cuentasExtra).total,
    base: montoPlan(p.id, escalon, 'mensual', false, cuentasExtra).base,
    extrasMes: montoPlan(p.id, escalon, 'mensual', false, cuentasExtra).extras,
    desc: { mensual: montoPlan(p.id, escalon, 'mensual', !!o.fundador).descuento, trimestral: montoPlan(p.id, escalon, 'trimestral', !!o.fundador).descuento },
  }))
  const planSugerido = (conPlan && PLANES.some(p => p.id === o.plan) && !PLANES_PROXIMAMENTE.includes(o.plan) ? o.plan : 'automatizaciones') as Plan['id']
  const activo = estado === 'activo' && conPlan && !!o.plan_hasta && o.plan_hasta >= hoy
  const proDesde = o.radar_pro_hasta && o.radar_pro_hasta >= hoy ? o.radar_pro_hasta : hoy
  const inicioPlan = [o.plan_hasta, o.estado === 'prueba' ? o.prueba_hasta : null, hoy]
    .filter((f): f is string => !!f && f >= hoy).sort().pop()!
  return {
    organizacion: o.nombre, estado, fundador: !!o.fundador,
    plan: conPlan ? o.plan : null, escalon: conPlan ? Number(o.escalon) : null, ciclo: o.ciclo ?? null,
    vence: estado === 'activo' ? o.plan_hasta : o.estado === 'prueba' ? o.prueba_hasta : o.plan_hasta,
    radarProHasta: o.radar_pro_hasta,
    ventasMes: vMes, ventasMesAnt: vAnt, mes: mesPasado(), cuentas, conectadas, cuentasExtra,
    escalonSugerido: escalon, escalonNombre: ESCALONES[escalon]?.ventas ?? '', saldoIA, creditosPrimerPlan: yaPlan ? 0 : ESCALONES[escalon]?.creditos ?? 0,
    opciones, planSugerido,
    // 04-11 (el dueño): el mes de regalo es UNA vez, en el primer plan con Radar (radar_pro_hasta vacío = nunca lo tuvo).
    // Suspender y volver, o renovar, ya no lo trae: se paga aparte a precio completo (sin descuento de Fundador ni
    // trimestral) y siempre se ofrece al elegir o renovar el plan.
    radarPro: { precio: RADAR_PRO.precio, regalo: !o.radar_pro_hasta },
    radarProCompra: activo && planConRadar(o.plan) ? { precio: RADAR_PRO.precio, desde: proDesde, hasta: sumarMeses(proDesde, 1) } : null,
    mejoras: activo ? PLANES.filter(p => !PLANES_PROXIMAMENTE.includes(p.id)).map(p => calcularMejora(o.plan, p.id, Number(o.escalon), o.ciclo, !!o.fundador, hoy, o.plan_hasta))
      .filter((m): m is Mejora => !!m) : [],
    inicioPlan,
    soloRadar: !!o.solo_radar,
    radarMes: radarMesDe(o.radar_mes_hasta, hoy),
    tasaBcv: tasa, datos,
    ultimo: (cobros[0] as CobroFila | undefined) ?? null, anteriores: cobros.slice(1) as CobroFila[],
  }
}

/** Radar mensual (mig. 159): 1 mes a continuación del vigente (o desde hoy), al precio de hoy. */
function radarMesDe(hasta: string | null, hoy: string) {
  const desde = hasta && hasta >= hoy ? hasta : hoy
  const p = precioRadarMes(hoy)
  return { hasta: hasta && hasta >= hoy ? hasta : null, precio: p.precio, lista: p.lista, promo: p.promo?.texto ?? null, desde, nuevoHasta: sumarMeses(desde, 1) }
}

/** Monto que se cobra (lo recalcula el servidor: nunca se toma el que manda la pantalla). */
export function montoCobro(s: SituacionPlan, plan: Plan['id'], ciclo: 'mensual' | 'trimestral', radarPro: boolean) {
  const op = s.opciones.find(x => x.id === plan)
  if (!op) throw new Error('Plan inválido')
  const meses = ciclo === 'trimestral' ? 3 : 1
  const pro = radarPro && op.radar ? RADAR_PRO.precio * mesesRadarPro(s.radarPro.regalo, meses) : 0
  const usd = (ciclo === 'trimestral' ? op.trimestral : op.mensual) + pro
  return { usd: Math.round(usd * 100) / 100, pro: pro > 0, meses }
}

/** Meses de Radar PRO que se pagan: con el mes de regalo (primer plan) solo los que siguen (trimestral: 2). */
export function mesesRadarPro(regalo: boolean, meses: number) {
  return regalo ? meses - 1 : meses
}

// ── Reportar ─────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Reporte {
  tipo: TipoCobro; plan: Plan['id']; ciclo: 'mensual' | 'trimestral'; metodo: Metodo
  /** recarga: el paquete (índice en RECARGAS_IA). */
  paquete?: number
  /** plan (12-11, el dueño): Radar PRO los meses que no cubre el regalo (1er mes gratis, los demás se pagan). */
  radarPro?: boolean
  referencia: string; fechaPago: string
  archivo: { tipo: string; datos: Buffer } | null
}

export async function reportarCobro(orgId: number, userId: number, r: Reporte) {
  const s = await situacionPlan(orgId)
  if (s.ultimo?.estado === 'revision') throw new ErrorCobro('Ya tienes un pago en revisión: te avisamos apenas lo confirmemos.')
  if (!s.conectadas && r.tipo !== 'radar_mes') throw new ErrorCobro('Primero conecta tu cuenta de MercadoLibre: el plan se calcula con sus ventas.')
  // El monto lo calcula el servidor (nunca el que manda la pantalla).
  const cicloPlan = s.ciclo === 'trimestral' ? 'trimestral' : 'mensual'
  let f: { plan: string; escalon: number; ciclo: 'mensual' | 'trimestral'; radar: boolean; extras: number; usd: number; detalle: Detalle }
  if (r.tipo === 'radar_mes') {
    // 09-11 (mig. 159): Radar mensual (solo Radar, PRO todos los días). El precio es el del día que lo reporta.
    const m = s.radarMes
    f = { plan: s.planSugerido, escalon: s.escalonSugerido, ciclo: 'mensual', radar: true, extras: 0, usd: m.precio,
      detalle: { lineas: [
        { texto: `Radar PRO todos los días · 1 mes${m.promo ? ` (precio normal ${fmt(m.lista)})` : ''}`, usd: m.lista },
        ...(m.promo ? [{ texto: m.promo, usd: r2(m.precio - m.lista) }] : []),
      ], desde: m.desde, hasta: m.nuevoHasta } }
  } else if (r.tipo === 'recarga') {
    // 09-11 (mig. 157): recarga de créditos de IA, en prueba o con plan activo. No toca el plan.
    const p = RECARGAS_IA[r.paquete ?? -1]
    if (!p) throw new ErrorCobro('Elige un paquete de créditos.')
    if (s.estado === 'vencido') throw new ErrorCobro('Tu cuenta está vencida: primero renueva tu plan.')
    f = { plan: s.plan ?? s.planSugerido, escalon: s.escalon ?? s.escalonSugerido, ciclo: cicloPlan, radar: false, extras: 0, usd: p.precio,
      detalle: { lineas: [{ texto: `Recarga de ${p.creditos.toLocaleString('de-DE')} créditos de IA (no vencen)`, usd: p.precio }], desde: null, hasta: null, creditos: p.creditos } }
  } else if (r.tipo === 'radar_pro') {
    const c = s.radarProCompra
    if (!c) throw new ErrorCobro('Radar PRO se agrega con un plan activo que incluya Radar.')
    f = { plan: s.plan!, escalon: s.escalon!, ciclo: cicloPlan, radar: true, extras: 0, usd: c.precio,
      detalle: { lineas: [{ texto: 'Radar PRO los fines de semana · 1 mes (sin descuento)', usd: c.precio }], desde: c.desde, hasta: c.hasta } }
  } else if (r.tipo === 'upgrade') {
    const u = s.mejoras.find(x => x.plan === r.plan)
    if (!u) throw new ErrorCobro('Ese cambio de plan no está disponible ahora.')
    f = { plan: u.plan, escalon: s.escalon!, ciclo: cicloPlan, radar: false, extras: 0, usd: u.monto,
      detalle: { lineas: u.lineas, desde: currentDate(), hasta: s.vence } }
  } else {
    // 12-11 (el dueño): Radar PRO se ofrece SIEMPRE al pagar el plan (1er mes de regalo, los demás pagados). Lo aplica
    // aprobarCobro (k.radar_pro, a continuación del regalo).
    const m = montoCobro(s, r.plan, r.ciclo, !!r.radarPro)
    const radarUsd = m.pro ? RADAR_PRO.precio * mesesRadarPro(s.radarPro.regalo, m.meses) : 0
    f = { plan: r.plan, escalon: s.escalonSugerido, ciclo: r.ciclo, radar: m.pro, extras: s.cuentasExtra, usd: m.usd,
      detalle: { lineas: desglosePlan(r.plan, s.escalonSugerido, r.ciclo, s.fundador, s.cuentasExtra, radarUsd), desde: s.inicioPlan, hasta: sumarMeses(s.inicioPlan, m.meses) } }
  }
  const tasa = r.metodo === 'pago_movil' ? s.tasaBcv : null
  if (r.metodo === 'pago_movil' && !tasa) throw new ErrorCobro('No hay tasa BCV cargada hoy: intenta más tarde o paga por Binance.')
  const { rows: [k] } = await dbGlobal().query(
    `INSERT INTO organizacion_cobros (organizacion_id, user_id, plan, escalon, ciclo, radar_pro, cuentas_extra, ventas_30d,
                                      monto_usd, metodo, tasa_bcv, monto_bs, referencia, fecha_pago, tipo, detalle)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
    [orgId, userId, f.plan, f.escalon, f.ciclo, f.radar, f.extras, s.ventasMes, f.usd, r.metodo,
     tasa, tasa ? Math.round(f.usd * tasa * 100) / 100 : null, r.referencia.trim(), r.fechaPago, r.tipo, JSON.stringify(f.detalle)])
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

export const TITULO_TIPO: Record<TipoCobro, string> = { plan: 'Plan', radar_pro: 'Radar PRO (1 mes)', upgrade: 'Mejora de plan', recarga: 'Recarga de créditos IA', radar_mes: 'Radar mensual' }

async function avisarDueno(id: number, archivo: Reporte['archivo']) {
  if (!telegramConfigurado()) return
  const { rows: [k] } = await dbGlobal().query(
    `SELECT k.*, k.monto_usd::float AS usd, k.monto_bs::float AS bs, o.nombre AS org, COALESCE(u.full_name, u.username) AS persona,
            ${SQL_REF_REPETIDA} AS repetida
     FROM organizacion_cobros k JOIN organizaciones o ON o.id = k.organizacion_id LEFT JOIN users u ON u.id = k.user_id
     WHERE k.id = $1`, [id])
  if (!k) return
  const d = k.detalle as Detalle | null
  const html = `💰 <b>Pago reportado</b>${ENTORNO === 'staging' ? ' · <i>staging</i>' : ''}\n`
    + `🏢 ${esc(k.org)} · 👤 ${esc(k.persona ?? '—')}\n`
    + `<b>${esc(TITULO_TIPO[(k.tipo ?? 'plan') as TipoCobro])}</b>${d?.desde && d?.hasta ? ` · del ${ddmm(d.desde)} al ${ddmm(d.hasta)}` : ''}\n`
    + (d?.lineas ?? []).map(l => `• ${esc(l.texto)}: ${l.usd < 0 ? '−' : ''}${fmt(Math.abs(l.usd))}`).join('\n') + '\n'
    + `Total <b>${k.usd}</b>`
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
 * Créditos de IA (09-11, mig. 156): el PRIMER plan suma al saldo los créditos de su escalón, una sola vez (el índice
 * único uq_ia_creditos_plan lo asegura); renovar, cambiar de plan o reactivar no vuelve a dar.
 */
export async function registrarPlan(client: PoolClient, org: number, b: {
  plan: Plan['id']; escalon: number; ciclo: 'mensual' | 'trimestral'; hasta: string; monto: number; nota?: string | null; desde?: string
}, por: number | null) {
  const { rows: [o] } = await client.query(
    `SELECT estado, to_char(plan_hasta, 'YYYY-MM-DD') AS plan_hasta, to_char(radar_pro_hasta, 'YYYY-MM-DD') AS radar_pro_hasta
     FROM organizaciones WHERE id = $1 FOR UPDATE`, [org])
  const hoy = currentDate()
  const desde = b.desde ?? (o.plan_hasta && o.plan_hasta >= hoy ? o.plan_hasta : hoy)
  const bienvenida = planConRadar(b.plan) && !o.radar_pro_hasta
  await client.query(
    `UPDATE organizaciones SET estado = 'activo', plan = $2, escalon = $3, ciclo = $4, plan_hasta = $5,
       prueba_dias = NULL, motivo_pausa = NULL, pausa_fecha = NULL,
       radar_pro_hasta = CASE WHEN $6 THEN $7::date ELSE radar_pro_hasta END
     WHERE id = $1`, [org, b.plan, b.escalon, b.ciclo, b.hasta, bienvenida, sumarMeses(hoy, 1)])
  await modulosDelPlan(client, org, b.plan)
  const { rows: [p] } = await client.query(
    `INSERT INTO organizacion_pagos (organizacion_id, tipo, monto, plan, escalon, ciclo, desde, hasta, nota, por)
     VALUES ($1, 'plan', $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [org, b.monto, b.plan, b.escalon, b.ciclo, desde, b.hasta, b.nota || null, por])
  await client.query(`INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle, por) VALUES ($1, $2, $3, $4)`,
    [org, o.estado === 'activo' ? 'renovada' : 'activa', `${b.plan} hasta ${b.hasta}`, por])
  await client.query(
    `INSERT INTO ia_creditos (empresa_id, motivo, creditos, pago_id, nota, por)
     SELECT e.id, 'plan', $2, $3, 'Primer plan', $4 FROM empresas e
     WHERE e.organizacion_id = $1 AND NOT EXISTS (SELECT 1 FROM ia_creditos c WHERE c.empresa_id = e.id AND c.motivo = 'plan')
     ON CONFLICT DO NOTHING`, [org, ESCALONES[b.escalon].creditos, p.id, por])
  return { pagoId: Number(p.id), bienvenida }
}

/** Módulos del plan (los que controla el plan se reemplazan; los demás quedan). ia_limite_mes = usa su saldo (mig. 156). */
async function modulosDelPlan(client: PoolClient, org: number, plan: Plan['id']) {
  await client.query(
    `UPDATE empresas SET
       modulos = ARRAY(SELECT DISTINCT m FROM unnest(
         ARRAY(SELECT x FROM unnest(modulos) x WHERE x <> ALL($2::text[])) || $3::text[]) m),
       ia_limite_mes = COALESCE(ia_limite_mes, 100), ia_saldo_desde = COALESCE(ia_saldo_desde, NOW())
     WHERE organizacion_id = $1`, [org, [...MODULOS_CONTROLADOS], [...MODULOS_PLAN[plan]]])
}

export async function aprobarCobro(id: number, por: number) {
  const client = await dbGlobal().connect()
  let resultado: { org: number; userId: number | null; hasta: string; plan: string; mensaje: string }
  try {
    await client.query('BEGIN')
    const { rows: [k] } = await client.query(
      `SELECT k.*, k.monto_usd::float AS usd, to_char(o.plan_hasta, 'YYYY-MM-DD') AS plan_hasta,
              CASE WHEN o.estado = 'prueba' THEN to_char(o.prueba_hasta, 'YYYY-MM-DD') END AS prueba_hasta,
              to_char(o.radar_pro_hasta, 'YYYY-MM-DD') AS radar_pro_hasta, to_char(o.radar_mes_hasta, 'YYYY-MM-DD') AS radar_mes_hasta
       FROM organizacion_cobros k JOIN organizaciones o ON o.id = k.organizacion_id WHERE k.id = $1 FOR UPDATE OF k`, [id])
    if (!k) throw new ErrorCobro('Pago no encontrado')
    if (k.estado !== 'revision') throw new ErrorCobro('Ese pago ya se revisó')
    if (k.organizacion_id === ORGANIZACION_PLATAFORMA) throw new ErrorCobro('Tu organización es la propietaria: no tiene plan')
    const hoy = currentDate()
    const metodoRef = `${NOMBRE_METODO[k.metodo as Metodo]} ref. ${k.referencia} · reportado en Mi plan`
    const fechas = (desde: string, hasta: string) => client.query(
      `UPDATE organizacion_cobros SET detalle = COALESCE(detalle, '{}'::jsonb) || jsonb_build_object('desde', $2::text, 'hasta', $3::text) WHERE id = $1`,
      [id, desde, hasta])
    const cerrar = async (pagoId: number) => client.query(
      `UPDATE organizacion_cobros SET estado = 'aprobado', revisado_por = $2, revisado_at = NOW(), pago_id = $3 WHERE id = $1`, [id, por, pagoId])

    // 09-11 (mig. 157): recarga de créditos de IA → a la empresa principal de la organización (la primera).
    if (k.tipo === 'recarga') {
      const creditos = Number((k.detalle as Detalle | null)?.creditos ?? 0)
      if (!(creditos > 0)) throw new ErrorCobro('El pago no dice cuántos créditos son')
      const { rows: [e] } = await client.query(`SELECT id FROM empresas WHERE organizacion_id = $1 ORDER BY id LIMIT 1`, [k.organizacion_id])
      if (!e) throw new ErrorCobro('La organización no tiene empresa')
      const { rows: [p] } = await client.query(
        `INSERT INTO organizacion_pagos (organizacion_id, empresa_id, tipo, monto, creditos, nota, por) VALUES ($1, $2, 'recarga', $3, $4, $5, $6) RETURNING id`,
        [k.organizacion_id, e.id, k.usd, creditos, metodoRef, por])
      await client.query(
        `INSERT INTO ia_creditos (empresa_id, motivo, creditos, pago_id, nota, por) VALUES ($1, 'recarga', $2, $3, $4, $5)`,
        [e.id, creditos, p.id, metodoRef, por])
      await cerrar(Number(p.id))
      await client.query('COMMIT')
      resultado = { org: k.organizacion_id, userId: k.user_id, hasta: hoy, plan: k.plan,
        mensaje: `✅ <b>Pago aprobado</b>\nSe sumaron <b>${creditos.toLocaleString('de-DE')} créditos de IA</b> a tu saldo (no vencen). ¡Gracias!` }
      avisarCliente(resultado.userId, resultado.mensaje)
      return resultado
    }

    // 09-11 (mig. 159): Radar mensual, 1 mes a continuación del vigente (o desde hoy). PRO todos los días.
    if (k.tipo === 'radar_mes') {
      const desde = k.radar_mes_hasta && k.radar_mes_hasta >= hoy ? k.radar_mes_hasta : hoy
      const hasta = sumarMeses(desde, 1)
      await client.query(`UPDATE organizaciones SET radar_mes_hasta = $2 WHERE id = $1`, [k.organizacion_id, hasta])
      const { rows: [p] } = await client.query(
        `INSERT INTO organizacion_pagos (organizacion_id, tipo, monto, desde, hasta, nota, por) VALUES ($1, 'radar_mes', $2, $3, $4, $5, $6) RETURNING id`,
        [k.organizacion_id, k.usd, desde, hasta, metodoRef, por])
      await client.query(`INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle, por) VALUES ($1, 'radar_pro', $2, $3)`,
        [k.organizacion_id, `Radar mensual hasta ${hasta}`, por])
      await fechas(desde, hasta); await cerrar(Number(p.id))
      await client.query('COMMIT')
      resultado = { org: k.organizacion_id, userId: k.user_id, hasta, plan: k.plan,
        mensaje: `✅ <b>Pago aprobado</b>\nTu Radar PRO está activo hasta el <b>${ddmm(hasta)}</b>. Entra en radar.elcomerciantedigital.com. ¡Gracias!` }
      avisarCliente(resultado.userId, resultado.mensaje)
      return resultado
    }

    // 06-11 (Plan A): Radar PRO aparte, 1 mes a continuación del que tenga vigente (o desde hoy).
    if (k.tipo === 'radar_pro') {
      const desde = k.radar_pro_hasta && k.radar_pro_hasta >= hoy ? k.radar_pro_hasta : hoy
      const hasta = sumarMeses(desde, 1)
      await client.query(`UPDATE organizaciones SET radar_pro_hasta = $2 WHERE id = $1`, [k.organizacion_id, hasta])
      const { rows: [p] } = await client.query(
        `INSERT INTO organizacion_pagos (organizacion_id, tipo, monto, desde, hasta, nota, por) VALUES ($1, 'radar_pro', $2, $3, $4, $5, $6) RETURNING id`,
        [k.organizacion_id, k.usd, desde, hasta, metodoRef, por])
      await client.query(`INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle, por) VALUES ($1, 'radar_pro', $2, $3)`,
        [k.organizacion_id, `Radar PRO hasta ${hasta}`, por])
      await fechas(desde, hasta); await cerrar(Number(p.id))
      await client.query('COMMIT')
      resultado = { org: k.organizacion_id, userId: k.user_id, hasta, plan: k.plan,
        mensaje: `✅ <b>Pago aprobado</b>\nRadar PRO activo hasta el <b>${ddmm(hasta)}</b>. ¡Gracias!` }
      avisarCliente(resultado.userId, resultado.mensaje)
      return resultado
    }

    // 06-11 (Plan B): mejora de plan. Cambia plan y módulos desde hoy; el vencimiento no se mueve.
    if (k.tipo === 'upgrade') {
      const { rows: [o] } = await client.query(
        `SELECT estado, plan, to_char(plan_hasta, 'YYYY-MM-DD') AS plan_hasta, to_char(radar_pro_hasta, 'YYYY-MM-DD') AS radar_pro_hasta
         FROM organizaciones WHERE id = $1 FOR UPDATE`, [k.organizacion_id])
      if (o.estado !== 'activo' || !o.plan_hasta || o.plan_hasta < hoy)
        throw new ErrorCobro('Ese plan ya no está vigente: rechaza este pago y que pague la renovación con el plan nuevo.')
      const bienvenida = planConRadar(k.plan) && !o.radar_pro_hasta
      await client.query(
        `UPDATE organizaciones SET plan = $2, radar_pro_hasta = CASE WHEN $3 THEN $4::date ELSE radar_pro_hasta END WHERE id = $1`,
        [k.organizacion_id, k.plan, bienvenida, sumarMeses(hoy, 1)])
      await modulosDelPlan(client, k.organizacion_id, k.plan)
      const { rows: [p] } = await client.query(
        `INSERT INTO organizacion_pagos (organizacion_id, tipo, monto, plan, escalon, ciclo, desde, hasta, nota, por)
         VALUES ($1, 'upgrade', $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [k.organizacion_id, k.usd, k.plan, k.escalon, k.ciclo, hoy, o.plan_hasta, `${o.plan} → ${k.plan} · ${metodoRef}`, por])
      await client.query(`INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle, por) VALUES ($1, 'cambio_plan', $2, $3)`,
        [k.organizacion_id, `${o.plan} → ${k.plan} hasta ${o.plan_hasta}`, por])
      await fechas(hoy, o.plan_hasta); await cerrar(Number(p.id))
      await client.query('COMMIT')
      resultado = { org: k.organizacion_id, userId: k.user_id, hasta: o.plan_hasta, plan: k.plan,
        mensaje: `✅ <b>Pago aprobado</b>\nYa tienes el plan ${esc(nombrePlan(k.plan))}, activo hasta el <b>${ddmm(o.plan_hasta)}</b>. ¡Gracias!` }
      avisarCliente(resultado.userId, resultado.mensaje)
      return resultado
    }

    const meses = k.ciclo === 'trimestral' ? 3 : 1
    // 06-11 (Gerardo): si paga en la prueba, el plan arranca cuando ella termina (no pierde los días que le quedaban).
    // La prueba vale hasta su último día inclusive: el plan cuenta desde ese día, igual que una renovación.
    const base = [k.plan_hasta, k.prueba_hasta, hoy].filter((f): f is string => !!f && f >= hoy).sort().pop()!
    const hasta = sumarMeses(base, meses)
    const { pagoId, bienvenida } = await registrarPlan(client, k.organizacion_id, {
      plan: k.plan, escalon: k.escalon, ciclo: k.ciclo, hasta, monto: k.usd, desde: base,
      nota: `${metodoRef}${k.radar_pro ? ' (incluye Radar PRO)' : ''}`,
    }, por)
    await fechas(base, hasta)
    // Con el mes de regalo (bienvenida) el PRO pagado va a continuación de ese mes.
    const mesesPro = mesesRadarPro(bienvenida, meses)
    if (k.radar_pro && mesesPro > 0) {
      const { rows: [o] } = await client.query(`SELECT to_char(radar_pro_hasta, 'YYYY-MM-DD') AS h FROM organizaciones WHERE id = $1`, [k.organizacion_id])
      const desde = o.h && o.h >= hoy ? o.h : hoy
      const proHasta = sumarMeses(desde, mesesPro)
      await client.query(`UPDATE organizaciones SET radar_pro_hasta = $2 WHERE id = $1`, [k.organizacion_id, proHasta])
      await client.query(
        `INSERT INTO organizacion_pagos (organizacion_id, tipo, monto, desde, hasta, nota, por) VALUES ($1, 'radar_pro', 0, $2, $3, $4, $5)`,
        [k.organizacion_id, desde, proHasta, `Incluido en el pago del plan (cobro #${id})`, por])
    }
    await cerrar(pagoId)
    await client.query('COMMIT')
    resultado = { org: k.organizacion_id, userId: k.user_id, hasta, plan: k.plan,
      mensaje: `✅ <b>Pago aprobado</b>\nTu plan ${esc(nombrePlan(k.plan))} está activo hasta el <b>${ddmm(hasta)}</b>. ¡Gracias!` }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally { client.release() }
  avisarCliente(resultado.userId, resultado.mensaje)
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
  // 06-11 (el dueño): cada cobro con su desglose (plan, escalón, meses, descuento, Radar, cuentas extra) y las fechas
  // que cubre, más lo que la cuenta tiene vigente hoy (plan y Radar PRO).
  const SELECT_PANEL = `SELECT k.id, k.organizacion_id, o.nombre AS organizacion, COALESCE(u.full_name, u.username) AS persona, k.tipo, k.plan, k.escalon,
                     k.ciclo, k.radar_pro, k.cuentas_extra, k.ventas_30d, k.monto_usd::float, k.metodo, k.tasa_bcv::float, k.monto_bs::float,
                     k.referencia, to_char(k.fecha_pago, 'YYYY-MM-DD') AS fecha_pago, k.creado_at, k.comprobante IS NOT NULL AS tiene_comprobante,
                     k.estado, k.motivo, k.revisado_at, k.detalle, o.fundador,
                     to_char(p.desde, 'YYYY-MM-DD') AS p_desde, to_char(p.hasta, 'YYYY-MM-DD') AS p_hasta,
                     o.estado AS org_estado, to_char(COALESCE(o.plan_hasta, o.prueba_hasta), 'YYYY-MM-DD') AS vence,
                     to_char(o.radar_pro_hasta, 'YYYY-MM-DD') AS radar_pro_hasta,
                     ${SQL_REF_REPETIDA} AS repetida
              FROM organizacion_cobros k JOIN organizaciones o ON o.id = k.organizacion_id LEFT JOIN users u ON u.id = k.user_id
              LEFT JOIN organizacion_pagos p ON p.id = k.pago_id`
  // 12-11 (el dueño, Cuentas y cobros): la última vez que alguien de la cuenta entró y su contacto del registro.
  const ULTIMA = `(SELECT max(u.ultima_actividad) FROM empresas e JOIN usuario_empresas ue ON ue.empresa_id = e.id
                   JOIN users u ON u.id = ue.user_id WHERE e.organizacion_id = o.id)`
  const MES = `date_trunc('month', NOW() AT TIME ZONE 'America/Caracas')`
  const [{ rows: pendientes }, { rows: vencen }, { rows: recientes }, datos, { rows: pagando }, { rows: [ingresos] }] = await Promise.all([
    db.query(`${SELECT_PANEL} WHERE k.estado = 'revision' ORDER BY k.creado_at`),
    db.query(`SELECT o.id, o.nombre, o.estado, o.plan, to_char(COALESCE(CASE WHEN o.estado = 'activo' THEN o.plan_hasta END, o.prueba_hasta, o.plan_hasta), 'YYYY-MM-DD') AS vence,
                     (SELECT k.estado FROM organizacion_cobros k WHERE k.organizacion_id = o.id ORDER BY k.creado_at DESC LIMIT 1) AS ultimo_cobro,
                     ${ULTIMA} AS ultima, o.registro - 'ip_hash' - 'navegador' AS registro, o.fundador,
                     EXISTS (SELECT 1 FROM empresas e JOIN ml_conexiones c ON c.empresa_id = e.id WHERE e.organizacion_id = o.id) AS con_ml
              FROM organizaciones o
              WHERE o.id <> $1 AND o.estado IN ('prueba', 'activo')
                AND COALESCE(CASE WHEN o.estado = 'activo' THEN o.plan_hasta END, o.prueba_hasta)
                    BETWEEN (NOW() AT TIME ZONE 'America/Caracas')::date AND (NOW() AT TIME ZONE 'America/Caracas')::date + 7
              ORDER BY 5, o.nombre`, [ORGANIZACION_PLATAFORMA]),
    db.query(`${SELECT_PANEL} WHERE k.estado <> 'revision' ORDER BY k.revisado_at DESC NULLS LAST LIMIT 20`),
    leerDatosCobro(),
    db.query(`SELECT o.id, o.nombre, o.plan, o.escalon, o.ciclo, o.fundador, to_char(o.plan_hasta, 'YYYY-MM-DD') AS hasta, ${ULTIMA} AS ultima,
                     (SELECT p.monto::float FROM organizacion_pagos p WHERE p.organizacion_id = o.id AND p.tipo IN ('plan', 'upgrade')
                      ORDER BY p.fecha DESC LIMIT 1) AS monto
              FROM organizaciones o WHERE o.id <> $1 AND o.estado = 'activo' ORDER BY o.plan_hasta NULLS LAST, o.nombre`, [ORGANIZACION_PLATAFORMA]),
    db.query(`SELECT COALESCE(SUM(monto) FILTER (WHERE (fecha AT TIME ZONE 'America/Caracas') >= ${MES}), 0)::float AS mes,
                     COUNT(*) FILTER (WHERE (fecha AT TIME ZONE 'America/Caracas') >= ${MES})::int AS pagos_mes,
                     COALESCE(SUM(monto) FILTER (WHERE (fecha AT TIME ZONE 'America/Caracas') >= ${MES} - INTERVAL '1 month'
                                                   AND (fecha AT TIME ZONE 'America/Caracas') < ${MES}), 0)::float AS anterior
              FROM organizacion_pagos WHERE organizacion_id <> $1`, [ORGANIZACION_PLATAFORMA]),
  ])
  return { pendientes: pendientes.map(conDesglose), vencen, recientes: recientes.map(conDesglose), datos, pagando, ingresos }
}

/** El desglose guardado, o reconstruido de las columnas para los cobros de antes de la mig. 143. */
function conDesglose(k: Record<string, unknown>) {
  const { detalle, fundador, p_desde, p_hasta, ...resto } = k as Record<string, unknown> & { detalle: Detalle | null; fundador: boolean; p_desde: string | null; p_hasta: string | null }
  let lineas = detalle?.lineas
  if (!lineas) {
    const c = k as { plan: string; escalon: number; ciclo: 'mensual' | 'trimestral'; cuentas_extra: number; radar_pro: boolean; monto_usd: number }
    const plan = montoPlan(c.plan as Plan['id'], c.escalon, c.ciclo, !!fundador, c.cuentas_extra).total
    lineas = desglosePlan(c.plan, c.escalon, c.ciclo, !!fundador, c.cuentas_extra, c.radar_pro ? r2(c.monto_usd - plan) : 0)
  }
  return { ...resto, lineas, desde: detalle?.desde ?? p_desde, hasta: detalle?.hasta ?? p_hasta }
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
