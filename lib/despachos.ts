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

const ETIQUETAS_URL = process.env.ETIQUETAS_URL ?? 'http://inventory_etiquetas:8000'
const UPLOAD_DIR    = process.env.UPLOAD_DIR ?? './uploads'
export const DESPACHOS_DIR = path.join(UPLOAD_DIR, 'despachos')

export const MAX_PDF_SIZE      = 2 * 1024 * 1024   // una etiqueta pesa ~8 KB
export const MAX_PDFS_POR_SUBIDA = 60               // el cliente parte subidas grandes en tandas
// Armar + verificar tarda ~0,25 s por etiqueta: 150 ≈ 40 s, por debajo del timeout
// del proxy (60 s). Lotes reales: 10-50.
export const MAX_POR_LOTE = 150
// Remitente cuando el PDF no lo trae (mismo fallback que REMITENTE_DEFAULT del script).
export const REMITENTE_DEFAULT = 'Marcos Contreras'

export async function remitenteConfigurado(db: Pick<Pool, 'query'>) {
  const { rows: [cfg] } = await db.query(
    `SELECT value FROM app_settings WHERE key = 'despacho_remitente'`)
  return (cfg?.value as string | undefined)?.trim() || REMITENTE_DEFAULT
}

// Estados de venta desde los que se puede imprimir (PROCESADA = normal,
// DESCARGADA = reimpresión, p.ej. ya salió por el flujo viejo de Excel).
const ESTADOS_IMPRIMIBLES = new Set(['PROCESADA', 'DESCARGADA'])

// El módulo es solo VE (etiquetas ZOOM de Mercado Envíos Venezuela).
export function despachosForbidden(session: Session) {
  if (session.user.country !== 'VE') {
    return NextResponse.json({ error: 'Despachos solo está disponible en Venezuela' }, { status: 403 })
  }
  return null
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
  paginas?: number
  venta?: string | null
  guia?: string | null
  remitente?: string | null
  destinatario?: string | null
  remitente_limpio?: string
  destinatario_limpio?: string
  error: string | null
}

export function leerEtiquetas(pdfs: Buffer[]) {
  return llamar<{ etiquetas: EtiquetaLeida[] }>(
    '/leer', { pdfs: pdfs.map(b => b.toString('base64')) }, 60_000,
  ).then(r => r.etiquetas)
}

export interface FilaVenta { venta: string; producto: string; cantidad: number; nota: string }
export interface Verificacion { indice: number; esperados: number; faltan: string[] }

export async function armarLote(pdfs: Buffer[], filas: FilaVenta[]) {
  const r = await llamar<{ pdf: string; paginas: number; verificacion: Verificacion[] }>(
    '/armar', { pdfs: pdfs.map(b => b.toString('base64')), filas }, 300_000,
  )
  return { pdf: Buffer.from(r.pdf, 'base64'), paginas: r.paginas, verificacion: r.verificacion }
}

export interface EnvioManifiesto { fecha: string; remitente: string; venta: string; guia: string; destinatario: string }

export async function armarManifiesto(remitente: string, fechaHoy: string, envios: EnvioManifiesto[]) {
  const r = await llamar<{ pdf: string }>(
    '/manifiesto', { remitente, fecha_hoy: fechaHoy, envios }, 120_000,
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
export async function descargaPdf(filePath: string, nombre: string) {
  const data = await readFile(filePath)
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
  | 'NO_ETIQUETA'   // sin número de venta o sin guía ZOOM
  | 'SIN_VENTA'     // la venta no está cargada en el sistema
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
  estado: EstadoEtiqueta
  detalle: string | null
}

// Etiquetas de un lote con su estado calculado contra las ventas ACTUALES
// (por eso "Revalidar" es simplemente volver a pedir el lote).
export async function etiquetasValidadas(db: Pool, loteId: number): Promise<EtiquetaValidada[]> {
  const { rows } = await db.query(
    `SELECT e.id, e.original_name, e.file_path, e.sha256, e.page_count, e.venta, e.guia,
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
    else if (!r.venta || !r.guia)              { estado = 'NO_ETIQUETA'; detalle = !r.venta ? 'No tiene número de venta' : 'No tiene guía ZOOM' }
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
