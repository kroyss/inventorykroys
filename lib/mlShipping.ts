// MercadoEnvíos VE — envío gratis por peso.
//
// ML Venezuela (caso atípico) da envío gratis según una tabla peso→precio mínimo:
// si tu precio de venta FINAL (con descuento) queda ≥ el mínimo del rango de peso del
// producto, la publicación tiene envío gratis. Si el descuento lo baja por debajo, se
// pierde. Con el peso registrado, el sistema calcula el descuento MÁXIMO que cada
// producto aguanta sin perder el envío gratis, y limita el descuento global a ese tope.
//
// Solo aplica a VE. La tabla cambia cada ~años → editable en Ajustes (app_settings
// key `ml_shipping_table`, JSON). Acá va el default.
//
// La MISMA tabla alimenta dos cosas: el tope de descuento (shipInfo) y el costo
// de envío que se le imputa a cada venta en la ganancia (shippingCostVE). Así,
// cuando ML cambia los mínimos, se actualiza en un solo lugar.

export interface ShipTier {
  /** Peso máximo del rango en kg (el mínimo es el maxKg del rango anterior). */
  maxKg: number
  /** Precio mínimo (USD) del rango para tener envío gratis. */
  minPrice: number
}

// Tabla unificada de ML Venezuela vigente desde el 1 de octubre de 2026
// (reemplaza la de Tealca/Zoom). Valores exactos publicados por ML.
export const DEFAULT_SHIPPING_TABLE: ShipTier[] = [
  { maxKg: 0.5,  minPrice: 3 },
  { maxKg: 1,    minPrice: 7 },
  { maxKg: 1.5,  minPrice: 15 },
  { maxKg: 2,    minPrice: 20 },
  { maxKg: 3,    minPrice: 30 },
  { maxKg: 4,    minPrice: 40 },
  { maxKg: 5,    minPrice: 50 },
  { maxKg: 10,   minPrice: 60 },
  { maxKg: 80,   minPrice: 80 },
  { maxKg: 999,  minPrice: 200 },  // "más de 80 kg"
]

/** Lee la tabla de un objeto de settings; si no hay o es inválida, usa el default. */
export function parseShippingTable(raw: string | undefined | null, def: ShipTier[] = DEFAULT_SHIPPING_TABLE): ShipTier[] {
  if (!raw) return def
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr) || arr.length === 0) return def
    const clean = arr
      .map(t => ({ maxKg: Number(t.maxKg), minPrice: Number(t.minPrice) }))
      .filter(t => t.maxKg > 0 && t.minPrice >= 0)
      .sort((a, b) => a.maxKg - b.maxKg)
    return clean.length ? clean : def
  } catch {
    return def
  }
}

/** Rango de peso que aplica; null si el peso no está registrado o supera el máximo. */
export function tierFor(weightKg: number | null | undefined, table: ShipTier[]): ShipTier | null {
  if (weightKg == null || !(weightKg > 0)) return null
  for (const t of table) if (weightKg <= t.maxKg) return t
  return null // por encima del rango más grande
}

/**
 * Mínimo de envío gratis que se usa para el costo de envío de un producto: el de
 * su rango de peso según la tabla. Sin peso registrado (o fuera de tabla) cae al
 * umbral global de Ajustes (`ml_umbral`). `porPeso` dice cuál de los dos se usó.
 */
export function shippingThresholdVE(
  weightKg: number | null | undefined, table: ShipTier[], umbralGlobal: number,
): { umbral: number; porPeso: boolean } {
  const t = tierFor(weightKg, table)
  return t ? { umbral: t.minPrice, porPeso: true } : { umbral: umbralGlobal, porPeso: false }
}

/**
 * Costo de envío de ML (VE) imputado a UNA unidad vendida.
 *
 * El vendedor paga `envio` por cada envío, pero el envío gratis solo existe si la
 * compra llega al mínimo. Si el precio es menor, el cliente junta unidades hasta
 * alcanzarlo y ese costo se reparte entre ellas: envio × mín(1, precio / umbral).
 *
 * Antes el umbral era uno solo ($5) para todo el catálogo. Con mínimos distintos
 * por peso ($3 hasta 0,5 kg, $7 hasta 1 kg, $15 hasta 1,5 kg…) un único número
 * sobre- o subestimaba el envío según el producto.
 */
export function shippingCostVE(
  price: number, weightKg: number | null | undefined, table: ShipTier[],
  envio: number, umbralGlobal: number,
): number {
  const { umbral } = shippingThresholdVE(weightKg, table, umbralGlobal)
  if (!(umbral > 0)) return envio
  return envio * Math.min(1, price / umbral)
}

/**
 * Mínimo de unidades para que un carrito de ese producto alcance el envío gratis.
 * OJO: al sumar unidades, el PESO total también sube y puede saltar a un rango con
 * umbral mayor → se busca iterando, no dividiendo. null si no se alcanza (peso total
 * fuera de tabla o precio demasiado bajo).
 */
export function unitsForFreeShip(
  weightKg: number, unitPrice: number, table: ShipTier[], maxUnits = 30,
): number | null {
  if (!(weightKg > 0) || !(unitPrice > 0)) return null
  for (let n = 1; n <= maxUnits; n++) {
    const t = tierFor(weightKg * n, table)
    if (!t) return null // el peso total se salió de la tabla
    if (unitPrice * n >= t.minPrice) return n
  }
  return null
}

export type ShipStatus =
  | 'ok'            // el descuento global entra completo, con envío gratis a 1 unidad
  | 'capped'        // el global excede el máximo → se limitó para no perder el envío gratis
  | 'aggregate'     // a 1 unidad no llega, pero SÍ juntando N unidades (normal en productos baratos)
  | 'impossible'    // ni juntando unidades llega: precio demasiado bajo para su peso (revisar)
  | 'unregistered'  // falta registrar el peso
  | 'overweight'    // peso por encima del rango máximo de la tabla

export interface ShipInfo {
  tier: ShipTier | null
  /** Máximo % de descuento que mantiene envío gratis a 1 unidad (null si no aplica). */
  maxDiscount: number | null
  /** Descuento realmente aplicado = global limitado por el máximo (o global si no aplica cap). */
  effectiveDiscount: number
  /** ¿Con el descuento efectivo hay envío gratis a 1 unidad? */
  freeShip: boolean
  /** Unidades para envío gratis (1 si aplica solo; N si es por volumen; null si no aplica). */
  unitsForFree: number | null
  status: ShipStatus
}

/**
 * @param weightKg   peso del producto (kg) o null si no registrado
 * @param published  precio publicado (base × (1+exceso)), antes de descuento, en USD
 * @param globalDiscount descuento global configurado (%)
 * @param table      tabla de umbrales
 */
export function shipInfo(
  weightKg: number | null | undefined,
  published: number,
  globalDiscount: number,
  table: ShipTier[],
): ShipInfo {
  const tier = tierFor(weightKg, table)
  if (weightKg == null || !(weightKg > 0))
    return { tier: null, maxDiscount: null, effectiveDiscount: globalDiscount, freeShip: false, unitsForFree: null, status: 'unregistered' }
  if (!tier)
    return { tier: null, maxDiscount: null, effectiveDiscount: globalDiscount, freeShip: false, unitsForFree: null, status: 'overweight' }
  if (!(published > 0))
    return { tier, maxDiscount: null, effectiveDiscount: globalDiscount, freeShip: false, unitsForFree: null, status: 'unregistered' }

  if (published >= tier.minPrice) {
    // Envío gratis ya a 1 unidad: el descuento puede bajarlo hasta el umbral.
    const maxDiscount = (1 - tier.minPrice / published) * 100
    const effectiveDiscount = Math.min(globalDiscount, maxDiscount)
    return {
      tier, maxDiscount, effectiveDiscount, freeShip: true, unitsForFree: 1,
      status: globalDiscount > maxDiscount + 1e-9 ? 'capped' : 'ok',
    }
  }

  // Publicado por debajo del umbral: a 1 unidad no hay envío gratis. Sin cap (no hay
  // nada que proteger a 1 unidad) → descuento global completo. ¿Se alcanza por volumen?
  const finalUnit = published * (1 - globalDiscount / 100)
  const units = unitsForFreeShip(weightKg, finalUnit, table)
  return {
    tier, maxDiscount: null, effectiveDiscount: globalDiscount, freeShip: false,
    unitsForFree: units, status: units ? 'aggregate' : 'impossible',
  }
}

// ── Envío gratis POR TRANSPORTISTA (2026-10-16, Promociones) ─────────────────
// Cada transportista tiene su propio mínimo por peso (aviso del portal de MercadoEnvíos, oct-2026).
// Una publicación tiene envío gratis por los que llega: ZOOM pide igual o más que TEALCA, así que
// queda en uno de tres estados: ZOOM y TEALCA · solo TEALCA · cobro a destino.
// Desde el 19-10 las dos son EDITABLES en Ajustes (una sola fuente para todo el sistema):
//   TEALCA = `ml_shipping_table` (la de siempre: también tope de descuento y costo de envío en Productos)
//   ZOOM   = `ml_shipping_table_zoom`
// Estas constantes son el respaldo si no hay nada guardado.
export const TABLA_ZOOM: ShipTier[] = [
  { maxKg: 0.5, minPrice: 3 }, { maxKg: 1, minPrice: 10 }, { maxKg: 1.5, minPrice: 20 }, { maxKg: 2, minPrice: 20 },
  { maxKg: 3, minPrice: 30 }, { maxKg: 4, minPrice: 40 }, { maxKg: 5, minPrice: 50 }, { maxKg: 10, minPrice: 60 },
  { maxKg: 80, minPrice: 80 }, { maxKg: 999, minPrice: 200 },
]
export const TABLA_TEALCA: ShipTier[] = DEFAULT_SHIPPING_TABLE

export interface TablasEnvio { zoom: ShipTier[]; tealca: ShipTier[] }
export const TABLAS_DEFAULT: TablasEnvio = { zoom: TABLA_ZOOM, tealca: TABLA_TEALCA }
/** Las dos tablas a partir de los settings guardados (JSON); lo que falte, del respaldo. */
export function tablasEnvio(s: { ml_shipping_table?: string | null; ml_shipping_table_zoom?: string | null } | null | undefined): TablasEnvio {
  return { zoom: parseShippingTable(s?.ml_shipping_table_zoom, TABLA_ZOOM), tealca: parseShippingTable(s?.ml_shipping_table, TABLA_TEALCA) }
}

export type EstadoEnvio = 'ambas' | 'tealca' | 'destino' | 'sin_peso'

/** Envío gratis a un precio dado: por qué transportistas, y los mínimos de cada uno para ese peso. */
export function envioPorTransportista(pesoKg: number | null | undefined, precio: number, tablas: TablasEnvio = TABLAS_DEFAULT) {
  const z = tierFor(pesoKg, tablas.zoom), t = tierFor(pesoKg, tablas.tealca)
  if (!z || !t) return { estado: 'sin_peso' as EstadoEnvio, minZoom: null, minTealca: null }
  const estado: EstadoEnvio = precio >= z.minPrice ? 'ambas' : precio >= t.minPrice ? 'tealca' : 'destino'
  return { estado, minZoom: z.minPrice, minTealca: t.minPrice }
}

/** Descuento máximo (%) sobre `precio` que mantiene el envío gratis con ese mínimo (null = ya no llega). */
export function topeDescuento(precio: number, minimo: number | null) {
  if (minimo == null || !(precio > 0) || precio < minimo) return null
  return Math.floor((1 - minimo / precio) * 1000) / 10
}

/**
 * Cuántas unidades tiene que comprar el cliente para llegar al envío gratis con ese transportista (2026-10-16):
 * n × precio ≥ mínimo del rango de n × peso (al sumar unidades el paquete pesa más y puede cambiar de rango).
 * null = con 1 ya llega, o no se llega ni con MAX_UNIDADES.
 */
const MAX_UNIDADES = 10
export function unidadesParaGratis(pesoKg: number | null | undefined, precio: number, tabla: ShipTier[]) {
  if (pesoKg == null || !(pesoKg > 0) || !(precio > 0)) return null
  for (let n = 1; n <= MAX_UNIDADES; n++) {
    const t = tierFor(pesoKg * n, tabla)
    if (!t) return null
    if (precio * n >= t.minPrice) return n === 1 ? null : { unidades: n, total: Math.round(precio * n * 100) / 100 }
  }
  return null
}

/** Orden de los estados (más alto = mejor envío gratis). */
export const RANGO_ENVIO: Record<EstadoEnvio, number> = { ambas: 2, tealca: 1, destino: 0, sin_peso: -1 }

/**
 * Envío gratis de una publicación A ESTE PRECIO (Preguntas, Mensajes y la IA, 2026-10-16): por ZOOM y TEALCA,
 * solo por TEALCA o cobro a destino. Con `precioSinPromo` dice si es la promoción la que le quitó ZOOM o el envío
 * gratis (cuando la promo termina, el precio vuelve y el estado cambia solo). null = sin peso o sin precio.
 */
export function envioGratisAhora(pesoKg: number | null | undefined, precio: number | null | undefined, precioSinPromo?: number | null,
  tablas: TablasEnvio = TABLAS_DEFAULT) {
  if (pesoKg == null || !(pesoKg > 0) || precio == null || !(precio > 0)) return null
  const e = envioPorTransportista(pesoKg, precio, tablas)
  if (e.estado === 'sin_peso') return null
  const base = precioSinPromo && precioSinPromo > precio ? envioPorTransportista(pesoKg, precioSinPromo, tablas).estado : null
  const porPromo = base != null && RANGO_ENVIO[base] > RANGO_ENVIO[e.estado]
  const texto = e.estado === 'ambas' ? 'Envío gratis por ZOOM y TEALCA'
    : e.estado === 'tealca' ? 'Envío gratis SOLO por TEALCA (ZOOM no llega a este precio)'
    : 'Sin envío gratis a 1 unidad: cobro a destino'
  return { estado: e.estado, texto, porPromo, minZoom: e.minZoom, minTealca: e.minTealca }
}

// ── Hueco de VARIAS unidades por la promoción (24-10, balanza MLV794933472) ──
// Con 1 unidad sigue gratis, pero comprando 2 o 3 el paquete pasa a otro rango de peso y al precio de la promo
// ya no llega al mínimo (a precio normal sí): 2 × 0,9 kg = 1,8 kg pide $20 y la promo da 2 × $9,63 = $19,26.
// Solo cuenta lo que causa la promo y hasta lo que hay disponible (sin stock para 2, no hay hueco).
export interface HuecoUnidades {
  unidades: number; kg: number; minimo: number; paga: number
  /** Descuento máximo (%) sobre el precio normal que mantiene gratis de 1 a `unidades` (null = no se calcula). */
  tope: number | null
}
const MAX_HUECO = 3
export function huecoVariasUnidades(pesoKg: number | null | undefined, precioPromo: number | null | undefined,
  precioNormal: number | null | undefined, tablas: TablasEnvio = TABLAS_DEFAULT, disponible?: number | null): HuecoUnidades | null {
  if (pesoKg == null || !(pesoKg > 0) || precioPromo == null || !(precioPromo > 0) || precioNormal == null || !(precioNormal > precioPromo)) return null
  if (envioPorTransportista(pesoKg, precioPromo, tablas).estado === 'destino') return null   // con 1 ya no llega: lo avisa lo de siempre
  const max = Math.min(MAX_HUECO, disponible == null ? MAX_HUECO : disponible)
  for (let n = 2; n <= max; n++) {
    const t = tierFor(pesoKg * n, tablas.tealca)
    if (!t) return null
    if (precioPromo * n < t.minPrice && precioNormal * n >= t.minPrice) {
      // Tope: el menor de los descuentos que aguanta cada cantidad de 1 a n (las que a precio normal llegan).
      let tope: number | null = null
      for (let k = 1; k <= n; k++) {
        const tk = tierFor(pesoKg * k, tablas.tealca)
        const d = tk ? topeDescuento(precioNormal * k, tk.minPrice) : null
        if (d != null) tope = tope == null ? d : Math.min(tope, d)
      }
      return { unidades: n, kg: Math.round(pesoKg * n * 100) / 100, minimo: t.minPrice, paga: Math.round(precioPromo * n * 100) / 100, tope }
    }
  }
  return null
}

/** Texto corto del hueco, igual en todas las pantallas. */
export function textoHueco(h: HuecoUnidades) {
  const kg = h.kg.toLocaleString('de-DE', { maximumFractionDigits: 2 })
  return `Comprando ${h.unidades} queda SIN envío gratis por la promo: ${kg} kg pide $${h.minimo} y pagaría $${h.paga.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`
    + (h.tope != null ? ` · la promo aguanta hasta ${h.tope.toLocaleString('de-DE')}%` : '')
}

// ── Publicación vinculada a varios productos de distinto peso (21-10) ───────
// Sin peso del portal, el envío se calcula con el producto vinculado MÁS pesado (sqlPesoPublicacion). Si la
// publicación tiene varios productos y el envío gratis cambia según cuál, casi siempre es un vínculo mal hecho
// (MLV740065063: rollo de 30 cm unido también al de 150 cm → "Sin envío gratis"). Con el mismo resultado no se avisa.
export interface PesoVinculado { code: string; kg: number }
export type ConflictoPesos = (PesoVinculado & { estado: EstadoEnvio })[]

export function conflictoPesos(pesos: PesoVinculado[] | null | undefined, precio: number | null | undefined,
  tablas: TablasEnvio = TABLAS_DEFAULT): ConflictoPesos | null {
  if (!pesos || pesos.length < 2 || precio == null || !(precio > 0)) return null
  const c = pesos.map(p => ({ ...p, estado: envioPorTransportista(p.kg, precio, tablas).estado }))
  return new Set(c.map(x => x.estado)).size > 1 ? c : null
}

const kgTexto = (kg: number) => `${String(Math.round(kg * 1000) / 1000).replace('.', ',')} kg`
const ESTADO_CORTO: Record<EstadoEnvio, string> = { ambas: 'envío gratis', tealca: 'gratis solo TEALCA', destino: 'sin envío gratis', sin_peso: 'sin peso' }
/** "⚠ Vinculada a 2 productos (0,6 kg y 3 kg)" + el detalle de cada uno, para el chip y su título. */
export function textoConflicto(c: ConflictoPesos) {
  const kgs = c.map(x => kgTexto(x.kg))
  return {
    corto: `⚠ Vinculada a ${c.length} productos (${kgs.slice(0, -1).join(', ')} y ${kgs[kgs.length - 1]})`,
    detalle: `${c.map(x => `${x.code} · ${kgTexto(x.kg)}: ${ESTADO_CORTO[x.estado]}`).join(' · ')}. `
      + 'El envío se calcula con el más pesado: si uno está mal vinculado, quítalo en Vincular con ML.',
  }
}
