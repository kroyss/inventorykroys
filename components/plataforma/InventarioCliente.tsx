'use client'
import { useCallback, useEffect, useState } from 'react'

// Plataforma → ficha del cliente → «Prueba de Inventario» (21-11-2026, mig. 193). El dueño prende la OFERTA a quien
// quiera (el piloto: SHOPIT_VE); el cliente ve el aviso arriba y la activa él mismo (15 días, una vez). Aquí se ve en
// qué va: ofrecida, corriendo (días que quedan), terminada o ya con Completo.
interface Estado { oferta: boolean; desde: string | null; hasta: string | null; quedan: number | null; conInventario: boolean; plan: string | null; interna: boolean }
const ddmm = (f: string) => f.split('-').reverse().join('/')

export default function InventarioCliente({ organizacionId, onCambio, onError }: { organizacionId: number; onCambio: (msg: string) => void; onError: (e: string) => void }) {
  const [e, setE] = useState<Estado | null | 'no'>(null)
  const [guardando, setGuardando] = useState(false)
  const cargar = useCallback(() => {
    fetch(`/api/plataforma/organizaciones/${organizacionId}/inventario`).then(r => r.ok ? r.json() : 'no').then(setE).catch(() => setE('no'))
  }, [organizacionId])
  useEffect(() => { cargar() }, [cargar])
  if (e === 'no') return <p className="text-xs text-neutral-400">No aplica a esta cuenta.</p>
  if (!e) return <p className="text-xs text-neutral-400">Cargando…</p>

  const alternar = async () => {
    setGuardando(true)
    const r = await fetch(`/api/plataforma/organizaciones/${organizacionId}/inventario`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oferta: !e.oferta }),
    }).catch(() => null)
    setGuardando(false)
    if (!r?.ok) { onError((await r?.json().catch(() => null))?.error ?? 'No se pudo guardar'); return }
    onCambio(!e.oferta ? 'Oferta de Inventario prendida: el admin la verá arriba' : 'Oferta de Inventario apagada')
    cargar()
  }

  const situacion = e.plan === 'completo' ? 'Ya tiene plan Completo (Inventario incluido).'
    : e.hasta && (e.quedan ?? -1) >= 0 ? `Prueba activa: del ${ddmm(e.desde!)} al ${ddmm(e.hasta)} (quedan ${e.quedan} días).`
    : e.hasta ? `La prueba terminó el ${ddmm(e.hasta)}${e.conInventario ? '' : ' (Inventario apagado; datos guardados)'}.`
    : e.conInventario ? 'Ya tiene Inventario (dado a mano): no necesita la oferta.'
    : e.oferta ? 'Ofrecida: todavía no la activó.' : 'Sin ofrecer.'

  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 space-y-2">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          <span className="font-medium text-neutral-800">Ofrecer Inventario</span>
          <span className="block text-xs text-neutral-500">Aviso arriba con «Probar gratis» (15 días) y el plan Completo en su Mi plan.</span>
        </span>
        <button type="button" role="switch" aria-checked={e.oferta} disabled={guardando} onClick={alternar}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${e.oferta ? 'bg-emerald-500' : 'bg-neutral-300'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${e.oferta ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </label>
      <p className="text-xs text-neutral-600">{situacion}</p>
      {e.interna && <p className="text-xs text-amber-700">Cuenta interna: no vence, el Inventario no se apaga solo.</p>}
    </div>
  )
}
