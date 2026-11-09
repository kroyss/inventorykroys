'use client'
// Aviso abajo en todas las pantallas (08-11-2026): lo que se está mandando a MercadoLibre en segundo plano
// (cola de lib/colaML.ts: promociones, descripciones, precios) y cómo terminó. Pregunta una vez al abrir; si hay algo
// en curso, cada 5 s hasta que termine. También despierta con el evento 'cola-ml' (al crear una tarea).
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Lote { id: number; tipo: string; titulo: string; estado: string; total: number; ok: number; sin_cambio: number
  saltadas: number; errores: number; pendientes: number }

const CLAVE = 'cola-ml-vistos'
const leerVistos = (): number[] => { try { return JSON.parse(localStorage.getItem(CLAVE) ?? '[]') } catch { return [] } }
const guardarVistos = (v: number[]) => { try { localStorage.setItem(CLAVE, JSON.stringify(v.slice(-30))) } catch { /* sin almacenamiento */ } }
const destino = (tipo: string) => (tipo === 'promocion' ? '/productos/promociones' : '/publicaciones/lotes')

export default function AvisoColaML() {
  const [lotes, setLotes] = useState<Lote[]>([])
  // En el servidor no hay lotes (no se dibuja nada), así que leer el navegador aquí no descuadra la hidratación.
  const [vistos, setVistos] = useState<number[]>(() => (typeof window === 'undefined' ? [] : leerVistos()))
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

  const visibles = lotes.filter(l => l.estado === 'en_curso' || !vistos.includes(l.id))
  if (!visibles.length) return null
  const ocultar = (id: number) => { const v = [...vistos, id]; setVistos(v); guardarVistos(v) }

  return (
    <div className="fixed z-40 right-3 left-3 sm:left-auto sm:w-96 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4 space-y-2">
      {visibles.map(l => {
        const hechas = l.total - l.pendientes
        const curso = l.estado === 'en_curso'
        return (
          <div key={l.id} className="rounded-xl border border-neutral-200 bg-white shadow-lg px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium text-neutral-900">{l.titulo}</div>
                {curso
                  ? <div className="text-xs text-neutral-500">Enviando a MercadoLibre: <b className="num">{hechas} de {l.total}</b>{l.errores ? ` · ${l.errores} con error` : ''} · puedes seguir trabajando</div>
                  : <div className="text-xs text-neutral-600">
                      {l.estado === 'cancelado' ? 'Cancelado · ' : '✓ Terminado · '}
                      <b className="text-emerald-700">{l.ok + l.sin_cambio} listas</b>
                      {l.errores ? <> · <b className="text-red-700">{l.errores} con error</b></> : null}
                      {l.saltadas ? ` · ${l.saltadas} saltadas` : ''}
                    </div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={destino(l.tipo)} className="text-xs text-sky-700 hover:underline">Ver</Link>
                {!curso && <button onClick={() => ocultar(l.id)} className="text-neutral-400 hover:text-neutral-700" title="Ocultar">✕</button>}
              </div>
            </div>
            {curso && (
              <div className="mt-1.5 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                <div className="h-full bg-lime-500 transition-all" style={{ width: `${Math.round(hechas / Math.max(1, l.total) * 100)}%` }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
