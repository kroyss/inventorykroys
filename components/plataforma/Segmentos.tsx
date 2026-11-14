'use client'

/** Selector segmentado de Plataforma (14-11): el mismo control en Clientes, Novedades y cursos, Programas e Interno.
 *  `n` = contador gris; `alerta` = contador rojo (algo por atender). En celular se desliza de lado. */
export type Segmento<K extends string> = { k: K; t: string; n?: number | null; alerta?: number | null }

export default function Segmentos<K extends string>({ items, valor, onCambio, etiqueta }: {
  items: Segmento<K>[]; valor: K; onCambio: (k: K) => void; etiqueta: string
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
      <div role="tablist" aria-label={etiqueta} className="inline-flex rounded-lg bg-neutral-100 p-0.5">
        {items.map(s => (
          <button key={s.k} role="tab" aria-selected={valor === s.k} onClick={() => onCambio(s.k)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm transition-colors ${valor === s.k ? 'bg-white font-medium text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}>
            {s.t}
            {s.alerta ? <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-4 text-white">{s.alerta}</span>
              : s.n != null ? <span className="tabular-nums text-neutral-400">{s.n}</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}
