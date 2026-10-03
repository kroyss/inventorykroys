// Módulo Despachos: cliente del servicio de etiquetas, validación de etiquetas
// contra las ventas del sistema y archivos en disco.
//
// El armado del PDF y el manifiesto los hace el servicio Python `inventory_etiquetas`
// (services/etiquetas), que es el código de EtiquetasML/generar_manifiesto copiado
// tal cual. Aquí NUNCA se toca el contenido de un PDF: se guarda y se reenvía byte a
// byte (sha256 verificado), porque los códigos de barras se dañan con cualquier
// conversión.
import { createHash } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import type { Pool } from 'pg'
import type { Session } from 'next-auth'
import { NextResponse } from 'next/server'
import { tieneModulo } from '@/lib/modulos'
import { traerOrden } from '@/lib/calificacionesML'
import { leerNotas, unirNotas } from '@/lib/notasML'

const ETIQUETAS_URL = process.env.ETIQUETAS_URL ?? 'http://inventory_etiquetas:8000'
const UPLOAD_DIR    = process.env.UPLOAD_DIR ?? './uploads'
export const DESPACHOS_DIR = path.join(UPLOAD_DIR, 'despachos')

export const MAX_PDF_SIZE      = 2 * 1024 * 1024   // una etiqueta pesa ~8 KB
export const MAX_PDFS_POR_SUBIDA = 60               // el cliente parte subidas grandes en tandas
// Armar + verificar tarda ~0,25 s por etiqueta: 150 ≈ 40 s, por debajo del timeout
// del proxy (60 s). Lotes reales: 10-50.
export const MAX_POR_LOTE = 150
// Remitente del manifiesto y del Reportador cuando el PDF no lo trae: el configurado en
// la empresa (app_settings `despacho_remitente`) o, si no hay, el nombre de la empresa.
export async function remitenteConfigurado(db: Pick<Pool, 'query'>) {
  const { rows: [cfg] } = await db.query(
    `SELECT COALESCE(
       (SELECT NULLIF(TRIM(value), '') FROM app_settings WHERE key = 'despacho_remitente'),
       (SELECT nombre FROM empresas WHERE id = NULLIF(current_setting('app.empresa_id', true), '')::int)
     ) AS r`)
  return (cfg?.r as string | undefined)?.trim() || 'Remitente'
}

// Largo exigido de la guía FINAL de Tealca (la que genera Tealca, no la pre-guía de la etiqueta).
export const GUIA_TEALCA_DIGITOS_DEFAULT = 8
export async function digitosGuiaTealca(db: Pick<Pool, 'query'>) {
  const { rows: [cfg] } = await db.query(`SELECT value FROM app_settings WHERE key = 'tealca_guia_digitos'`)
  const n = parseInt((cfg?.value as string | undefined) ?? '', 10)
  return Number.isInteger(n) && n >= 4 && n <= 20 ? n : GUIA_TEALCA_DIGITOS_DEFAULT
}

// Estados de venta desde los que se puede imprimir (PROCESADA = normal,
// DESCARGADA = reimpresión, p.ej. ya salió por el flujo viejo de Excel).
const ESTADOS_IMPRIMIBLES = new Set(['PROCESADA', 'DESCARGADA'])

// El módulo es solo VE (etiquetas ZOOM de Mercado Envíos Venezuela).
export function despachosForbidden(session: Session) {
  if (session.user.country !== 'VE') {
    return NextResponse.json({ error: 'Despachos solo está disponible en Venezuela' }, { status: 403 })
  }
  if (!tieneModulo(session.user, 'despachos')) {
    return NextResponse.json({ error: 'Tu empresa no tiene el módulo Despachos' }, { status: 403 })
  }
  return null
}

// El panel del Reportador (dentro de Despachos) además pide su propio módulo.
export function reportadorForbidden(session: Session) {
  return despachosForbidden(session) ?? (tieneModulo(session.user, 'reportador')
    ? null
    : NextResponse.json({ error: 'Tu empresa no tiene el módulo Reportador' }, { status: 403 }))
}

// ── Servicio ────────────────────────────────────────────────────────────────
export class ServicioError extends Error {}

// Error del servicio → 502 con mensaje legible (el operador tiene que saber que no
// es culpa de sus PDFs). Cualquier otro error sigue a apiError.
export function respuestaServicio(err: unknown) {
  if (!(err instanceof ServicioError)) return null
  console.error('[DESPACHOS]', err.message)
  return NextResponse.json({ error: err.message }, { status: 502 })
}

async function llamar<T>(ruta: string, body: unknown, timeoutMs: number): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${ETIQUETAS_URL}${ruta}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    throw new ServicioError(`El servicio de etiquetas no responde (${(e as Error).message})`)
  }
  if (!res.ok) {
    const txt = await res.text()
    throw new ServicioError(`El servicio de etiquetas falló (${res.status}): ${txt.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

export interface EtiquetaLeida {
  carrier?: 'ZOOM' | 'TEALCA'
  paginas?: number
  venta?: string | null
  guia?: string | null
  remitente?: string | null
  destinatario?: string | null
  remitente_limpio?: string
  destinatario_limpio?: string
  error: string | null
}

// `nombres`: las etiquetas TEALCA no traen el número de venta, solo el nombre del archivo.
export function leerEtiquetas(pdfs: Buffer[], nombres: string[]) {
  return llamar<{ etiquetas: EtiquetaLeida[] }>(
    '/leer', { pdfs: pdfs.map(b => b.toString('base64')), nombres }, 60_000,
  ).then(r => r.etiquetas)
}

export interface FilaVenta { venta: string; producto: string; cantidad: number; nota: string }
export interface Verificacion { indice: number; esperados: number; faltan: string[] }

// `ventas`: la venta de cada PDF, en el mismo orden (las etiquetas TEALCA no la traen).
export async function armarLote(pdfs: Buffer[], filas: FilaVenta[], ventas: string[]) {
  const r = await llamar<{ pdf: string; paginas: number; verificacion: Verificacion[] }>(
    '/armar', { pdfs: pdfs.map(b => b.toString('base64')), filas, ventas }, 300_000,
  )
  return { pdf: Buffer.from(r.pdf, 'base64'), paginas: r.paginas, verificacion: r.verificacion }
}

export interface EnvioManifiesto { fecha: string; remitente: string; venta: string; guia: string; destinatario: string }

export type Transportista = 'ZOOM' | 'TEALCA'

export async function armarManifiesto(
  remitente: string, fechaHoy: string, envios: EnvioManifiesto[], transportista: Transportista,
) {
  const r = await llamar<{ pdf: string }>(
    '/manifiesto', { remitente, fecha_hoy: fechaHoy, envios, transportista }, 120_000,
  )
  return Buffer.from(r.pdf, 'base64')
}

// ── Archivos ────────────────────────────────────────────────────────────────
export const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

export async function guardarArchivo(sub: string, nombre: string, data: Buffer) {
  const dir = path.join(DESPACHOS_DIR, sub)
  await mkdir(dir, { recursive: true })
  const p = path.join(dir, nombre)
  await writeFile(p, data)
  return p
}

// Entrega un PDF generado TAL CUAL está en disco, como descarga (para abrirlo en el
// visor de siempre e imprimir a tamaño real, no en la vista previa del navegador).
export async function descargaPdf(filePath: string | null, nombre: string) {
  // Los PDF se borran a los 6 meses (lib/limpiezaDespachos.ts): en la base sigue todo.
  const data = filePath ? await readFile(filePath).catch(() => null) : null
  if (!data) {
    return NextResponse.json(
      { error: 'Este PDF ya no está guardado: los archivos de despacho se borran a los 6 meses.' }, { status: 410 })
  }
  return new NextResponse(data as unknown as BodyInit, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control':       'no-store',
    },
  })
}

// Lee un original y confirma que es el mismo archivo que se subió.
export async function leerOriginal(filePath: string, hash: string) {
  const data = await readFile(filePath)
  if (sha256(data) !== hash) throw new Error(`El archivo ${path.basename(filePath)} cambió desde que se subió`)
  return data
}

// ── Validación ──────────────────────────────────────────────────────────────
export type EstadoEtiqueta =
  | 'OK'            // lista para imprimir
  | 'REIMPRESION'   // venta DESCARGADA: se imprime, avisando
  | 'ERROR_PDF'     // no se pudo abrir
  | 'NO_ETIQUETA'   // sin número de venta o sin guía (ZOOM / TEALCA)
  | 'SIN_VENTA'     // la venta no está cargada en el sistema (o no está en ML, sin inventario)
  | 'ESTADO'        // venta en un estado que no se imprime (BORRADOR, etc.)
  | 'SIN_PRODUCTOS'
  | 'DUPLICADA'     // la misma guía dos veces en este lote
  | 'YA_IMPRESA'    // la guía ya salió en un lote generado

export const IMPRIMIBLE: Record<EstadoEtiqueta, boolean> = {
  OK: true, REIMPRESION: true,
  ERROR_PDF: false, NO_ETIQUETA: false, SIN_VENTA: false, ESTADO: false,
  SIN_PRODUCTOS: false, DUPLICADA: false, YA_IMPRESA: false,
}

export interface EtiquetaValidada {
  id: number
  original_name: string
  file_path: string
  sha256: string
  page_count: number | null
  carrier: 'ZOOM' | 'TEALCA'
  venta: string | null
  guia: string | null
  remitente: string | null
  remitente_limpio: string | null
  destinatario: string | null
  incluida: boolean
  impresa: boolean
  sale_id: number | null
  sale_status: string | null
  customer_name: string | null
  sale_notes: string | null
  items: { product_name: string; quantity: number; notes: string | null }[]
  /** Sin inventario: la venta de ML que se encontró (sale_id queda null). */
  orden_ml?: string | null
  estado: EstadoEtiqueta
  detalle: string | null
}

// Número de venta de la etiqueta como BIGINT (NULL si no es un número): para cruzar con ml_ordenes.
const VENTA_NUM = `CASE WHEN e.venta ~ '^[0-9]{1,18}$' THEN e.venta::bigint END`

// ── Empresas sin inventario: las ventas salen de MercadoLibre ───────────────────
// Misma forma que las ventas del sistema (product_name, quantity, notes, customer_name,
// sale_notes), así el armado, el manifiesto, las jornadas y el Reportador no cambian.
// Producto = título tal cual en ML (+ variante); nota = las notas de la venta en ML (se
// escriben allá, aquí no se editan).
const SQL_DESDE_ML = `
  SELECT e.id, e.original_name, e.file_path, e.sha256, e.page_count, e.carrier, e.venta, e.guia,
         e.remitente, e.remitente_limpio, e.destinatario, e.read_error,
         e.incluida, e.impresa,
         NULL::int AS sale_id, o.estado AS sale_status, o.comprador AS customer_name, o.notas AS sale_notes,
         o.id::text AS orden_ml,
         COALESCE((
           SELECT JSON_AGG(JSON_BUILD_OBJECT(
                    'product_name', (d->>'titulo') || COALESCE(' (' || (d->>'variante') || ')', ''),
                    'quantity', (d->>'cantidad')::int, 'notes', NULL))
           FROM jsonb_array_elements(o.detalle) d
         ), '[]'::json) AS items,
         EXISTS (
           SELECT 1 FROM despacho_etiquetas p
           WHERE p.venta = e.venta AND p.impresa AND p.id <> e.id
         ) AS venta_ya_impresa,
         EXISTS (
           SELECT 1 FROM despacho_etiquetas o2
           WHERE o2.guia = e.guia AND o2.impresa AND o2.id <> e.id
         ) AS ya_impresa,
         (SELECT MIN(d.id) FROM despacho_etiquetas d
           WHERE d.lote_id = e.lote_id AND d.guia = e.guia) AS primera_con_guia
  FROM despacho_etiquetas e
  LEFT JOIN LATERAL (
    SELECT id, estado, comprador, notas, detalle FROM ml_ordenes
    WHERE id = ${VENTA_NUM} OR pack_id = ${VENTA_NUM}
    ORDER BY (id = ${VENTA_NUM}) DESC LIMIT 1
  ) o ON TRUE
  WHERE e.lote_id = $1
  ORDER BY e.original_name, e.id`

/** Antes de validar un lote sin inventario: trae de ML las ventas de las etiquetas que todavía
 *  no llegaron con la sincronización (cada 30 min) y relee sus notas si tienen más de 2 min.
 *  Nunca hace fallar la vista: lo que no se pudo traer queda como estaba. */
export async function refrescarVentasML(db: Pool, loteId: number) {
  const { rows } = await db.query(
    `SELECT DISTINCT e.venta, o.conexion_id, (o.notas_at IS NULL OR o.notas_at < NOW() - INTERVAL '2 minutes') AS releer
     FROM despacho_etiquetas e
     LEFT JOIN ml_ordenes o ON o.id = ${VENTA_NUM}
     WHERE e.lote_id = $1 AND e.venta ~ '^[0-9]{1,18}$'`, [loteId])
  const { rows: cuentas } = await db.query(`SELECT id FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
  const pendientes = rows.filter(r => !r.conexion_id || r.releer) as { venta: string; conexion_id: number | null }[]
  const uno = async (r: { venta: string; conexion_id: number | null }) => {
    let conexion = r.conexion_id
    if (!conexion) {
      for (const c of cuentas) if (await traerOrden(db, c.id, r.venta)) { conexion = c.id; break }
      if (!conexion) return
    }
    const { notas, error } = await leerNotas(db, conexion, r.venta)
    if (!error) await db.query(
      `UPDATE ml_ordenes SET notas = $2, notas_at = NOW() WHERE id = $1::bigint`, [r.venta, unirNotas(notas)])
  }
  // De a 6 a la vez (ML limita); cada una con su propio manejo de errores.
  for (let i = 0; i < pendientes.length; i += 6) {
    await Promise.all(pendientes.slice(i, i + 6).map(r => uno(r).catch(e => console.error('[despachos ML]', r.venta, e))))
  }
}

// Etiquetas de un lote con su estado calculado contra las ventas ACTUALES
// (por eso "Revalidar" es simplemente volver a pedir el lote).
// desdeML: la empresa no lleva inventario → las ventas son las de MercadoLibre (ver SQL_DESDE_ML).
export async function etiquetasValidadas(db: Pool, loteId: number, desdeML = false): Promise<EtiquetaValidada[]> {
  if (desdeML) return validarDesdeML(db, loteId)
  const { rows } = await db.query(
    `SELECT e.id, e.original_name, e.file_path, e.sha256, e.page_count, e.carrier, e.venta, e.guia,
            e.remitente, e.remitente_limpio, e.destinatario, e.read_error,
            e.incluida, e.impresa,
            s.id AS sale_id, s.status AS sale_status, s.customer_name, s.notes AS sale_notes,
            COALESCE((
              SELECT JSON_AGG(JSON_BUILD_OBJECT(
                       'product_name', p.name, 'quantity', si.quantity, 'notes', si.notes
                     ) ORDER BY si.id)
              FROM sale_items si JOIN products p ON p.id = si.product_id
              WHERE si.sale_id = s.id
            ), '[]'::json) AS items,
            EXISTS (
              SELECT 1 FROM despacho_etiquetas o
              WHERE o.guia = e.guia AND o.impresa AND o.id <> e.id
            ) AS ya_impresa,
            (SELECT MIN(d.id) FROM despacho_etiquetas d
              WHERE d.lote_id = e.lote_id AND d.guia = e.guia) AS primera_con_guia
     FROM despacho_etiquetas e
     LEFT JOIN LATERAL (
       SELECT id, status, customer_name, notes FROM sales
       WHERE ml_order_number = e.venta ORDER BY id DESC LIMIT 1
     ) s ON TRUE
     WHERE e.lote_id = $1
     ORDER BY e.original_name, e.id`,
    [loteId],
  )

  return rows.map(r => {
    let estado: EstadoEtiqueta = 'OK'
    let detalle: string | null = null
    if (r.read_error)                          { estado = 'ERROR_PDF';   detalle = r.read_error }
    else if (!r.venta || !r.guia)              {
      estado = 'NO_ETIQUETA'
      detalle = !r.venta
        ? (r.carrier === 'TEALCA'
            ? 'Etiqueta TEALCA sin número de venta en el nombre del archivo (debe llamarse guide-2000….pdf)'
            : 'No tiene número de venta')
        : `No tiene guía ${r.carrier}`
    }
    else if (r.impresa)                        { estado = 'OK' }
    else if (r.ya_impresa)                     { estado = 'YA_IMPRESA';  detalle = `La guía ${r.guia} ya se imprimió en otro lote` }
    else if (r.primera_con_guia !== r.id)      { estado = 'DUPLICADA';   detalle = 'La misma guía está dos veces en este lote' }
    else if (!r.sale_id)                       { estado = 'SIN_VENTA';   detalle = `La venta ${r.venta} no está cargada en el sistema` }
    else if (!ESTADOS_IMPRIMIBLES.has(r.sale_status)) { estado = 'ESTADO'; detalle = `La venta está en ${r.sale_status}; debe estar PROCESADA` }
    else if (r.items.length === 0)             { estado = 'SIN_PRODUCTOS'; detalle = 'La venta no tiene productos' }
    else if (r.sale_status === 'DESCARGADA')   { estado = 'REIMPRESION'; detalle = 'La venta ya estaba DESCARGADA' }

    if (estado === 'OK' && r.page_count > 1) detalle = `El PDF tiene ${r.page_count} páginas: se usa solo la primera`

    const out = { ...r, estado, detalle }
    delete out.read_error; delete out.ya_impresa; delete out.primera_con_guia
    return out as EtiquetaValidada
  })
}

async function validarDesdeML(db: Pool, loteId: number): Promise<EtiquetaValidada[]> {
  const { rows } = await db.query(SQL_DESDE_ML, [loteId])
  return rows.map(r => {
    let estado: EstadoEtiqueta = 'OK'
    let detalle: string | null = null
    if (r.read_error)                          { estado = 'ERROR_PDF';   detalle = r.read_error }
    else if (!r.venta || !r.guia)              {
      estado = 'NO_ETIQUETA'
      detalle = !r.venta
        ? (r.carrier === 'TEALCA'
            ? 'Etiqueta TEALCA sin número de venta en el nombre del archivo (debe llamarse guide-2000….pdf)'
            : 'No tiene número de venta')
        : `No tiene guía ${r.carrier}`
    }
    else if (r.impresa)                        { estado = 'OK' }
    else if (r.ya_impresa)                     { estado = 'YA_IMPRESA';  detalle = `La guía ${r.guia} ya se imprimió en otro lote` }
    else if (r.primera_con_guia !== r.id)      { estado = 'DUPLICADA';   detalle = 'La misma guía está dos veces en este lote' }
    else if (!r.orden_ml)                      { estado = 'SIN_VENTA';   detalle = `La venta ${r.venta} no está en las ventas de MercadoLibre de tus cuentas conectadas` }
    else if (r.sale_status === 'cancelled')    { estado = 'ESTADO';      detalle = 'La venta está cancelada en MercadoLibre' }
    else if (r.items.length === 0)             { estado = 'SIN_PRODUCTOS'; detalle = 'MercadoLibre no trajo los productos de la venta' }
    else if (r.venta_ya_impresa)               { estado = 'REIMPRESION'; detalle = 'Esta venta ya salió en otro lote' }

    if (estado === 'OK' && r.page_count > 1) detalle = `El PDF tiene ${r.page_count} páginas: se usa solo la primera`

    const out = { ...r, estado, detalle }
    delete out.read_error; delete out.ya_impresa; delete out.primera_con_guia; delete out.venta_ya_impresa
    return out as EtiquetaValidada
  })
}

// Filas para el armado: una por producto de cada VENTA (no por etiqueta), con la nota
// de la venta (o del ítem), igual que el export de datos.xlsx. Si una venta viene en
// dos etiquetas (dos bultos), sus productos van una sola vez: si no, el armado los
// acumularía y cada etiqueta mostraría las líneas repetidas.
export function filasDeVentas(etiquetas: EtiquetaValidada[]): FilaVenta[] {
  const vistas = new Set<string>()
  const filas: FilaVenta[] = []
  for (const e of etiquetas) {
    if (!e.venta || vistas.has(e.venta)) continue
    vistas.add(e.venta)
    for (const i of e.items) {
      filas.push({ venta: e.venta, producto: i.product_name, cantidad: i.quantity, nota: e.sale_notes || i.notes || '' })
    }
  }
  return filas
}

// Error de Postgres por guía duplicada (índice uq_despacho_guia_impresa)
export const esGuiaDuplicada = (err: unknown) =>
  (err as { code?: string; constraint?: string })?.code === '23505'
