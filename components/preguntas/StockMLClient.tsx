'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PageHeader, Tabs, EmptyState, Cargando, KPICard } from '@/components/ui'

interface Publicacion { item_id: string; cuenta: string | null; disponible: number | null; estado: string | null; error: string | null }
interface Fila {
  id: number; code: string; name: string; stock_real: number
  publicaciones: Publicacion[]; publicado_activo: number; pausadas: number; activas: number
  vendidas_recientes: number; alerta: 'reponer' | 'de_mas' | 'ok'
}
interface Datos {
  productos: Fila[]; contadores: { reponer: number; de_mas: number; productos: number }
  progreso: { leidas: number; con_error: number; mas_vieja: string | null; total_codigos: number }
  dias: number; umbral: number
}

const ESTADO: Record<string, { t: string; c: string }> = {
  active:       { t: 'activa',      c: 'text-emerald-700' },
  paused:       { t: 'pausada',     c: 'text-amber-700' },
  closed:       { t: 'finalizada',  c: 'text-neutral-400' },
  under_review: { t: 'en revisión', c: 'text-amber-700' },
  inactive:     { t: 'inactiva',    c: 'text-neutral-400' },
}

function link(item: string) {
  const m = /^(M[A-Z]{2})(\d+)$/.exec(item)
  return m ? `https://articulo.mercadolibre.${m[1] === 'MCO' ? 'com.co' : 'com.ve'}/${m[1]}-${m[2]}-_JM` : null
}

/** Stock real (inventario) vs stock publicado en cada cuenta de MercadoLibre. */
export default function StockMLClient() {
  const [vista, setVista] = useState<'alertas' | 'todos'>('alertas')
  const [datos, setDatos] = useState<Datos | null>(null)
  const [actualizando, setActualizando] = useState(false)
  const [q, setQ] = useState('')
  const parar = useRef(false)

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/stock-ml?vista=${vista}`)
    if (r.ok) setDatos(await r.json())
  }, [vista])
  useEffect(() => { cargar() }, [cargar])

  const actualizar = async () => {
    setActualizando(true); parar.current = false
    try {
      for (let i = 0; i < 100 && !parar.current; i++) {
        const r = await fetch('/api/stock-ml/sincronizar', { method: 'POST' })
        const d = await r.json().catch(() => ({}))
        if (!r.ok || !d.leidas) break
        await cargar()
      }
    } finally { setActualizando(false); cargar() }
  }

  const filtro = q.trim().toLowerCase()
  const filas = (datos?.productos ?? []).filter(f => !filtro || `${f.code} ${f.name}`.toLowerCase().includes(filtro))
  const pr = datos?.progreso
  const incompleto = pr && pr.leidas < pr.total_codigos

  return (
    <div className="space-y-4">
      <PageHeader title="Stock en MercadoLibre" subtitle="Tu stock real contra lo publicado en cada cuenta: qué reponer y qué está publicado de más"
        actions={actualizando
          ? <button onClick={() => { parar.current = true }} className="btn-ghost text-sm text-red-600">Detener</button>
          : <button onClick={actualizar} className="btn-secondary text-sm">Actualizar desde ML</button>} />

      {datos && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard compact label="Reponer en ML" value={datos.contadores.reponer} tone={datos.contadores.reponer ? 'atencion' : 'neutro'} />
          <KPICard compact label="Publicado de más" value={datos.contadores.de_mas} tone={datos.contadores.de_mas ? 'problema' : 'neutro'} />
          <KPICard compact label="Productos con publicación" value={datos.contadores.productos} />
          <KPICard compact label="Publicaciones leídas" value={`${pr?.leidas ?? 0} / ${pr?.total_codigos ?? 0}`}
            sub={pr?.mas_vieja ? `la más vieja: ${new Date(pr.mas_vieja).toLocaleString('es-VE')}` : undefined} />
        </div>
      )}
      {incompleto && (
        <p className="text-xs bg-sky-50 border border-sky-200 text-sky-800 rounded-lg px-3 py-2">
          Todavía se están leyendo publicaciones de MercadoLibre ({pr!.leidas} de {pr!.total_codigos}): el sistema avanza solo cada minuto, o dale “Actualizar desde ML”.
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs value={vista} onChange={setVista} className="flex-1" items={[
          { value: 'alertas', label: 'Para revisar', count: datos ? datos.contadores.reponer + datos.contadores.de_mas : undefined },
          { value: 'todos', label: 'Todos' },
        ]} />
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar código o nombre…"
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-full md:w-72" />
      </div>
      {datos && (
        <p className="text-xs text-neutral-500">
          <b>Reponer</b>: tienes más stock del que está publicado y lo activo es {datos.umbral} o menos, o hay una publicación pausada.
          {' '}<b>Publicado de más</b>: ML ofrece más unidades de las que tienes (riesgo de vender sin stock).
          {' '}Ordenado por lo vendido en los últimos {datos.dias} días.
        </p>
      )}

      {!datos ? <Cargando /> : filas.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
          <EmptyState message={vista === 'alertas' ? 'Nada para revisar: lo publicado está al día con tu stock.' : 'Sin publicaciones leídas todavía.'} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm [&_th]:whitespace-nowrap">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr className="border-b border-neutral-100">
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2 text-right">Stock real</th>
                <th className="px-3 py-2 text-left">Publicado en ML (por cuenta)</th>
                <th className="px-3 py-2 text-right">Activo en ML</th>
                <th className="px-3 py-2 text-right">Vendidas {datos.dias} días</th>
                <th className="px-3 py-2 text-left">Qué hacer</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.id} className="border-b border-neutral-50 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-neutral-900">{f.name}</div>
                    <div className="font-mono text-xs text-neutral-400">{f.code}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold num">{f.stock_real}</td>
                  <td className="px-3 py-2">
                    <div className="space-y-0.5">
                      {f.publicaciones.map(p => (
                        <div key={p.item_id} className="flex flex-wrap items-center gap-x-2 text-xs">
                          <span className="font-semibold text-neutral-700">{p.cuenta ?? '—'}</span>
                          {p.error ? <span className="text-red-600">{p.error}</span> : <>
                            <span className="num text-neutral-900">{p.disponible ?? '—'} und</span>
                            <span className={ESTADO[p.estado ?? '']?.c ?? 'text-neutral-500'}>{ESTADO[p.estado ?? '']?.t ?? p.estado}</span>
                          </>}
                          {link(p.item_id) && <a href={link(p.item_id)!} target="_blank" rel="noreferrer" className="font-mono text-neutral-400 hover:underline">{p.item_id} ↗</a>}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold num">{f.publicado_activo}</td>
                  <td className="px-3 py-2 text-right num text-neutral-700">{f.vendidas_recientes || '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    {f.alerta === 'de_mas' ? (
                      <span className="text-red-700 font-medium">Publicado de más: bajar a {f.stock_real} en total</span>
                    ) : f.alerta === 'reponer' ? (
                      <span className="text-amber-800 font-medium">
                        Reponer: hay {f.stock_real}, activas {f.publicado_activo}
                        {f.pausadas > 0 && ` · ${f.pausadas} pausada(s)`}
                      </span>
                    ) : <span className="text-emerald-700">Al día</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
