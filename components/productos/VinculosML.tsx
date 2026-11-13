// Códigos MLV del producto en la ficha y el formulario (13-11-2026, el dueño): SOLO LECTURA. Los vínculos se hacen en un
// solo lugar, Publicaciones → Vincular (el formulario editaba solo el primer código por cuenta y podía desarmar variantes).
import Link from '@/components/ui/Link'
import type { MLCode } from '@/lib/types'

export default function VinculosML({ codes, productCode, creando = false }: {
  codes: MLCode[]; productCode?: string; creando?: boolean
}) {
  return (
    <div className="space-y-2">
      {codes.length > 0 ? (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {codes.map((ml, i) => {
            const [item, variante] = ml.code.split(':')
            const id = /^\d+$/.test(item) ? `MLV${item}` : item
            return (
              <li key={`${ml.account}-${ml.code}-${i}`} className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5">
                <p className="text-[11px] font-mono text-neutral-500">{ml.account}</p>
                <p className="truncate text-sm font-mono text-neutral-800" title={ml.code}>
                  {id}
                  {variante && <span className="ml-1 text-[11px] text-neutral-500">· variante</span>}
                  {(ml.unidades ?? 1) > 1 && <span className="ml-1 text-[11px] text-amber-700">· trae {ml.unidades} u.</span>}
                </p>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-neutral-500">
          {creando
            ? 'Después de crearlo, si lo publicas en MercadoLibre, lo vinculas en Publicaciones → Vincular: el peso y la foto llegan solos.'
            : 'Sin publicaciones de MercadoLibre vinculadas.'}
        </p>
      )}
      {!creando && productCode && (
        <Link href={`/vincular-ml?buscar=${encodeURIComponent(productCode)}`}
          className="btn-secondary inline-block text-xs">
          {codes.length > 0 ? 'Revisar vínculos con ML' : 'Vincular con ML'}
        </Link>
      )}
    </div>
  )
}
