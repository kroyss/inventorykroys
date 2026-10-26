'use client'
// Inventario → «Stock en ML» (26-10, Fase 1; API /api/stock-en-ml, lib/stockConML.ts). Cada producto vinculado con
// TODAS sus publicaciones (cuentas y variantes): lo que muestra ML y lo que debería mostrar. Se marcan varios y
// «Igualar y reactivar» los deja todos al día de una vez (antes: de a una publicación, cuenta por cuenta).
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/ui'
import type { FilaStockML, PubStockML } from '@/lib/stockConML'

type Filtro = 'diferencias' | 'reactivar' | 'bloqueadas' | 'todas'
interface Res { item_id: string; variante_id: string | null; ok: boolean; error?: string; disponible?: number; estado?: string }

const POR_PAGINA = 40
const clave = (p: { item_id: string; variante_id: string | null }) => `${p.item_id}:${p.variante_id ?? ''}`

const ENVIO: Record<string, { t: string; c: string; title: string }> = {
  ambas:    { t: 'Zoom y Tealca', c: 'bg-emerald-50 text-emerald-800 ring-emerald-200', title: 'Envío gratis por los dos transportistas a este precio' },
  tealca:   { t: 'Solo Tealca', c: 'bg-amber-50 text-amber-800 ring-amber-200', title: 'A este precio el envío gratis es solo por Tealca' },
  destino:  { t: 'Cobro a destino', c: 'bg-red-50 text-red-700 ring-red-200', title: 'A este precio y peso no tiene envío gratis' },
  sin_peso: { t: 'Sin peso', c: 'bg-neutral-100 text-neutral-600 ring-neutral-200', title: 'Falta el peso del producto: no se sabe si tiene envío gratis' },
}

export default function StockMLClient() {
  const [filas, setFilas] = useState<FilaStockML[] | null>(null)
  const [puedeCambiar, setPuedeCambiar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('diferencias')
  const [cuenta, setCuenta] = useState('')
  const [buscar, setBuscar] = useState('')
  const [ver, setVer] = useState(POR_PAGINA)
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const [trabajando, setTrabajando] = useState<{ hechos: number; total: number } | null>(null)
  const [resultados, setResultados] = useState<Map<string, Res>>(new Map())
  const [actualizando, setActualizando] = useState(false)

  const cargar = () => fetch('/api/stock-en-ml', { cache: 'no-store' }).then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
    setFilas(d.filas); setPuedeCambiar(!!d.puedeCambiar); setError(null)
  })
  useEffect(() => { cargar() }, [])

  const pedir = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/stock-en-ml', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo'); return null }
    return d
  }

  const cuentas = useMemo(() => [...new Set((filas ?? []).flatMap(f => f.pubs.map(p => p.cuenta)))].sort(), [filas])
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return (filas ?? []).filter(f =>
      (filtro === 'todas' || (filtro === 'diferencias' ? f.diferencia : filtro === 'reactivar' ? f.pubs.some(p => p.reactivar) : f.pubs.some(p => p.bloqueada_envio)))
      && (!cuenta || f.pubs.some(p => p.cuenta === cuenta))
      && (!q || `${f.code} ${f.name}`.toLowerCase().includes(q) || f.pubs.some(p => `${p.item_id} ${p.titulo ?? ''} ${p.variante ?? ''}`.toLowerCase().includes(q))))
  }, [filas, filtro, cuenta, buscar])

  if (!filas) return <p className="text-sm text-neutral-400">{error ?? 'Cargando productos y publicaciones…'}</p>

  const n = {
    diferencias: filas.filter(f => f.diferencia).length,
    reactivar: filas.filter(f => f.pubs.some(p => p.reactivar)).length,
    bloqueadas: filas.filter(f => f.pubs.some(p => p.bloqueada_envio)).length,
    todas: filas.length,
  }
  const accionables = (f: FilaStockML) => f.pubs.filter(p => p.objetivo != null && (p.objetivo !== p.ml_disponible || p.reactivar))
  const marcables = visibles.slice(0, ver).filter(f => accionables(f).length)
  const todosMarcados = marcables.length > 0 && marcables.every(f => marcados.has(f.product_id))

  const igualar = async () => {
    const pubs = filas.filter(f => marcados.has(f.product_id)).flatMap(accionables).map(p => ({ item_id: p.item_id, variante_id: p.variante_id }))
    if (!pubs.length) return
    setTrabajando({ hechos: 0, total: pubs.length }); setError(null)
    const res = new Map(resultados)
    for (let i = 0; i < pubs.length; i += 10) {
      const d = await pedir({ accion: 'igualar', pubs: pubs.slice(i, i + 10) })
      if (!d) break
      for (const x of d.resultados as Res[]) res.set(clave(x), x)
      setResultados(new Map(res))
      setTrabajando({ hechos: Math.min(i + 10, pubs.length), total: pubs.length })
    }
    setTrabajando(null); setMarcados(new Set())
    await cargar()
  }

  const errores = [...resultados.values()].filter(r => !r.ok).length
  const okCount = [...resultados.values()].filter(r => r.ok).length

  return (
    <div className="space-y-4 pb-20">
      <PageHeader title="Stock en MercadoLibre"
        subtitle="Cada producto con todas sus publicaciones: iguala el stock y reactiva las pausadas en todas tus cuentas de una vez"
        actions={<>
          <Link href="/inventario" className="btn-secondary text-sm whitespace-nowrap">← Inventario</Link>
          {puedeCambiar && (
            <button disabled={actualizando} className="btn-secondary text-sm whitespace-nowrap disabled:opacity-50"
              title="Vuelve a leer de MercadoLibre el stock y el estado de todas tus publicaciones (tarda un poco)"
              onClick={async () => { setActualizando(true); await pedir({ accion: 'actualizar' }); await cargar(); setActualizando(false) }}>
              {actualizando ? 'Leyendo MercadoLibre…' : 'Actualizar desde ML'}
            </button>
          )}
        </>} />

      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-600 space-y-1">
        <p><b>Disponible</b> = stock del sistema − ventas de MercadoLibre que todavía no se registraron (ML ya las descontó de su publicación).
          Al igualar, cada publicación queda con el disponible; si <b>trae varias unidades</b> (pack o combo), con el disponible ÷ las que trae.</p>
        <p>Una pausada se reactiva si tiene stock, salvo que a su precio y peso quede <b>sin envío gratis</b>: esas las revisas tú.
          Lo que marques <b>No sincronizar</b> (rifas, encargos) no se toca.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
          {([['diferencias', 'Con diferencias'], ['reactivar', 'Pausadas para reactivar'], ['bloqueadas', 'Pausadas sin envío gratis'], ['todas', 'Todos']] as const).map(([k, t]) => (
            <button key={k} onClick={() => { setFiltro(k); setVer(POR_PAGINA) }}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs sm:py-1 ${filtro === k ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}>
              {t} <span className="opacity-60">{n[k]}</span>
            </button>
          ))}
        </div>
        {cuentas.length > 1 && (
          <select value={cuenta} onChange={e => { setCuenta(e.target.value); setVer(POR_PAGINA) }} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">
            <option value="">Todas las cuentas</option>
            {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <input type="search" value={buscar} onChange={e => { setBuscar(e.target.value); setVer(POR_PAGINA) }} placeholder="Buscar producto, código o MLV…"
          className="ml-auto w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:w-72 sm:py-1.5 sm:text-sm" />
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {resultados.size > 0 && !trabajando && (
        <div className={`rounded border px-3 py-2 text-sm ${errores ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          ✓ {okCount} publicación{okCount === 1 ? '' : 'es'} al día{errores ? ` · ${errores} con problema (mira el detalle en rojo)` : ''}
          <button className="ml-3 underline" onClick={() => setResultados(new Map())}>Ocultar</button>
        </div>
      )}

      {filas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">
          No hay productos vinculados a publicaciones de MercadoLibre. Vincúlalos en <Link href="/vincular-ml" className="underline">Vincular con ML</Link>.
        </p>
      ) : visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">
          {filtro === 'diferencias' ? '¡Todo igual que en el sistema! 🎉' : 'Nada en esta vista.'}
        </p>
      ) : (
        <div className="space-y-3">
          {puedeCambiar && marcables.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input type="checkbox" checked={todosMarcados} onChange={() => setMarcados(todosMarcados ? new Set() : new Set(marcables.map(f => f.product_id)))} />
              Marcar los {marcables.length} de esta vista
            </label>
          )}
          {visibles.slice(0, ver).map(f => (
            <Producto key={f.product_id} f={f} puedeCambiar={puedeCambiar} marcable={accionables(f).length > 0}
              marcado={marcados.has(f.product_id)} resultados={resultados}
              onMarcar={() => setMarcados(m => { const x = new Set(m); if (x.has(f.product_id)) x.delete(f.product_id); else x.add(f.product_id); return x })}
              onUnidades={async (p, u) => { if (await pedir({ accion: 'unidades', codigo_id: p.codigo_id, unidades: u })) await cargar() }}
              onSincronizar={async (p, v) => { if (await pedir({ accion: 'sincronizar', codigo_id: p.codigo_id, sin_sincronizar: v })) await cargar() }} />
          ))}
          {visibles.length > ver && (
            <button onClick={() => setVer(v => v + POR_PAGINA)} className="btn-secondary w-full text-sm">Ver {Math.min(POR_PAGINA, visibles.length - ver)} más ({visibles.length - ver} quedan)</button>
          )}
        </div>
      )}

      {puedeCambiar && (marcados.size > 0 || trabajando) && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-neutral-700">
              {trabajando ? `Actualizando MercadoLibre… ${trabajando.hechos} de ${trabajando.total} publicaciones`
                : `${marcados.size} producto${marcados.size === 1 ? '' : 's'} · ${filas.filter(f => marcados.has(f.product_id)).flatMap(accionables).length} publicaciones`}
            </span>
            <div className="flex gap-2">
              {!trabajando && <button onClick={() => setMarcados(new Set())} className="btn-ghost text-sm">Cancelar</button>}
              <button onClick={igualar} disabled={!!trabajando} className="btn-primary text-sm disabled:opacity-50">
                {trabajando ? 'Trabajando…' : 'Igualar y reactivar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Producto({ f, puedeCambiar, marcable, marcado, resultados, onMarcar, onUnidades, onSincronizar }: {
  f: FilaStockML; puedeCambiar: boolean; marcable: boolean; marcado: boolean; resultados: Map<string, Res>
  onMarcar: () => void; onUnidades: (p: PubStockML, u: number) => void; onSincronizar: (p: PubStockML, v: boolean) => void
}) {
  return (
    <section className={`rounded-xl border bg-white shadow-sm ${marcado ? 'border-lime-400 ring-1 ring-lime-300' : 'border-neutral-200'}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-100 px-4 py-2.5">
        {puedeCambiar && <input type="checkbox" checked={marcado} disabled={!marcable} onChange={onMarcar}
          title={marcable ? 'Marcar para igualar' : 'Nada que igualar'} className="h-4 w-4" />}
        <div className="min-w-0 flex-1">
          <span className="font-mono text-xs text-neutral-400">{f.code}</span> <span className="font-medium text-neutral-900">{f.name}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 text-xs text-neutral-500">
          <span>Stock <b className="text-neutral-800 tabular-nums">{f.stock}</b></span>
          {f.comprometidas > 0 && <span title="Ventas de ML todavía sin registrar">− sin registrar <b className="text-neutral-800 tabular-nums">{f.comprometidas}</b></span>}
          <span>Disponible <b className="text-base text-neutral-900 tabular-nums">{f.disponible}</b></span>
          <span>{f.peso ? `${f.peso} kg` : <span className="text-amber-700">sin peso</span>}</span>
        </div>
      </div>
      <ul className="divide-y divide-neutral-100">
        {f.pubs.map(p => <FilaPub key={p.codigo_id} p={p} res={resultados.get(clave(p))} puedeCambiar={puedeCambiar}
          onUnidades={u => onUnidades(p, u)} onSincronizar={v => onSincronizar(p, v)} />)}
      </ul>
    </section>
  )
}

function FilaPub({ p, res, puedeCambiar, onUnidades, onSincronizar }: {
  p: PubStockML; res?: Res; puedeCambiar: boolean; onUnidades: (u: number) => void; onSincronizar: (v: boolean) => void
}) {
  const [u, setU] = useState(String(p.unidades))
  useEffect(() => setU(String(p.unidades)), [p.unidades])
  const cambia = p.objetivo != null && (p.objetivo !== p.ml_disponible || p.reactivar)
  const envio = p.envio ? ENVIO[p.envio] : null
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 text-sm ${p.sin_sincronizar ? 'opacity-60' : ''}`}>
      <div className="min-w-[12rem] flex-1">
        <div className="text-xs text-neutral-500">
          <b className="text-neutral-700">{p.cuenta}</b> · <span className="font-mono">{p.item_id}</span>
          {p.variante && <span className="ml-1 rounded-full bg-sky-50 px-1.5 py-px text-[11px] text-sky-800 ring-1 ring-inset ring-sky-200">{p.variante}</span>}
        </div>
        <div className="truncate text-neutral-800" title={p.titulo ?? ''}>{p.titulo ?? <span className="text-neutral-400">No está activa ni pausada en ML (cerrada o finalizada); si la acabas de crear, pulsa «Actualizar desde ML»</span>}</div>
      </div>

      <label className="flex items-center gap-1 text-xs text-neutral-500" title="Cuántas unidades del producto trae esta publicación (pack o combo). Lo pones tú; 1 = suelto">
        trae
        <input type="number" min={1} max={100} value={u} disabled={!puedeCambiar} onChange={e => setU(e.target.value)}
          onBlur={() => { const n = Math.round(Number(u)); if (n >= 1 && n <= 100 && n !== p.unidades) onUnidades(n); else setU(String(p.unidades)) }}
          className="w-12 rounded border border-neutral-300 px-1 py-0.5 text-right text-sm tabular-nums" /> u.
      </label>

      <div className="w-28 text-xs">
        <div className="text-neutral-400">En ML</div>
        <div className="tabular-nums text-neutral-800">
          {p.ml_disponible ?? '—'} {p.estado === 'paused' ? <span className="text-amber-700">· pausada</span> : p.estado === 'active' ? <span className="text-neutral-400">· activa</span> : null}
        </div>
      </div>
      <div className="w-36 text-xs">
        <div className="text-neutral-400">Quedará</div>
        {p.sin_sincronizar ? <div className="text-neutral-500">no se toca</div>
          : p.entera_con_variantes ? <div className="text-amber-700" title="Está vinculada la publicación entera pero tiene variantes: vincula cada variante en Vincular con ML">vincular por variante</div>
          : p.objetivo == null ? <div className="text-neutral-400">—</div>
          : <div className={`tabular-nums ${cambia ? 'font-semibold text-lime-700' : 'text-neutral-500'}`}>
              {p.objetivo}{p.reactivar ? ' · se reactiva' : ''}{!cambia ? ' ✓ igual' : ''}
              {p.bloqueada_envio && <div className="font-normal text-red-700">pausada: sin envío gratis</div>}
            </div>}
      </div>
      {envio && <span title={envio.title} className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${envio.c}`}>{envio.t}</span>}
      {puedeCambiar && (
        <label className="flex items-center gap-1 text-[11px] text-neutral-500" title="Rifas, encargos o lo que manejas aparte: esta pantalla no la toca">
          <input type="checkbox" checked={p.sin_sincronizar} onChange={e => onSincronizar(e.target.checked)} /> No sincronizar
        </label>
      )}
      {res && (
        <div className={`w-full text-xs ${res.ok ? 'text-emerald-700' : 'text-red-700'}`}>
          {res.ok ? `✓ Listo: ${res.disponible ?? '?'} u.${res.estado === 'active' ? ', activa' : res.estado === 'paused' ? ', pausada' : ''}` : `✗ ${res.error}`}
        </div>
      )}
    </li>
  )
}
