// Chip de la situación de la publicación en MercadoLibre (17-10): activa, agotada o pausada a mano.
// Sale del catálogo que ya se trae de ML (lib/promocionesSesion.ts → sqlSituacion).
export type Situacion = 'activa' | 'agotada' | 'pausada' | 'pausada_ml' | null | undefined

const ESTILO: Record<string, { t: string; c: string; title: string }> = {
  activa: { t: '● Activa', c: 'text-emerald-700 ring-emerald-200 bg-emerald-50', title: 'Publicada y a la venta en MercadoLibre' },
  agotada: { t: '● Agotada', c: 'text-red-700 ring-red-200 bg-red-50', title: 'Pausada por MercadoLibre porque se quedó sin stock' },
  pausada: { t: '⏸ Pausada', c: 'text-amber-800 ring-amber-300 bg-amber-50', title: 'Pausada por el vendedor (tiene stock): no está a la venta' },
  pausada_ml: { t: '⏸ Pausada', c: 'text-amber-800 ring-amber-300 bg-amber-50', title: 'Pausada en MercadoLibre' },
}

export default function SituacionChip({ s }: { s: Situacion }) {
  const e = s ? ESTILO[s] : null
  if (!e) return null
  return <span title={e.title} className={`text-[11px] rounded-full px-2 py-0.5 ring-1 ring-inset whitespace-nowrap ${e.c}`}>{e.t}</span>
}
