// Comprobador de pagos contra el banco (19-10, en construcción: solo la lógica, sin pantalla ni tablas).
// El dueño baja el estado de cuenta de cada banco y el sistema cruza sus créditos con los pagos de Pagos ME.
// Regla de fondo: se confía en lo que dice el BANCO, no en lo que tipeó el comprador (banco, referencia y monto
// los escribe a mano y se equivoca). Por eso se busca en TODOS los estados subidos, no solo en el banco que dijo.
//
// Niveles del resultado:
//   seguro      referencia + monto coinciden            → se puede aprobar solo (más adelante, automático)
//   probable    sin referencia que cruce, pero monto exacto y único en esa fecha → sugerencia, un clic
//   revisar     la referencia cruza pero el monto no (llegó menos, o mucho más), o hay ambigüedad
//   no_aparece  el banco que dijo el comprador está subido y cubre esa fecha, y no hay nada
//   sin_estado  no se subió el estado de cuenta que cubre ese pago (no se puede opinar)
// Embalaje (opcional, lo suma algunos compradores; hoy ~Bs 400 y sube con el tiempo): el pago está bien si llegó
// desde el monto hasta monto + margen por venta. Si lo mandaron aparte, ese crédito chico queda como "embalaje".
import * as XLSX from 'xlsx'

export type BancoEstado = 'Bancamiga' | 'Banesco' | 'Mercantil' | 'Venezuela' | 'BBVA Provincial' | 'Banco Plaza'

export interface MovBanco {
  banco: string
  fecha: string          // YYYY-MM-DD
  ref: string            // solo dígitos, sin ceros a la izquierda
  concepto: string
  monto: number          // crédito (> 0)
  emisor?: string | null // banco desde el que pagaron, si la descripción lo dice (Provincial: "DR OB 0412… 102BAN")
}

// Código de banco (los 4 dígitos de la cuenta, 01xx) → el nombre que usa Pagos ME en banco_emisor.
const BANCO_POR_CODIGO: Record<string, string> = {
  '102': 'Venezuela', '134': 'Banesco', '105': 'Mercantil', '108': 'BBVA Provincial', '191': 'BNC', '172': 'Bancamiga',
  '174': 'BANPLUS', '163': 'Banco del Tesoro', '114': 'Bancaribe', '104': 'Venezolano De Crédito', '151': 'BFC',
  '175': 'Bicentenario', '115': 'Banco Exterior', '171': 'Banco Activo', '168': 'Bancrecer', '177': 'BANFANB', '138': 'Banco Plaza',
}
/** Banco de origen escrito en la descripción: "… 102BAN", "134BANES", "CR.I/REC 0134 V0…", "TRF CR INM 0102 V0…". */
export function emisorDe(concepto: string): string | null {
  const m = concepto.match(/\b(1\d{2})[A-Z]{2,}/) ?? concepto.match(/\b0(1\d{2})\b/)
  return m ? BANCO_POR_CODIGO[m[1]] ?? null : null
}

export interface EstadoCuenta { banco: string; desde: string; hasta: string; movimientos: MovBanco[]; filas: number }

// ── Lectura de estados de cuenta ─────────────────────────────────────────────
// Cada banco baja un formato distinto (Bancamiga y Banesco: tabla HTML con extensión .xls; Mercantil: .xlsx),
// pero todos traen una fila de títulos con "Fecha" y "Referencia". Se busca esa fila y se ubican las columnas
// por nombre, así un banco nuevo con títulos parecidos entra sin tocar código.

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&[a-z]+;/gi, m =>
  ({ '&eacute;': 'e', '&aacute;': 'a', '&iacute;': 'i', '&oacute;': 'o', '&uacute;': 'u', '&ntilde;': 'n' } as Record<string, string>)[m.toLowerCase()] ?? '')
const norm = (s: unknown) => sinAcentos(String(s ?? '')).toLowerCase().replace(/[^a-z]/g, '')
export const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '').replace(/^0+/, '')

/** "5.660,80" / "+5.660,80" / "5700,00" (formato VE) o "5747.18" (Mercantil) → número. */
export function numeroBanco(s: unknown): number {
  let t = String(s ?? '').trim().replace(/[^\d.,-]/g, '')
  if (!t) return 0
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

/** dd/mm/yy · dd/mm/yyyy · yyyy/mm/dd · yyyy-mm-dd → YYYY-MM-DD (null si no es fecha). */
export function fechaBanco(s: unknown): string | null {
  const t = String(s ?? '').trim()
  let m = t.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

/** Adivina el banco por el contenido (el dueño lo puede corregir en la pantalla). */
export function detectarBanco(filas: string[][], nombreArchivo = ''): string | null {
  const texto = (nombreArchivo + ' ' + filas.slice(0, 12).flat().join(' ')).toLowerCase()
  if (texto.includes('bancamiga') || texto.includes('0172')) return 'Bancamiga'
  if (texto.includes('mercantil') || /\b0105\d{16}\b/.test(texto)) return 'Mercantil'
  if (texto.includes('provincial') || texto.includes('bbva')) return 'BBVA Provincial'
  if (texto.includes('plaza')) return 'Banco Plaza'
  if (texto.includes('banesco') || filas.some(f => f.some(c => /banesco pago movil|trf cr inm/i.test(c)))) return 'Banesco'
  if (texto.includes('venezuela') || texto.includes('bdv')) return 'Venezuela'
  return null
}

export function leerFilas(datos: ArrayBuffer | Uint8Array): string[][] {
  const wb = XLSX.read(datos, { type: 'array', raw: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as unknown[][])
    .map(f => f.map(c => String(c ?? '').trim()))
}

export function leerEstadoCuenta(datos: ArrayBuffer | Uint8Array, nombreArchivo = '', banco?: string): EstadoCuenta {
  const filas = leerFilas(datos)
  // Títulos: Fecha + Referencia, o Fecha + Descripción (Provincial no trae columna de referencia).
  const iT = filas.findIndex(f => f.some(c => norm(c) === 'fecha')
    && f.some(c => norm(c).startsWith('referencia') || norm(c).startsWith('descripcion') || norm(c).startsWith('concepto')))
  if (iT < 0) throw new Error('No encontré la fila de títulos (Fecha, Referencia o Descripción…) en el archivo')
  const tit = filas[iT].map(norm)
  const col = (...nombres: string[]) => tit.findIndex(t => nombres.some(n => t === n || t.startsWith(n)))
  const cFecha = col('fecha'), cRef = col('referencia'), cConc = col('concepto', 'descripcion')
  const cCred = col('credito', 'abono', 'haber'), cDeb = col('debito', 'cargo', 'debe'), cMonto = col('monto')
  const cTipo = col('tipo')
  if (cCred < 0 && cMonto < 0) throw new Error('No encontré la columna del monto (Crédito o Monto)')
  const b = banco ?? detectarBanco(filas, nombreArchivo) ?? 'Desconocido'
  const movimientos: MovBanco[] = []
  for (const f of filas.slice(iT + 1)) {
    const fecha = fechaBanco(f[cFecha])
    if (!fecha) continue
    const concepto = cConc >= 0 ? f[cConc] : ''
    if (/saldo (final|inicial)/i.test(concepto)) continue
    let monto = cCred >= 0 ? numeroBanco(f[cCred]) : numeroBanco(f[cMonto])
    if (cCred < 0 && cTipo >= 0 && /^n?d/i.test(f[cTipo]) && !/^nc/i.test(f[cTipo])) monto = -Math.abs(monto)  // ND = débito
    if (cCred >= 0 && cDeb >= 0 && numeroBanco(f[cDeb]) > 0 && monto === 0) continue
    if (!(monto > 0)) continue
    movimientos.push({ banco: b, fecha, ref: cRef >= 0 ? digitos(f[cRef]) : '', concepto, monto: Math.round(monto * 100) / 100,
                       // "ABO.DRV…" (Provincial): transferencia desde otra cuenta del mismo banco.
                       emisor: emisorDe(concepto) ?? (/^ABO\.?\s*DRV/i.test(concepto) ? b : null) })
  }
  const fechas = movimientos.map(m => m.fecha).sort()
  return { banco: b, desde: fechas[0] ?? '', hasta: fechas.at(-1) ?? '', movimientos, filas: filas.length - iT - 1 }
}

// ── Cruce ────────────────────────────────────────────────────────────────────

export interface PagoME {
  id: number; venta: string
  banco_receptor: string | null; metodo_pago: string | null
  banco_emisor?: string | null      // desde qué banco dijo que pagó (cruza con la descripción, p. ej. Provincial)
  referencia: string | null; fecha_pago: string | null      // YYYY-MM-DD
  monto_pagado: number | null; total_orden: number | null
}

export type Nivel = 'seguro' | 'probable' | 'revisar' | 'no_aparece' | 'sin_estado'

export interface ResultadoPago {
  ventas: PagoME[]               // una o varias (varias ventas pagadas con la misma referencia)
  nivel: Nivel
  motivo: string
  mov: MovBanco | null
  diferencia: number | null      // banco − esperado
}

export interface ResultadoCruce {
  pagos: ResultadoPago[]
  embalajeSuelto: MovBanco[]     // créditos chicos (≤ margen) sin venta: embalaje mandado aparte
  sinPago: MovBanco[]            // créditos que no son de ninguna venta de Pagos ME
}

export interface OpcionesCruce {
  margenEmbalaje?: number        // Bs por venta que puede sumar el comprador (embalaje opcional). Default 700.
  diasAntes?: number             // el banco puede mostrar el pago hasta N días ANTES de la fecha que dijo (default 1)
  diasDespues?: number           // … o N días DESPUÉS (fines de semana, default 3)
}

const dia = (s: string) => Date.parse(s + 'T12:00:00Z') / 864e5
const bs = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** ¿Coinciden las referencias? Completa, o los últimos 6 (o 4 si una es corta) dígitos. 0 = no. */
function puntosRef(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 3
  const k = Math.min(6, a.length, b.length)
  if (k < 4 || a.slice(-k) !== b.slice(-k)) return 0
  return k === 6 ? 2 : 1
}

type Monto = 'exacto' | 'embalaje' | 'menos' | 'mas'
function compararMonto(banco: number, esperado: number, ventas: number, margen: number): Monto {
  const d = banco - esperado
  if (Math.abs(d) <= 1) return 'exacto'             // redondeos del comprador (8.146 por 8.145,45)
  if (d < 0) return 'menos'
  return d <= margen * ventas + 1 ? 'embalaje' : 'mas'
}

export function cruzarPagos(pagosEnt: PagoME[], estados: EstadoCuenta[], op: OpcionesCruce = {}): ResultadoCruce {
  const margen = op.margenEmbalaje ?? 700, antes = op.diasAntes ?? 1, despues = op.diasDespues ?? 3
  const movs = estados.flatMap(e => e.movimientos)
  // Cubierto = hay un estado de ese banco que abarca la fecha Y trae créditos ese día. Un día sin ningún crédito
  // dentro del rango casi siempre es un archivo incompleto (pasó con Banesco 17–18/10), no "no llegó nada".
  const diasConCredito = new Set(movs.map(m => `${m.banco}|${m.fecha}`))
  const cubre = (banco: string | null, fecha: string | null) =>
    !!banco && !!fecha && diasConCredito.has(`${banco}|${fecha}`)
      && estados.some(e => e.banco === banco && e.desde <= fecha && fecha <= e.hasta)

  // 1. Agrupar: varias ventas con la misma referencia (≥ 6 dígitos) y fecha cercana = un solo pago.
  type Grupo = { ventas: PagoME[]; ref: string; fecha: string | null; monto: number; banco: string | null; emisor: string | null }
  const grupos: Grupo[] = []
  for (const p of pagosEnt) {
    const ref = digitos(p.referencia), monto = Number(p.monto_pagado ?? p.total_orden ?? 0)
    const g = ref.length >= 6 ? grupos.find(x => x.ref === ref && x.banco === p.banco_receptor && x.fecha && p.fecha_pago
      && Math.abs(dia(x.fecha) - dia(p.fecha_pago)) <= 1) : undefined
    if (g) { g.ventas.push(p); g.monto = Math.round((g.monto + monto) * 100) / 100 }
    else grupos.push({ ventas: [p], ref, fecha: p.fecha_pago, monto, banco: p.banco_receptor, emisor: p.banco_emisor ?? null })
  }

  const enVentana = (g: Grupo, m: MovBanco) => {
    if (!g.fecha) return false
    const d = dia(m.fecha) - dia(g.fecha)
    return d >= -antes && d <= despues
  }

  // 2. Pares candidatos con puntaje; se asignan de mejor a peor (así un pago no le roba el crédito a otro que
  // calza mejor). Primero referencia + monto; después monto exacto y único; al final referencia con monto raro.
  const res = new Map<Grupo, ResultadoPago>()
  const usado = new Set<MovBanco>()
  const pares: { g: Grupo; m: MovBanco; puntos: number; monto: Monto; ref: number }[] = []
  for (const g of grupos) for (const m of movs) {
    if (!enVentana(g, m)) continue
    const ref = puntosRef(g.ref, m.ref), monto = compararMonto(m.monto, g.monto, g.ventas.length, margen)
    const cerca = -Math.abs(dia(m.fecha) - dia(g.fecha!)) * 0.1
    const mismoBanco = g.banco && m.banco === g.banco ? 0.5 : 0
    pares.push({ g, m, ref, monto, puntos: ref * 10 + (monto === 'exacto' ? 5 : monto === 'embalaje' ? 4 : 0) + mismoBanco + cerca })
  }
  pares.sort((a, b) => b.puntos - a.puntos)
  const asignar = (g: Grupo, m: MovBanco, nivel: Nivel, motivo: string) => {
    usado.add(m); res.set(g, { ventas: g.ventas, nivel, motivo, mov: m, diferencia: Math.round((m.monto - g.monto) * 100) / 100 })
  }
  const textoMonto = (p: { monto: Monto; m: MovBanco; g: Grupo }) => p.monto === 'exacto' ? 'monto exacto'
    : `llegó Bs ${bs(p.m.monto - p.g.monto)} de más (embalaje)`

  // 2a. Referencia + monto (exacto o con embalaje).
  for (const p of pares) {
    if (res.has(p.g) || usado.has(p.m) || !p.ref || (p.monto !== 'exacto' && p.monto !== 'embalaje')) continue
    asignar(p.g, p.m, 'seguro', `Referencia y ${textoMonto(p)}${p.m.banco !== p.g.banco && p.g.banco ? ` · llegó a ${p.m.banco}, no a ${p.g.banco}` : ''}`)
  }
  // 2b. Monto exacto (al céntimo) sin referencia: solo si es el ÚNICO crédito con ese monto en la ventana
  //     y el único pago pendiente con ese monto (si hay dos iguales, no se adivina).
  for (const g of grupos) {
    if (res.has(g)) continue
    const cands = movs.filter(m => !usado.has(m) && enVentana(g, m) && Math.abs(m.monto - g.monto) < 0.005)
    if (cands.length !== 1) continue
    const rivales = grupos.filter(x => x !== g && !res.has(x) && Math.abs(x.monto - g.monto) < 0.005 && enVentana(x, cands[0]))
    if (rivales.length) continue
    asignar(g, cands[0], 'probable', `Mismo monto y fecha, la referencia no coincide (el comprador la escribió distinta)`)
  }
  // 2b'. Sin referencia en el banco (Provincial): mismo banco de origen + monto (exacto o con embalaje) + fecha,
  //      y único con esas tres cosas.
  //      Solo contra pagos que dijeron ESE banco destino (o ninguno): un pago a otro banco no compite.
  //      Dos pagos idénticos (mismo comprador, dos ventas) contra dos créditos idénticos: uno a uno.
  const destinoOk = (g: Grupo, m: MovBanco) => !g.banco || g.banco === m.banco
  const calza = (g: Grupo, m: MovBanco) => !!g.emisor && m.emisor === g.emisor && destinoOk(g, m) && enVentana(g, m)
    && ['exacto', 'embalaje'].includes(compararMonto(m.monto, g.monto, g.ventas.length, margen))
  for (const g of grupos) {
    if (res.has(g) || !g.emisor) continue
    const cands = movs.filter(m => !usado.has(m) && calza(g, m))
    if (!cands.length) continue
    const rivales = grupos.filter(x => x !== g && !res.has(x) && cands.some(m => calza(x, m)))
    const gemelos = cands.every(m => Math.abs(m.monto - cands[0].monto) < 0.005)
      && rivales.every(x => Math.abs(x.monto - g.monto) < 0.005 && x.emisor === g.emisor)
    if (!(cands.length === 1 && !rivales.length) && !(gemelos && cands.length === rivales.length + 1)) continue
    const mo = compararMonto(cands[0].monto, g.monto, g.ventas.length, margen)
    asignar(g, cands[0], 'probable', `Mismo banco de origen (${g.emisor}), fecha y ${mo === 'exacto' ? 'monto exacto' : `monto + Bs ${bs(cands[0].monto - g.monto)} (embalaje)`}; el banco no muestra referencia`)
  }
  // 2c. Referencia sin monto que calce: para revisar.
  for (const p of pares) {
    if (res.has(p.g) || usado.has(p.m) || !p.ref) continue
    asignar(p.g, p.m, 'revisar', p.monto === 'menos'
      ? `Referencia OK pero llegó MENOS: Bs ${bs(p.m.monto)} de Bs ${bs(p.g.monto)}`
      : `Referencia OK pero llegó Bs ${bs(p.m.monto)} (esperado Bs ${bs(p.g.monto)}): ¿varias ventas juntas?`)
  }
  // 3. Lo que quedó sin crédito.
  for (const g of grupos) {
    if (res.has(g)) continue
    const nivel: Nivel = cubre(g.banco, g.fecha) ? 'no_aparece' : 'sin_estado'
    res.set(g, { ventas: g.ventas, nivel, mov: null, diferencia: null,
      motivo: nivel === 'no_aparece' ? `No está en ${g.banco} ni en los otros estados subidos`
        : !g.banco ? 'Transferencia sin banco destino: puede estar en un banco que no subiste'
        : estados.some(e => e.banco === g.banco) ? `El estado de ${g.banco} no trae movimientos del ${g.fecha ?? '—'} (¿archivo incompleto?)`
        : `Falta el estado de cuenta de ${g.banco}` })
  }
  const sobran = movs.filter(m => !usado.has(m))
  return {
    pagos: grupos.map(g => res.get(g)!),
    embalajeSuelto: sobran.filter(m => m.monto <= margen),
    sinPago: sobran.filter(m => m.monto > margen),
  }
}
