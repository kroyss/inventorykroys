'use client'
import { VARIABLES } from '@/lib/variablesTexto'

// Botones para agregar una variable al texto de una respuesta rápida (lib/variablesTexto.ts). En Preguntas no va
// {nombre}: MercadoLibre no da el nombre de quien pregunta.
export function AyudaVariables({ conNombre, onAgregar }: { conNombre: boolean; onAgregar: (v: string) => void }) {
  const lista = VARIABLES.filter(x => conNombre || x.v !== '{nombre}')
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px] text-neutral-500">
      <span>Datos que se llenan solos:</span>
      {lista.map(x => (
        <button key={x.v} type="button" onClick={() => onAgregar(x.v)} title={`Se cambia por ${x.d}`}
          className="font-mono px-1.5 py-0.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700">{x.v}</button>
      ))}
    </div>
  )
}
