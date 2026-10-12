import Link from 'next/link'

/** Inicio: productos importados desde MercadoLibre con el stock sin verificar (lib/importarML.ts). */
export default function AvisoStockVerificar({ n }: { n: number }) {
  if (!n) return null
  return (
    <Link href="/inventario?verificar=1"
      className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-sm transition-colors hover:border-amber-300">
      <span className="flex items-center gap-2 text-amber-900">
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
        <span><b className="num">{n}</b> {n === 1 ? 'producto tiene' : 'productos tienen'} el stock que dijo MercadoLibre, sin verificar</span>
      </span>
      <span className="shrink-0 text-xs font-medium text-amber-800">Revisar →</span>
    </Link>
  )
}
