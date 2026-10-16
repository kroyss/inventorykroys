'use client'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui'
import type { Novedad } from '@/lib/novedades'
import { ListaNovedades } from './NovedadesNav'

/** Novedades en una página (celular). Al abrirla se dan por vistas. */
export default function NovedadesPagina() {
  const [items, setItems] = useState<Novedad[] | null>(null)
  useEffect(() => {
    let vivo = true
    fetch('/api/novedades', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!vivo || !d) return
      setItems(d.items)
      if (d.nuevas > 0) fetch('/api/novedades/vistas', { method: 'POST' }).catch(() => {})
    }).catch(() => {})
    return () => { vivo = false }
  }, [])
  return (
    <div className="space-y-4">
      <PageHeader title="Novedades" subtitle="Lo que mejoramos en el sistema" />
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        {items ? <ListaNovedades items={items} /> : <p className="px-4 py-6 text-sm text-neutral-400">Cargando…</p>}
      </div>
    </div>
  )
}
