// Grupos de Stock en ML (17-11, el dueño: «nos llenamos de opciones»). Cada producto cae en UN solo grupo, por
// prioridad: Vende de más → Tienes y no vendes → Para decidir → Por ajustar. Lo usan la pantalla (tarjetas), el
// numerito del menú y los avisos de Telegram (lib/vendeDeMas.ts), así nunca dicen cosas distintas. Sin imports de
// servidor: también corre en el navegador.
import type { FilaStockML } from '@/lib/stockConML'

export type GrupoStock = 'vende' | 'sinpub' | 'decidir' | 'ajustar'

/** Cuánto cambia en ML con lo sugerido (publicaciones activas o que se reactivan): «ML 5 → quedará 2». */
export const cambioML = (f: FilaStockML) => {
  const ps = f.pubs.filter(p => p.objetivo != null && (p.objetivo !== p.ml_disponible || p.reactivar))
  return { pubs: ps.length, antes: ps.reduce((s, p) => s + (p.ml_disponible ?? 0), 0), despues: ps.reduce((s, p) => s + (p.objetivo ?? 0), 0) }
}

/** Qué tan urgente es dentro de su grupo (mayor = arriba). */
export const urgencia = (f: FilaStockML): number => {
  switch (grupoDe(f)) {
    case 'vende': return (f.vende === 'sin' ? 1e6 : 0) + f.ofrece - f.disponible
    case 'sinpub': return f.disponible
    case 'ajustar': { const c = cambioML(f); return Math.abs(c.antes - c.despues) * 10 + c.pubs }
    default: return 0
  }
}

/** Hay disponible y ninguna publicación activa lo ofrece (todas pausadas, a mano o no, o en 0). «No sincronizar» no cuenta. */
export const sinPublicar = (f: FilaStockML) => !f.sin_fisico && f.disponible > 0
  && f.pubs.some(p => !p.sin_sincronizar && p.estado != null)
  && !f.pubs.some(p => p.estado === 'active' && (p.ml_disponible ?? 0) > 0)   // la vinculada entera con variantes también vende

/** Lo que el sistema no resuelve solo (cada uno se muestra como etiqueta en la fila). */
export const motivosDecidir = (f: FilaStockML) => [
  ...(f.en_reserva && f.diferencia ? ['Quedan pocas: elige a mano'] : []),
  ...(f.pubs.some(p => p.bloqueada_envio) ? ['Al reactivar queda sin envío gratis'] : []),
  ...(f.pubs.some(p => p.posible_combo) ? ['¿Pack o combo?'] : []),
]

// 17-11 (el dueño, Envoplast): «Vende de más» = lo que ofrecen las publicaciones ACTIVAS (f.vende). Las pausadas no
// venden: si guardan unidades, se bajan con el reparto («Por ajustar»/«Para decidir»), sin alarma roja.
export const grupoDe = (f: FilaStockML): GrupoStock | null =>
  f.vende ? 'vende' : sinPublicar(f) ? 'sinpub' : motivosDecidir(f).length ? 'decidir' : f.diferencia ? 'ajustar' : null
