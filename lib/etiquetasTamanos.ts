// Tamaños de rollo de las etiquetas de producto (aparte de lib/etiquetasProducto.ts para no cargar pdf-lib
// en la pantalla: el PDF se genera recién al tocar "Descargar PDF").
export type TamanoEtiqueta = '50x25' | '57x32'
export const TAMANOS: Record<TamanoEtiqueta, { ancho: number; alto: number; nombre: string }> = {
  '50x25': { ancho: 50, alto: 25, nombre: '50 × 25 mm' },
  '57x32': { ancho: 57, alto: 32, nombre: '57 × 32 mm' },
}
