'use client'
// Aviso abajo a la derecha (08-11-2026, diseño del dueño): poco invasivo y opcional.
//   · Mientras hay tareas en MercadoLibre (cola, lib/colaML.ts): pastilla «⟳ Procesando tareas (N)».
//   · Clic → se abre con el avance de cada una; otro clic → se achica (queda recordado entre pantallas).
//   · Al terminar: «✓ Tareas terminadas» (o «con errores»); abierta muestra cómo quedaron y «Ver cómo quedaron».
//   · La ✕ quita el aviso de las terminadas (no vuelven a salir).
// Pregunta una vez al abrir; si hay algo en curso, cada 5 s hasta que termine. Despierta con el evento 'cola-ml'.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Lote { id: number; tipo: string; titulo: string; estado: string; total: number; ok: number; sin_cambio: number
  saltadas: number; errores: number; pendientes: number }

const VISTOS = 'cola-ml-vistos', ABIERTO = 'cola-ml-abierto'
const leer = <T,>(k: string, vacio: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : vacio } catch { return vacio } }
const guardar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sin almacenamiento */ } }

export default function AvisoColaML() {
  const [lotes, setLotes] = useState<Lote[]>([])
  // En el servidor no hay lotes (no se dibuja nada): leer el navegador aquí no descuadra la hidratación.
  const [vistos, setVistos] = useState<number[]>(() => (typeof window === 'undefined' ? [] : leer<number[]>(VISTOS, [])))
  const [abierto, setAbierto] = useState<boolean>(() => (typeof window === 'undefined' ? false : leer<boolean>(ABIERTO, false)))
  const [mirando, setMirando] = useState(0)

  const cargar = useCallback(async () => {
    const d = await fetch('/api/cola-ml').then(r => (r.ok ? r.json() : null)).catch(() => null)
    const l: Lote[] = d?.lotes ?? []
    setLotes(l)
    return l.some(x => x.estado === 'en_curso')
  }, [])

  useEffect(() => {
    const despertar = () => setMirando(n => n + 1)
    window.addEventListener('cola-ml', despertar)
    return () => window.removeEventListener('cola-ml', despertar)
  }, [])

  useEffect(() => {
    let vivo = true
    let t: ReturnType<typeof setTimeout> | null = null
    const vuelta = async () => {
      const activo = await cargar()
      if (vivo && activo) t = setTimeout(vuelta, 5000)
    }
    vuelta()
    return () => { vivo = false; if (t) clearTimeout(t) }
  }, [cargar, mirando])

  const enCurso = lotes.filter(l => l.estado === 'en_curso')
  const terminados = lotes.filter(l => l.estado !== 'en_curso' && !vistos.includes(l.id))
  if (!enCurso.length && !terminados.length) return null
  const procesando = enCurso.length > 0
  const conErrores = terminados.some(l => l.errores > 0)
  const visibles = procesando ? enCurso : terminados
  const alternar = () => { setAbierto(!abierto); guardar(ABIERTO, !abierto) }
  const quitar = () => { const v = [...vistos, ...terminados.map(l => l.id)].slice(-50); setVistos(v); guardar(VISTOS, v) }

  return (
    <div className="fixed z-40 right-14 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-5 flex flex-col items-end gap-2">
      {abierto && (
        <div className="w-[calc(100vw-1.5rem)] sm:w-80 rounded-xl border border-neutral-200 bg-white shadow-lg p-3 space-y-2.5 text-sm">
          {visibles.map(l => {
            const hechas = l.total - l.pendientes
            return (
              <div key={l.id} className="space-y-1">
                <div className="truncate font-medium text-neutral-900" title={l.titulo}>{l.titulo}</div>
                {l.estado === 'en_curso' ? <>
                  <div className="text-xs text-neutral-500"><b className="num text-neutral-700">{hechas} de {l.total}</b>{l.errores ? <span className="text-red-700"> · {l.errores} con error</span> : null}</div>
                  <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                    <div className="h-full bg-lime-500 transition-all" style={{ width: `${Math.round(hechas / Math.max(1, l.total) * 100)}%` }} />
                  </div>
                </> : (
                  <div className="text-xs text-neutral-600">
                    {l.estado === 'cancelado' && 'Cancelada · '}
                    <b className="text-emerald-700">{l.ok + l.sin_cambio} listas</b>
                    {l.errores ? <> · <b className="text-red-700">{l.errores} con error</b></> : null}
                    {l.saltadas ? ` · ${l.saltadas} saltadas` : ''}
                  </div>
                )}
              </div>
            )
          })}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-100">
            <span className="text-[11px] text-neutral-400">{procesando ? 'Puedes seguir trabajando' : ''}</span>
            <Link href={`/publicaciones/lotes${visibles.length === 1 ? `?lote=${visibles[0].id}` : ''}`} className="text-xs font-medium text-sky-700 hover:underline">
              {procesando ? 'Ver detalle' : 'Ver cómo quedaron'}
            </Link>
          </div>
        </div>
      )}
      <div className={`flex items-center rounded-full border shadow-md text-xs font-medium ${procesando ? 'bg-white border-neutral-200 text-neutral-700'
        : conErrores ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
        <button type="button" onClick={alternar} className="flex items-center gap-1.5 pl-3 pr-2 py-1.5" title={abierto ? 'Achicar' : 'Ver el avance'}>
          {procesando
            ? <><svg viewBox="0 0 20 20" className="h-3.5 w-3.5 animate-spin text-lime-600" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 3a7 7 0 1 1-7 7" strokeLinecap="round" /></svg>
                Procesando tareas ({enCurso.length})</>
            : <>{conErrores ? '⚠' : '✓'} Tareas terminadas{conErrores ? ' con errores' : ''}</>}
          <span className="text-neutral-400">{abierto ? '▾' : '▴'}</span>
        </button>
        {!procesando && (
          <button type="button" onClick={quitar} className="pr-3 pl-1 py-1.5 opacity-60 hover:opacity-100" title="Quitar el aviso">✕</button>
        )}
      </div>
    </div>
  )
}
