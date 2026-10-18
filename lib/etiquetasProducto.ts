// Etiquetas de producto (18-10): PDF con UNA PÁGINA POR ETIQUETA, del tamaño exacto del rollo térmico
// (50×25 o 57×32 mm). Así la impresora saca una etiqueta por página, sin acomodar ni recortar nada.
// Contenido: el código COD (único, no cambia, igual en todas las cuentas de ML), el nombre de inventario
// y el código de barras Code 128 del COD (lo lee cualquier pistola USB). Corre en el navegador.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'

import { TAMANOS, type TamanoEtiqueta } from './etiquetasTamanos'
export { TAMANOS, type TamanoEtiqueta }

export interface EtiquetaProducto { code: string; name: string; copias: number }

// ── Code 128 (juego B: letras, números y símbolos ASCII) ──────────────────────
// Anchos de barra/espacio de cada símbolo (0–106), del estándar.
const PATRONES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]
const START_B = 104, STOP = 106

/** Módulos (anchos alternados barra, espacio, barra…) del texto en Code 128 B. */
export function code128(texto: string): number[] {
  const valores = [...texto].map(c => {
    const v = c.charCodeAt(0) - 32
    if (v < 0 || v > 94) throw new Error(`Carácter no válido para el código de barras: ${c}`)
    return v
  })
  const check = valores.reduce((s, v, i) => s + v * (i + 1), START_B) % 103
  return [START_B, ...valores, check, STOP].flatMap(v => [...PATRONES[v]].map(Number))
}

// Helvetica estándar del PDF (WinAnsi): acentos y ñ sí; lo demás (emojis, comillas raras) se cambia.
const limpiar = (t: string) => t.normalize('NFC')
  .replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/×/g, 'x')
  .replace(/[^\x20-\x7E -ÿ]/g, '').replace(/\s+/g, ' ').trim()

/** Corta el texto en hasta `max` líneas que entran en `ancho` (pt); la última con "…" si sobra. */
function lineas(texto: string, font: PDFFont, size: number, ancho: number, max: number) {
  const palabras = texto.split(' ')
  const out: string[] = []
  let linea = ''
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p
    if (font.widthOfTextAtSize(prueba, size) <= ancho) { linea = prueba; continue }
    if (linea) out.push(linea)
    linea = p
    if (out.length === max) break
  }
  if (out.length < max && linea) out.push(linea)
  const usadas = out.slice(0, max)
  const sobra = usadas.join(' ').length < texto.length
  if (sobra && usadas.length) {
    let ult = usadas[usadas.length - 1]
    while (ult && font.widthOfTextAtSize(`${ult}…`, size) > ancho) ult = ult.slice(0, -1)
    usadas[usadas.length - 1] = `${ult.trimEnd()}…`
  }
  return usadas
}

const MM = 72 / 25.4

export async function pdfEtiquetas(etiquetas: EtiquetaProducto[], tamano: TamanoEtiqueta): Promise<Uint8Array> {
  const { ancho, alto } = TAMANOS[tamano]
  const grande = tamano === '57x32'
  const pdf = await PDFDocument.create()
  pdf.setTitle('Etiquetas de productos')
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold)
  const normal = await pdf.embedFont(StandardFonts.Helvetica)
  const W = ancho * MM, H = alto * MM
  const margen = 1.6 * MM
  const tamCodigo = grande ? 13 : 11
  const tamNombre = grande ? 7 : 6
  const maxLineas = grande ? 3 : 2
  const altoBarras = (grande ? 14 : 10) * MM
  // Módulo de 0,25 mm = 2 puntos exactos en impresoras de 203 dpi (y 3 en las de 300): barras parejas.
  const modulo = 0.25 * MM

  for (const e of etiquetas) {
    const code = limpiar(e.code)
    const nombre = limpiar(e.name)
    const modulos = code128(code)
    const total = modulos.reduce((s, m) => s + m, 0)
    // Si no entra (código largo), se achica el módulo hasta caber con 2 mm de aire a cada lado.
    const m = Math.min(modulo, (W - 2 * margen - 4 * MM) / total)
    for (let c = 0; c < Math.max(1, e.copias); c++) {
      const page = pdf.addPage([W, H])
      // COD arriba, grande
      const yCodigo = H - margen - tamCodigo * 0.78
      page.drawText(code, { x: margen, y: yCodigo, size: tamCodigo, font: negrita, color: rgb(0, 0, 0) })
      // Nombre de inventario
      let y = yCodigo - tamNombre * 1.25
      for (const l of lineas(nombre, normal, tamNombre, W - 2 * margen, maxLineas)) {
        page.drawText(l, { x: margen, y, size: tamNombre, font: normal, color: rgb(0, 0, 0) })
        y -= tamNombre * 1.15
      }
      // Código de barras abajo, centrado
      let x = (W - total * m) / 2
      modulos.forEach((anchoMod, i) => {
        if (i % 2 === 0) page.drawRectangle({ x, y: margen, width: anchoMod * m, height: altoBarras, color: rgb(0, 0, 0) })
        x += anchoMod * m
      })
    }
  }
  return pdf.save()
}

/** Descarga el PDF en el navegador. */
export function descargarPdf(bytes: Uint8Array, nombre: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url; a.download = nombre
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
