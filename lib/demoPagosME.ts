// Archivos de la DEMO de Pagos ME (19-10): el comprobante de pago y la guía de cada pago sembrado
// (lib/demoDatos.ts → pagosME) se dibujan al pedirlos, sin archivos en disco. me_pagos guarda
// comprobante_path / guia_path = 'demo:comprobante' / 'demo:guia'.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const esArchivoDemo = (p: string) => p.startsWith('demo:')

interface PagoDemo {
  venta: string; banco_emisor: string | null; banco_receptor: string | null; referencia: string | null
  fecha_pago: string | null; monto_pagado: number | null; metodo_pago: string | null
  carrier: string | null; guia: string | null; envio_opcion: string | null; cuenta: string | null
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const bs = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ddmmyyyy = (f: string | null) => (f ?? '').split('-').reverse().join('/')

/** Comprobante de pago móvil / transferencia como lo comparte un comprador (captura del banco). */
export function comprobanteDemo(p: PagoDemo): { tipo: string; datos: Buffer } {
  const color = ({ Banesco: '#00843D', Mercantil: '#0B4EA2', Venezuela: '#C8102E', 'BBVA Provincial': '#004481', BNC: '#F2A900' } as Record<string, string>)[p.banco_emisor ?? ''] ?? '#334155'
  const titulo = p.metodo_pago === 'transfer' ? 'Transferencia exitosa' : 'Pago Móvil exitoso'
  const filas: [string, string][] = [
    ['Monto', `Bs. ${bs(p.monto_pagado ?? 0)}`],
    ['Banco destino', p.banco_receptor ?? ''],
    ['Teléfono destino', '0414-***-**27'],
    ['Referencia', p.referencia ?? ''],
    ['Fecha', ddmmyyyy(p.fecha_pago)],
    ['Concepto', `Pago orden ${p.venta.slice(-6)}`],
  ]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="560" viewBox="0 0 360 560" font-family="Arial, Helvetica, sans-serif">
  <rect width="360" height="560" fill="#f4f5f7"/>
  <rect width="360" height="92" fill="${color}"/>
  <text x="20" y="40" fill="#fff" font-size="20" font-weight="700">${esc(p.banco_emisor ?? 'Banco')}</text>
  <text x="20" y="66" fill="#fff" font-size="13" opacity=".85">Comprobante de operación</text>
  <circle cx="180" cy="140" r="30" fill="#16a34a"/>
  <path d="M166 140 l10 10 l20 -22" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="180" y="200" text-anchor="middle" font-size="18" font-weight="700" fill="#111">${titulo}</text>
  <rect x="20" y="220" width="320" height="${filas.length * 46 + 14}" rx="12" fill="#fff"/>
  ${filas.map(([k, v], i) => `<text x="36" y="${252 + i * 46}" font-size="12" fill="#6b7280">${esc(k)}</text>
  <text x="324" y="${252 + i * 46}" font-size="14" font-weight="700" fill="#111" text-anchor="end">${esc(v)}</text>`).join('\n  ')}
  <text x="180" y="540" text-anchor="middle" font-size="11" fill="#9ca3af">Ejemplo de demostración · El Comerciante Digital</text>
</svg>`
  return { tipo: 'image/svg+xml', datos: Buffer.from(svg) }
}

/** Guía de MercadoEnvíos (ZOOM / TEALCA) de ejemplo, 10 × 15 cm. */
export async function guiaDemo(p: PagoDemo): Promise<{ tipo: string; datos: Buffer }> {
  const MM = 72 / 25.4
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([100 * MM, 150 * MM])
  const f = await pdf.embedFont(StandardFonts.Helvetica), fb = await pdf.embedFont(StandardFonts.HelveticaBold)
  const W = 100 * MM, H = 150 * MM
  const zoom = (p.carrier ?? '').toUpperCase() === 'ZOOM'
  page.drawRectangle({ x: 0, y: H - 22 * MM, width: W, height: 22 * MM, color: zoom ? rgb(0.95, 0.45, 0.1) : rgb(0.1, 0.35, 0.7) })
  page.drawText(zoom ? 'ZOOM' : 'TEALCA', { x: 6 * MM, y: H - 15 * MM, size: 26, font: fb, color: rgb(1, 1, 1) })
  page.drawText('MercadoEnvíos'.replace('í', 'i'), { x: 60 * MM, y: H - 14 * MM, size: 11, font: f, color: rgb(1, 1, 1) })
  const linea = (y: number, k: string, v: string, size = 11) => {
    page.drawText(k, { x: 6 * MM, y, size: 8, font: f, color: rgb(0.4, 0.4, 0.4) })
    page.drawText(v, { x: 6 * MM, y: y - size - 2, size, font: fb })
  }
  linea(H - 32 * MM, 'GUÍA'.replace('Í', 'I'), p.guia ?? '', 20)
  linea(H - 50 * MM, 'VENTA', p.venta)
  linea(H - 62 * MM, 'REMITENTE', p.cuenta ?? 'Tecnova Store')
  linea(H - 74 * MM, 'ENTREGA', p.envio_opcion ?? 'Retiro en agencia')
  // Código de barras de adorno (no se escanea en la demo).
  let x = 8 * MM
  for (const c of (p.guia ?? '0').repeat(4)) {
    const w = (1 + (c.charCodeAt(0) % 3)) * 0.5 * MM
    page.drawRectangle({ x, y: 22 * MM, width: w, height: 22 * MM, color: rgb(0, 0, 0) })
    x += w + 0.7 * MM
    if (x > W - 10 * MM) break
  }
  page.drawText('Ejemplo de demostración', { x: 6 * MM, y: 10 * MM, size: 8, font: f, color: rgb(0.5, 0.5, 0.5) })
  return { tipo: 'application/pdf', datos: Buffer.from(await pdf.save()) }
}
