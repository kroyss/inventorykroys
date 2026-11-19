'use client'
// Central de actualización (18-11, el dueño): UN botón arriba, junto a Novedades, en todas las pantallas (también en el
// teléfono). Abre un panel con cada grupo y su antigüedad; «Actualizar todo» trae solo lo viejo y cada línea tiene su ↻
// cuando hace falta. Reemplaza los botones sueltos de traer (lib/actualizarGrupos.ts, lib/actualizarCentral.ts).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GRUPOS, EVENTO_ACTUALIZADO, EVENTO_ABRIR, type Grupo } from '@/lib/actualizarGrupos'
import type { EstadoGrupo } from '@/lib/actualizarCentral'
import { Nuevo, vistoNuevo } from '@/components/ui/Nuevo'

const def = (g: Grupo) => GRUPOS.find(x => x.id === g)!
const edadMin = (at: string | null) => at ? (Date.now() - new Date(at).getTime()) / 60_000 : Infinity

function hace(at: string | null) {
  const m = edadMin(at)
  if (m === Infinity) return 'nunca'
  if (m < 1) return 'recién'
  if (m < 60) return `hace ${Math.floor(m)} min`
  const h = m / 60
  if (h < 24) return `hace ${Math.floor(h)} h`
  const d = Math.floor(h / 24)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

export function IconoActualizar({ girando = false, className = 'w-4 h-4' }: { girando?: boolean; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7}
      className={`shrink-0 ${className} ${girando ? 'animate-spin' : ''}`}>
      <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.2h-3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type Linea = { estado: 'corriendo' | 'ok' | 'error'; msg?: string }

export default function ActualizarCentral({ grupos }: { grupos: Grupo[] }) {
  const router = useRouter()
  const [estado, setEstado] = useState<EstadoGrupo[] | null>(null)
  const [lineas, setLineas] = useState<Partial<Record<Grupo, Linea>>>({})
  const [abierto, setAbierto] = useState(false)
  const [, setTic] = useState(0)            // re-dibuja los «hace X min»
  const caja = useRef<HTMLDivElement>(null)
  const esperandoME = useRef(false)

  const leer = useCallback(async () => {
    const r = await fetch('/api/actualizar', { cache: 'no-store' }).catch(() => null)
    if (!r?.ok) return null
    const d = await r.json().catch(() => null) as { grupos: EstadoGrupo[] } | null
    if (d?.grupos) setEstado(d.grupos)
    return d?.grupos ?? null
  }, [])

  // Al entrar y cada 5 min con la pestaña a la vista (el puntito); el texto se re-dibuja cada minuto.
  useEffect(() => {
    if (!grupos.length) return
    const t0 = setTimeout(leer, 0)
    const t = setInterval(() => { if (document.visibilityState === 'visible') leer() }, 5 * 60_000)
    const r = setInterval(() => setTic(x => x + 1), 60_000)
    return () => { clearTimeout(t0); clearInterval(t); clearInterval(r) }
  }, [grupos.length, leer])

  useEffect(() => {
    const abrir = () => { setAbierto(true); vistoNuevo('actualizar'); leer() }
    window.addEventListener(EVENTO_ABRIR, abrir)
    return () => window.removeEventListener(EVENTO_ABRIR, abrir)
  }, [leer])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])

  const avisar = useCallback((g: Grupo) => {
    window.dispatchEvent(new CustomEvent(EVENTO_ACTUALIZADO, { detail: { grupo: g } }))
    router.refresh()
  }, [router])

  // Pagos ME: la traída la hace la PC (1 a 3 min). Se mira cada 5 s hasta que termina (como mucho 12 min: el servidor
  // la da por en curso hasta 10, TRAIDA_EN_CURSO_MIN).
  const seguirME = useCallback(async () => {
    if (esperandoME.current) return
    esperandoME.current = true
    try {
      for (let i = 0; i < 144; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const gs = await leer()
        const me = gs?.find(x => x.grupo === 'pagosme')
        if (me && !me.ocupado) {
          setLineas(l => ({ ...l, pagosme: me.error ? { estado: 'error', msg: me.error } : { estado: 'ok' } }))
          avisar('pagosme')
          return
        }
      }
      setLineas(l => ({ ...l, pagosme: { estado: 'error', msg: 'La PC de Pagos ME no respondió: revisa que el programa esté abierto' } }))
    } finally { esperandoME.current = false }
  }, [leer, avisar])

  // Si al abrir ya hay una traída de Pagos ME corriendo (por ejemplo desde el botón de Pagos ME), se la sigue.
  const meOcupado = !!estado?.find(x => x.grupo === 'pagosme')?.ocupado
  useEffect(() => { if (meOcupado) seguirME() }, [meOcupado, seguirME])

  const correr = useCallback(async (g: Grupo) => {
    setLineas(l => ({ ...l, [g]: { estado: 'corriendo' } }))
    const r = await fetch('/api/actualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grupo: g }) })
      .catch(() => null)
    const d = r ? await r.json().catch(() => null) as { ok?: boolean; errores?: string[]; error?: string; pedido?: number; omitido?: boolean } | null : null
    if (!r?.ok || !d) {
      setLineas(l => ({ ...l, [g]: { estado: 'error', msg: d?.error ?? 'No se pudo actualizar. Prueba de nuevo en un rato.' } }))
      return
    }
    if (g === 'pagosme' && d.pedido && !d.omitido) { await leer(); seguirME(); return }
    setLineas(l => ({ ...l, [g]: d.ok ? { estado: 'ok' } : { estado: 'error', msg: (d.errores ?? []).join(' · ') || 'Hubo un error' } }))
    await leer()
    avisar(g)
  }, [leer, seguirME, avisar])

  if (!grupos.length || !estado?.length) return null

  const corriendo = (g: Grupo) => lineas[g]?.estado === 'corriendo' || (g === 'pagosme' && !!estado.find(x => x.grupo === 'pagosme')?.ocupado)
  const viejo = (e: EstadoGrupo, min: number) => edadMin(e.at) >= min
  const pendientesTodo = estado.filter(e => !corriendo(e.grupo) && viejo(e, def(e.grupo).todoMin))
  const atrasado = estado.some(e => !corriendo(e.grupo) && viejo(e, def(e.grupo).atrasadoMin))
  const algunoCorre = estado.some(e => corriendo(e.grupo))

  const todo = async () => {
    // De a dos a la vez: lo rápido (ventas, preguntas, la traída de Pagos ME) no espera a lo pesado.
    const cola = [...pendientesTodo.map(e => e.grupo)]
    const trabajador = async () => { for (let g = cola.shift(); g; g = cola.shift()) await correr(g) }
    await Promise.all([trabajador(), trabajador()])
  }

  const abrir = () => { setAbierto(a => !a); vistoNuevo('actualizar'); if (!abierto) leer() }

  return (
    <div ref={caja} className="relative flex shrink-0 items-center">
      <button type="button" onClick={abrir} aria-haspopup="dialog" aria-expanded={abierto}
        title={algunoCorre ? 'Actualizando…' : atrasado ? 'Actualizar: hay datos viejos' : 'Actualizar: todo al día'}
        className={`relative flex items-center gap-1 rounded-full p-1.5 transition-colors ${abierto ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'}`}>
        <IconoActualizar girando={algunoCorre} />
        {!algunoCorre && <span className={`absolute top-1 right-1 h-2 w-2 rounded-full ring-2 ring-white ${atrasado ? 'bg-amber-400' : 'bg-emerald-500'}`} />}
        <span className="sr-only">Actualizar</span>
      </button>
      <Nuevo clave="actualizar" className="!ml-0.5 hidden md:inline-block" />
      {abierto && (
        <div role="dialog" aria-label="Actualizar"
          className="fixed inset-x-3 top-16 z-30 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-1.5 md:w-[24rem]">
          <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2.5">
            <IconoActualizar className="h-4 w-4 text-neutral-500" girando={algunoCorre} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-neutral-800">Actualizar</p>
              <p className="text-[11px] leading-tight text-neutral-400">Casi todo se actualiza solo; aquí lo traes ya</p>
            </div>
            <button type="button" onClick={todo} disabled={!pendientesTodo.length}
              title={pendientesTodo.length ? 'Trae solo lo que no está al día' : 'Todo está al día'}
              className="btn-primary !px-3 !py-1.5 text-xs whitespace-nowrap disabled:opacity-50">
              {pendientesTodo.length ? 'Actualizar todo' : 'Todo al día'}
            </button>
          </div>
          <ul className="divide-y divide-neutral-100">
            {estado.map(e => {
              const d = def(e.grupo)
              const l = lineas[e.grupo]
              const corre = corriendo(e.grupo)
              const atras = !corre && viejo(e, d.atrasadoMin)
              const puede = !corre && viejo(e, d.refrescarMin)
              return (
                <li key={e.grupo} className="flex items-start gap-3 px-4 py-2.5">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    corre ? 'text-sky-600' : l?.estado === 'error' ? 'bg-red-50 text-red-600' : atras ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {corre ? <IconoActualizar girando className="h-3.5 w-3.5" /> : l?.estado === 'error' ? '!' : atras ? '!' : '✓'}
                  </span>
                  <div className="min-w-0 flex-1" title={d.detalle}>
                    <p className="text-sm text-neutral-800">{d.nombre}</p>
                    <p className={`text-xs ${l?.estado === 'error' ? 'text-red-600' : 'text-neutral-500'}`}>
                      {corre
                        ? (e.grupo === 'pagosme' && e.sinPC ? 'Esperando a tu PC: abre el programa de Pagos ME' : e.grupo === 'pagosme' ? 'La PC de Pagos ME lo está trayendo (1 a 3 min)…' : 'Actualizando…')
                        : l?.estado === 'error' ? l.msg
                        : <>{hace(e.at)}{l?.estado === 'ok' && <span className="text-emerald-600"> · listo</span>}</>}
                    </p>
                  </div>
                  {puede && (
                    <button type="button" onClick={() => correr(e.grupo)} title={`Actualizar solo ${d.nombre.toLowerCase()}`}
                      className="mt-0.5 rounded-full p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-800">
                      <IconoActualizar className="h-4 w-4" />
                      <span className="sr-only">Actualizar {d.nombre}</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {algunoCorre && <p className="border-t border-neutral-100 bg-neutral-50 px-4 py-2 text-[11px] text-neutral-500">Puedes cerrar esto y seguir trabajando: las pantallas se ponen al día solas al terminar.</p>}
        </div>
      )}
    </div>
  )
}
