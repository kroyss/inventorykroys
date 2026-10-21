'use client'
// Chip de la situación de la publicación en MercadoLibre (17-10): activa, agotada o pausada, con las unidades
// disponibles en ML (suma de variantes). Sale del catálogo que ya se trae de ML (lib/promocionesSesion.ts).
// 21-10: con `item` y el permiso "Cambiar el stock en MercadoLibre", un lápiz ✎ chico abre la ventana de
// cambiar stock (components/preguntas/CambiarStock.tsx); quien no tiene el permiso lo ve como antes.
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { puede } from '@/lib/permisos'
import CambiarStock from './CambiarStock'

export type Situacion = 'activa' | 'agotada' | 'pausada' | 'pausada_ml' | null | undefined

const POCAS = 3   // como "Por agotarse" en Stock (UMBRAL_DEFAULT)
const ESTILO: Record<string, { t: string; c: string; title: string }> = {
  activa: { t: '● Activa', c: 'text-emerald-700 ring-emerald-200 bg-emerald-50', title: 'Publicada y a la venta en MercadoLibre' },
  agotada: { t: '● Agotada', c: 'text-red-700 ring-red-200 bg-red-50', title: 'Pausada por MercadoLibre porque se quedó sin stock' },
  pausada: { t: '⏸ Pausada', c: 'text-amber-800 ring-amber-300 bg-amber-50', title: 'Pausada por el vendedor (tiene stock): no está a la venta' },
  pausada_ml: { t: '⏸ Pausada', c: 'text-amber-800 ring-amber-300 bg-amber-50', title: 'Pausada en MercadoLibre' },
}

export default function SituacionChip({ s, disp, item, variante = null, origen = 'preguntas' }: {
  s: Situacion; disp?: number | null
  /** Publicación (MLV…) para poder cambiar su stock; sin esto el chip es solo informativo. */
  item?: string | null; variante?: string | null; origen?: 'preguntas' | 'mensajes' | 'ficha'
}) {
  const { data } = useSession()
  const [abierta, setAbierta] = useState(false)
  // Lo que quedó después de guardar (sin esperar a la próxima sincronización).
  const [ahora, setAhora] = useState<{ s: Situacion; disp: number | null } | null>(null)
  const sit = ahora?.s ?? s
  const num = ahora ? ahora.disp : disp
  const e = sit ? ESTILO[sit] : null
  if (!e) return null
  const conNumero = sit !== 'agotada' && num != null
  const editable = !!item && !!data?.user && puede(data.user, 'reponer_stock')
  return (
    <>
      <span title={`${e.title}${conNumero ? ` · ${num} disponible${num === 1 ? '' : 's'} en MercadoLibre (todas las variantes)` : ''}`}
        className={`inline-flex items-center text-[11px] rounded-full px-2 py-0.5 ring-1 ring-inset whitespace-nowrap ${e.c}`}>
        {e.t}
        {conNumero && <span className={num! < POCAS ? 'font-semibold text-amber-700' : 'opacity-70'}> · {num} disp.</span>}
        {editable && (
          <button type="button" onClick={ev => { ev.preventDefault(); ev.stopPropagation(); setAbierta(true) }}
            title="Cambiar stock en MercadoLibre" aria-label="Cambiar stock en MercadoLibre"
            className="-mr-1 ml-1 rounded-full px-1 opacity-60 hover:bg-black/5 hover:opacity-100">✎</button>
        )}
      </span>
      {abierta && item && (
        <CambiarStock item={item} variante={variante} origen={origen} onCerrar={() => setAbierta(false)}
          onGuardado={res => {
            // El total de la publicación (todas las variantes) como quedó en ML.
            const mio = [...res].reverse().find(r => r.item_id === item)
            if (mio?.estado) setAhora({ s: mio.estado === 'active' ? 'activa' : sit, disp: mio.total ?? num ?? null })
          }} />
      )}
    </>
  )
}
