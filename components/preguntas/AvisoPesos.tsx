// Aviso "⚠ Vinculada a 2 productos (0,6 kg y 3 kg)" (21-10): la publicación está unida a productos de distinto
// peso y el envío gratis cambia según cuál (lib/mlShipping.ts, conflictoPesos). Se corrige en Vincular con ML.
import { textoConflicto, type ConflictoPesos } from '@/lib/mlShipping'

export default function AvisoPesos({ c }: { c: ConflictoPesos | null | undefined }) {
  if (!c) return null
  const t = textoConflicto(c)
  return (
    <span title={t.detalle}
      className="text-[11px] rounded-full px-2 py-0.5 ring-1 ring-inset whitespace-nowrap text-amber-900 bg-amber-50 ring-amber-300 font-semibold">
      {t.corto}
    </span>
  )
}
