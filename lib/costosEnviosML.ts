// Finanzas → Costos ML (07-11-2026): lo que MercadoLibre Venezuela cobra por los envíos gratis, por cuenta y por MES
// CALENDARIO, calculado desde las guías cargadas en Despachos, para compararlo con lo que ML factura.
//
// Regla de ML (tabla vigente oct-2026): a fin de mes cuentan los envíos de la cuenta y suman el costo unitario de cada
// uno según su PESO y la cantidad de envíos del mes (3–50 / 51–150 con 20% desc. / más de 150 con 50% desc.). Se cobra
// a tasa BCV en los primeros 7 días del mes siguiente como "Cargo Especial" (facturación ML, subtipo CS). Una guía
// generada se cobra aunque la venta se cancele → la diferencia con lo facturado suele ser de guías que no se subieron.
// "Mi página" (~$13) viene aparte como CESM. Solo cuentas VE.
import type { Pool } from 'pg'
import { mlFetch } from '@/lib/ml'

export interface TramoCosto { maxKg: number; c1: number; c2: number; c3: number }

export const CLAVE_TABLA = 'ml_envios_costos'
const CLAVE_CACHE = 'ml_facturacion_cache'

// Tabla publicada por ML Venezuela (vigente desde oct-2026). c1 = 3–50 envíos, c2 = 51–150, c3 = más de 150.
export const TABLA_COSTOS_DEFAULT: TramoCosto[] = [
  { maxKg: 0.5, c1: 1.30, c2: 1.04, c3: 0.65 },
  { maxKg: 1, c1: 1.33, c2: 1.06, c3: 0.66 },
  { maxKg: 1.5, c1: 1.35, c2: 1.08, c3: 0.68 },
  { maxKg: 2, c1: 1.38, c2: 1.10, c3: 0.69 },
  { maxKg: 4, c1: 1.40, c2: 1.12, c3: 0.70 },
  { maxKg: 6, c1: 1.43, c2: 1.14, c3: 0.71 },
  { maxKg: 8, c1: 1.45, c2: 1.16, c3: 0.73 },
  { maxKg: 10, c1: 1.48, c2: 1.18, c3: 0.74 },
  { maxKg: 20, c1: 1.50, c2: 1.20, c3: 0.75 },
  { maxKg: 30, c1: 3.90, c2: 3.12, c3: 1.95 },
  { maxKg: 40, c1: 9.05, c2: 7.24, c3: 4.52 },
  { maxKg: 50, c1: 9.64, c2: 7.72, c3: 4.82 },
  { maxKg: 60, c1: 15.48, c2: 12.39, c3: 7.74 },
  { maxKg: 70, c1: 15.51, c2: 12.41, c3: 7.75 },
  { maxKg: 80, c1: 19.78, c2: 15.82, c3: 9.89 },
  { maxKg: 100, c1: 30.45, c2: 24.36, c3: 15.22 },
]

export function leerTabla(raw: string | null | undefined): TramoCosto[] {
  if (!raw) return TABLA_COSTOS_DEFAULT
  try {
    const t = (JSON.parse(raw) as TramoCosto[])
      .map(x => ({ maxKg: Number(x.maxKg), c1: Number(x.c1), c2: Number(x.c2), c3: Number(x.c3) }))
      .filter(x => x.maxKg > 0 && [x.c1, x.c2, x.c3].every(v => v >= 0))
      .sort((a, b) => a.maxKg - b.maxKg)
    return t.length ? t : TABLA_COSTOS_DEFAULT
  } catch { return TABLA_COSTOS_DEFAULT }
}

/** Columna de la tabla según los envíos del mes de la cuenta (menos de 3: la tabla de ML no indica costo). */
export function columna(envios: number): 'c1' | 'c2' | 'c3' | null {
  return envios < 3 ? null : envios <= 50 ? 'c1' : envios <= 150 ? 'c2' : 'c3'
}

export function tramo(pesoKg: number, tabla: TramoCosto[]) {
  return tabla.find(t => pesoKg <= t.maxKg) ?? tabla[tabla.length - 1]
}

export interface GuiaCosto {
  guia: string; venta: string | null; fecha: string; carrier: string; productos: string | null
  peso: number | null; sinPeso: boolean; rango: string; usd: number; estimado: boolean
}
export interface CargoML { fecha: string; tipo: 'envios' | 'mi_pagina' | 'otro'; detalle: string; bs: number }
export interface CuentaCostos {
  conexionId: number; cuenta: string; envios: number; columna: string
  usd: number; usdEstimado: number; sinPeso: number; guias: GuiaCosto[]
  facturado: { cargos: CargoML[]; error?: string; consultado?: string } | null
}

const COL_TXT = { c1: '3 a 50 envíos', c2: '51 a 150 envíos (20% desc.)', c3: 'más de 150 envíos (50% desc.)' }
const finMes = (mes: string) => { const [y, m] = mes.split('-').map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01` }

export async function costosEnviosML(db: Pool, mes: string, conFactura: boolean) {
  const desde = `${mes}-01`, hasta = finMes(mes)
  const { rows: [cfg] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_TABLA])
  const tabla = leerTabla(cfg?.value)
  const { rows: [tasa] } = await db.query(
    `SELECT official_rate::float AS bcv, to_char(rate_date, 'YYYY-MM-DD') AS fecha FROM venezuela_exchange_rates
     WHERE rate_date < $1::date ORDER BY rate_date DESC, id DESC LIMIT 1`, [hasta])

  // Una fila por guía (la primera vez que se subió), su cuenta ML (por la orden) y el peso del paquete (Σ cantidad × peso).
  // 12-11 (el dueño, comparado con MercadoEnvíos → Cargos especiales): ML cuenta cada envío en el mes en que se CERRÓ LA
  // ORDEN, no el día que se subió la guía (las órdenes del 31 se suben el 1 y van al mes anterior). Se buscan guías
  // subidas 20 días antes y después y se queda con las de órdenes del mes (sin orden conocida: la fecha de la guía).
  const { rows } = await db.query(`
    WITH g AS (
      SELECT DISTINCT ON (e.guia) e.guia, e.venta, e.sale_id, e.carrier, e.created_at,
             CASE WHEN e.venta ~ '^[0-9]{1,18}$' THEN e.venta::bigint END AS venta_num
      FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id
      WHERE e.guia IS NOT NULL AND e.guia <> '' AND e.created_at >= $1::date - 20 AND e.created_at < $2::date + 20
      ORDER BY e.guia, e.created_at),
    g2 AS (SELECT g.*, coalesce(g.sale_id, (SELECT s.id FROM sales s WHERE s.ml_order_number = g.venta LIMIT 1)) AS sid FROM g),
    p AS (
      SELECT si.sale_id, sum(si.quantity * pr.weight_kg) AS peso, bool_or(pr.weight_kg IS NULL OR pr.weight_kg <= 0) AS sin_peso,
             string_agg(si.quantity || '× ' || pr.name, ' · ') AS productos
      FROM sale_items si JOIN products pr ON pr.id = si.product_id
      WHERE si.sale_id IN (SELECT sid FROM g2 WHERE sid IS NOT NULL)
      GROUP BY si.sale_id)
    SELECT g.guia, g.venta, g.carrier, to_char(g.created_at, 'YYYY-MM-DD') AS fecha, o.conexion_id,
           p.peso::float AS peso, coalesce(p.sin_peso, true) AS sin_peso, p.productos
    FROM g2 g
    LEFT JOIN LATERAL (SELECT conexion_id, fecha FROM ml_ordenes o WHERE o.id = g.venta_num OR o.pack_id = g.venta_num ORDER BY fecha LIMIT 1) o ON true
    LEFT JOIN p ON p.sale_id = g.sid
    WHERE COALESCE(o.fecha, g.created_at) >= $1::date AND COALESCE(o.fecha, g.created_at) < $2::date
      -- «Cobro a destino» (lo paga el comprador al retirar): ML no se lo cobra al vendedor (Pagos ME lo sabe).
      AND NOT EXISTS (SELECT 1 FROM me_pagos mp WHERE (mp.guia = g.guia OR mp.venta = g.venta) AND mp.envio_metodo = 'Cobro a destino')
    ORDER BY g.created_at`, [desde, hasta])

  const { rows: conexiones } = await db.query(
    `SELECT id, nickname FROM ml_conexiones WHERE site_id = 'MLV' AND estado = 'activa' ORDER BY id`)
  const nombre = new Map<number, string>(conexiones.map(c => [c.id, c.nickname]))

  const porCuenta = new Map<number, typeof rows>()
  for (const r of rows) { const k = r.conexion_id ?? 0; porCuenta.set(k, [...(porCuenta.get(k) ?? []), r]) }

  const cuentas: CuentaCostos[] = []
  for (const [conexionId, gs] of porCuenta) {
    const col = columna(gs.length)
    const conPeso = gs.filter(g => !g.sin_peso && g.peso > 0)
    const guias: GuiaCosto[] = gs.map(g => {
      const ok = !g.sin_peso && g.peso > 0
      const t = ok ? tramo(g.peso, tabla) : null
      const prev = t ? tabla[tabla.indexOf(t) - 1] : null
      return {
        guia: g.guia, venta: g.venta, fecha: g.fecha, carrier: g.carrier, productos: g.productos,
        peso: ok ? Math.round(g.peso * 1000) / 1000 : null, sinPeso: !ok,
        rango: t ? `${prev ? prev.maxKg : 0}–${t.maxKg} kg` : 'Sin peso',
        usd: t && col ? t[col] : 0, estimado: !ok,
      }
    })
    const usd = guias.reduce((s, g) => s + g.usd, 0)
    const prom = conPeso.length ? usd / conPeso.length : (col ? tabla[0][col] : 0)
    for (const g of guias) if (g.estimado) g.usd = Math.round(prom * 100) / 100
    cuentas.push({
      conexionId, cuenta: nombre.get(conexionId) ?? (conexionId ? `Cuenta ${conexionId}` : 'Sin cuenta identificada'),
      envios: gs.length, columna: col ? COL_TXT[col] : 'menos de 3 envíos (la tabla de ML no indica costo)',
      usd: Math.round(usd * 100) / 100,
      usdEstimado: Math.round(guias.reduce((s, g) => s + g.usd, 0) * 100) / 100,
      sinPeso: gs.length - conPeso.length, guias, facturado: null,
    })
  }
  // Cuentas sin guías en el mes igual aparecen (para ver su factura).
  for (const c of conexiones) if (!porCuenta.has(c.id))
    cuentas.push({ conexionId: c.id, cuenta: c.nickname, envios: 0, columna: '—', usd: 0, usdEstimado: 0, sinPeso: 0, guias: [], facturado: null })

  if (conFactura) for (const c of cuentas) if (c.conexionId) c.facturado = await facturaML(db, c.conexionId, hasta)

  return { mes, tabla, bcv: tasa?.bcv ?? null, bcvFecha: tasa?.fecha ?? null, cuentas: cuentas.sort((a, b) => b.envios - a.envios) }
}

// ── Lo que ML facturó: cargos especiales (envíos y otros) y Mi página, del período que arranca el mes siguiente ──
// La API de facturación permite 5 consultas por minuto: se guarda en app_settings y se vuelve a pedir a lo sumo cada
// 6 horas mientras el período pueda cambiar (los meses viejos quedan fijos).
type Cache = Record<string, { at: string; cargos: CargoML[] }>

async function facturaML(db: Pool, conexionId: number, periodo: string): Promise<{ cargos: CargoML[]; error?: string; consultado?: string }> {
  const k = `${conexionId}:${periodo}`
  const { rows: [c] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_CACHE])
  let cache: Cache = {}
  try { cache = JSON.parse(c?.value ?? '{}') } catch { /* vacía */ }
  const guardado = cache[k]
  const viejo = Date.now() - new Date(periodo).getTime() > 40 * 86_400_000 // el período ya cerró hace rato
  if (guardado && (viejo || Date.now() - new Date(guardado.at).getTime() < 6 * 3_600_000)) return { cargos: guardado.cargos, consultado: guardado.at }

  try {
    type Det = { charge_info: { creation_date_time: string; transaction_detail: string; detail_amount: number; detail_sub_type: string } }
    const pedir = (sub: string) => mlFetch<{ results: Det[] }>(db, conexionId,
      `/billing/integration/periods/key/${periodo}/group/ML/details?document_type=BILL&limit=50&detail_sub_types=${sub}`)
    const [cs, cesm] = [await pedir('CS'), await pedir('CESM')]
    const especiales = cs.results.map(x => x.charge_info)
    // El cobro de envíos es el cargo especial más grande de los primeros 7 días; los demás quedan como "otro".
    const enPlazo = especiales.filter(x => Number(x.creation_date_time.slice(8, 10)) <= 7)
    const mayor = enPlazo.reduce<typeof especiales[number] | null>((m, x) => !m || x.detail_amount > m.detail_amount ? x : m, null)
    const cargos: CargoML[] = [
      ...especiales.map(x => ({ fecha: x.creation_date_time.slice(0, 10), tipo: (x === mayor ? 'envios' : 'otro') as CargoML['tipo'], detalle: x.transaction_detail, bs: x.detail_amount })),
      ...cesm.results.map(x => ({ fecha: x.charge_info.creation_date_time.slice(0, 10), tipo: 'mi_pagina' as const, detalle: x.charge_info.transaction_detail, bs: x.charge_info.detail_amount })),
    ]
    const at = new Date().toISOString()
    cache[k] = { at, cargos }
    await db.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [CLAVE_CACHE, JSON.stringify(cache)])
    return { cargos, consultado: at }
  } catch (e) {
    if (guardado) return { cargos: guardado.cargos, consultado: guardado.at }
    const m = (e as Error).message
    return { cargos: [], error: /429/.test(m) ? 'MercadoLibre pide esperar un minuto para volver a consultar la facturación' : m }
  }
}
