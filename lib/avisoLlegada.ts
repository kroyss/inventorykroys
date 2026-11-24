// «Entró mercancía» (24-11): las pantallas que cargan mercancía al inventario (recibir/finalizar compras e importaciones,
// entradas y ajustes) llaman avisarLlegada() al terminar bien; components/layout/AvisoLlegada.tsx pregunta si alguna
// publicación pausada o en 0 en ML ya tiene inventario y, si hay, lo avisa con «Activarlas →».
export const EVENTO_LLEGADA = 'llegada-mercancia'

export function avisarLlegada() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_LLEGADA))
}
