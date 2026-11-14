'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { money } from '@/components/ui'
import { matchFuzzy } from '@/lib/search'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import type { ReglasStock } from '@/lib/stockReglas'

// Reportes → Stock (14-11, el dueño): rehecho para que se lea de un vistazo. Cuatro tarjetas que son los filtros,
// una frase por vista con TUS reglas, tablas cortas (tarjetas en el celular), un solo color con significado
// (lo que te alcanza: rojo urgente, ámbar pedir) y el pedido termina en una compra, no solo en un Excel.
// Las reglas (cuánto tarda en llegar, para cuánto comprar, qué es «parado»…) las decide cada empresa (⚙ Reglas).

export type StockSub = 'reposicion' | 'remate' | 'nuevos' | 'declive'
/* eslint-disable @typescript-eslint/no-explicit-any */
type P = any

const m = (n: number) => `${n.toLocaleString('es-VE', { maximumFractionDigits: 1 })} ${n === 1 ? 'mes' : 'meses'}`
const GRUPOS = [
  { k: 'URGENTE', t: 'Urgente', ayuda: 'aunque llegue lo que viene en camino, no alcanza' },
  { k: 'PEDIR', t: 'Pedir', ayuda: 'se acaba antes de que llegue lo nuevo' },
  { k: 'EN_CAMINO', t: 'Ya viene en camino', ayuda: 'lo que pediste lo cubre' },
] as const

export default function StockReport({ data, sub, setSub, onReload }: { data: P; sub: StockSub; setSub: (s: StockSub) => void; onReload: () => void }) {
  const r: ReglasStock = data.reglas
  const [buscar, setBuscar] = useState('')
  const [ocultarCamino, setOcultarCamino] = useState(false)
  const [orden, setOrden] = useState<'urgencia' | 'ganancia' | 'nombre'>('urgencia')
  const [pedido, setPedido] = useState<Record<number, number>>({})
  const [verReglas, setVerReglas] = useState(false)
  const [ocupado, setOcupado] = useState<number | null>(null)
  const confirmar = useConfirm()
  const router = useRouter()
  const cerrarReglas = useCallback(() => setVerReglas(false), [])

  const repo: P[] = data.reposicion ?? []
  const declive: P[] = data.declive ?? []
  const remate: P[] = data.remate ?? []
  const nuevos: P[] = data.nuevos ?? []
  const urgentes = repo.filter(p => p.prioridad === 'URGENTE').length
  const plataParada = remate.reduce((s, p) => s + (p.valor_stock || 0), 0)

  const filtra = (l: P[]) => buscar.trim() ? l.filter(p => matchFuzzy(buscar, p.code, p.name, p.categoria)) : l

  const desactivar = async (p: P) => {
    if (p.stock_actual > 0) return
    if (!await confirmar({ title: 'Desactivar producto', message: `${p.code} · ${p.name} sale de circulación. Lo puedes reactivar desde Productos.`, confirmText: 'Desactivar', danger: true })) return
    setOcupado(p.id)
    const res = await fetch(`/api/products/${p.id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deactivate' }) })
    setOcupado(null)
    if (res.ok) onReload()
    else { const d = await res.json().catch(() => ({})); await confirmar({ title: 'No se pudo desactivar', message: d.error ?? 'Intenta de nuevo.', confirmText: 'Entendido' }) }
  }

  const tarjetas: { k: StockSub; t: string; n: number; det: string | null; alerta?: boolean }[] = [
    { k: 'reposicion', t: 'Reponer', n: repo.length, det: urgentes ? `${urgentes} urgente${urgentes === 1 ? '' : 's'}` : null, alerta: urgentes > 0 },
    { k: 'declive', t: 'Se están cayendo', n: declive.length, det: null },
    { k: 'remate', t: 'Parados', n: remate.length, det: plataParada > 0 ? `$${money(plataParada)} sin moverse` : null },
    { k: 'nuevos', t: 'Recién llegados', n: nuevos.length, det: null },
  ]

  return (
    <div className="space-y-4">
      {/* Las 4 tarjetas son los filtros */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {tarjetas.map(c => (
          <button key={c.k} onClick={() => setSub(c.k)} aria-pressed={sub === c.k}
            className={`rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-px hover:shadow-md ${sub === c.k ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200 hover:border-neutral-300'}`}>
            <span className="block text-xs text-neutral-500">{c.t}</span>
            <span className="block text-2xl font-semibold tabular-nums text-neutral-900">{c.n}</span>
            <span className={`block min-h-[1rem] text-xs ${c.alerta ? 'font-medium text-red-600' : 'text-neutral-500'}`}>{c.det ?? ''}</span>
          </button>
        ))}
      </div>

      {/* La regla de esta vista, con tus números */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="max-w-3xl text-sm text-neutral-600">
          {sub === 'reposicion' && <>Te avisamos cuando lo que tienes alcanza para menos de <b>{m(r.llegada)}</b> (lo que tarda en llegarte) y el producto vende al menos <b>{r.minimo} al mes</b>. Lo sugerido es para cubrir <b>{m(r.objetivo)}</b>, descontando lo que viene en camino.</>}
          {sub === 'declive' && <>Venden la mitad o menos que en los <b>{m(r.cayendo)}</b> anteriores, aunque tuvieron stock en los dos períodos (si vendieron menos por estar agotados, no aparecen). Candidatos a dejar de comprar.</>}
          {sub === 'remate' && <>Vendieron menos de <b>{r.paradoUnidades} unidades</b> en los últimos <b>{m(r.paradoMeses)}</b> teniendo stock. Ordenados por la plata que tienes parada: candidatos a remate.</>}
          {sub === 'nuevos' && <>Llevan menos de <b>{m(r.nuevo)}</b> en tu inventario y todavía venden poco: no se juzgan hasta que tengan tiempo de exposición.</>}
          {data.sanos > 0 && <span className="text-neutral-400"> · {data.sanos} producto{data.sanos === 1 ? '' : 's'} van bien</span>}
        </p>
        <button onClick={() => setVerReglas(true)} className="btn-secondary shrink-0 text-sm">⚙ Reglas</button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar producto o código…"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800 sm:max-w-xs" />
        {sub === 'reposicion' && <>
          <select value={orden} onChange={e => setOrden(e.target.value as typeof orden)} aria-label="Ordenar"
            className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm">
            <option value="urgencia">Lo más urgente primero</option>
            <option value="ganancia">Más ganancia al mes</option>
            <option value="nombre">Nombre</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" checked={ocultarCamino} onChange={e => setOcultarCamino(e.target.checked)} /> Ocultar lo que ya viene en camino
          </label>
        </>}
      </div>

      {sub === 'reposicion' && (
        <Reponer lista={filtra(ocultarCamino ? repo.filter(p => p.prioridad !== 'EN_CAMINO') : repo)} orden={orden} r={r}
          pedido={pedido} setPedido={setPedido} />
      )}
      {sub === 'declive' && (
        <Lista filas={filtra(declive)} vacio="Ningún producto se está cayendo." cols={[
          { t: 'Tienes', v: p => `${p.stock_actual} u` },
          { t: `Antes → ahora (${r.cayendo} m)`, v: p => `${p.ventas_4m_prior} → ${p.ventas_4m_recent} u`,
            title: p => `Días con stock: ${p.dias_stock_prior} → ${p.dias_stock_recent}. Stock promedio: ${p.stock_prom_prior} → ${p.stock_prom_recent} u.` },
          { t: 'Caída', v: p => `−${p.ventas_4m_prior > 0 ? Math.round((1 - p.ventas_4m_recent / p.ventas_4m_prior) * 100) : 0}%`, fuerte: true },
        ]} accion={p => <Desactivar p={p} ocupado={ocupado} onClick={desactivar} />} />
      )}
      {sub === 'remate' && (
        <Lista filas={filtra(remate)} vacio="No tienes productos parados." cols={[
          { t: 'Tienes', v: p => `${p.stock_actual} u` },
          { t: `Vendió (${r.paradoMeses} m)`, v: p => `${p.ventas_parado} u` },
          { t: 'Plata parada', v: p => `$${money(p.valor_stock || 0)}`, fuerte: true },
          { t: 'En inventario', v: p => m(p.meses_disponible) },
        ]} accion={p => <Desactivar p={p} ocupado={ocupado} onClick={desactivar} />} />
      )}
      {sub === 'nuevos' && (
        <Lista filas={filtra(nuevos)} vacio="No hay recién llegados con pocas ventas." cols={[
          { t: 'Tienes', v: p => `${p.stock_actual} u` },
          { t: 'Vendió', v: p => `${p.ventas_parado} u` },
          { t: 'En inventario', v: p => m(p.meses_disponible), fuerte: true },
        ]} />
      )}

      {sub === 'reposicion' && Object.keys(pedido).length > 0 && (
        <BarraPedido repo={repo} pedido={pedido} limpiar={() => setPedido({})}
          crear={filas => {
            try { sessionStorage.setItem('repo_items', JSON.stringify(filas.map(({ p, n }) => ({ id: p.id, code: p.code, name: p.name, quantity: n, cost: p.cost_usd || 0 })))) } catch { /* sin storage */ }
            router.push('/compras?new=1&from=reposicion')
          }} />
      )}

      {verReglas && <PanelReglas onCerrar={cerrarReglas} onGuardado={() => { setVerReglas(false); onReload() }} />}
    </div>
  )
}

// ── Reponer: agrupado por urgencia, el único color está en «Te alcanza» ─────────────────────────────────────────
function Reponer({ lista, orden, r, pedido, setPedido }: { lista: P[]; orden: string; r: ReglasStock; pedido: Record<number, number>; setPedido: (f: (p: Record<number, number>) => Record<number, number>) => void }) {
  const ord = (l: P[]) => [...l].sort(orden === 'ganancia' ? (a, b) => b.ganancia_mensual - a.ganancia_mensual
    : orden === 'nombre' ? (a, b) => String(a.name).localeCompare(String(b.name)) : (a, b) => a.cobertura_total - b.cobertura_total)
  const grupos = orden === 'urgencia'
    ? GRUPOS.map(g => ({ ...g, filas: ord(lista.filter(p => p.prioridad === g.k)) })).filter(g => g.filas.length)
    : [{ k: 'todos', t: '', ayuda: '', filas: ord(lista) }]
  const marcar = (p: P) => setPedido(x => { const n = { ...x }; if (p.id in n) delete n[p.id]; else n[p.id] = Math.max(1, p.sugerido_comprar); return n })
  const conSugerido = lista.filter(p => p.sugerido_comprar > 0)
  const todos = conSugerido.length > 0 && conSugerido.every(p => p.id in pedido)

  if (!lista.length) return <Vacio t="No hay nada para reponer. Todo alcanza según tus reglas." />
  const alcanza = (p: P) => (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-medium tabular-nums ${p.prioridad === 'URGENTE' ? 'text-red-600' : p.prioridad === 'PEDIR' ? 'text-amber-700' : 'text-neutral-500'}`}
      title={`Con lo que tienes: ${m(p.cobertura)}. Con lo que viene en camino: ${m(p.cobertura_total)}. Tarda ${m(r.llegada)} en llegar.`}>
      <span className={`h-2 w-2 rounded-full ${p.prioridad === 'URGENTE' ? 'bg-red-500' : p.prioridad === 'PEDIR' ? 'bg-amber-400' : 'bg-neutral-300'}`} />
      {p.cobertura_total >= 999 ? '—' : m(p.cobertura_total)}
    </span>
  )
  const vende = (p: P) => <>{(p.demanda_mensual ?? p.venta_mensual).toLocaleString('es-VE')}
    {p.demanda_mensual > p.venta_mensual && <span className="ml-0.5 text-neutral-400" title={`Estuvo agotado: tuvo stock ${p.dias_stock_6m} días. Por calendario vende ${p.venta_mensual}/mes; con stock vendería ${p.demanda_mensual}/mes.`}>*</span>}</>
  const comprar = (p: P) => p.id in pedido
    ? <input type="number" min={1} value={pedido[p.id]} aria-label={`Comprar ${p.name}`}
        onChange={e => { const v = Math.max(1, Math.round(Number(e.target.value) || 1)); setPedido(x => ({ ...x, [p.id]: v })) }}
        className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm tabular-nums" />
    : <span className="font-semibold tabular-nums text-neutral-900">{p.sugerido_comprar || '—'}</span>

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-xs text-neutral-600">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={todos} onChange={() => setPedido(() => todos ? {} : Object.fromEntries(conSugerido.map(p => [p.id, p.sugerido_comprar])))} />
          Marcar todo lo sugerido
        </label>
        <span className="ml-auto text-neutral-400">{lista.length} productos</span>
      </div>
      {/* Escritorio */}
      <table className="hidden w-full text-sm md:table">
        <thead className="text-left text-xs text-neutral-500">
          <tr className="border-b border-neutral-100">
            <th className="w-10 px-4 py-2" /><th className="py-2 pr-3 font-medium">Producto</th>
            <th className="px-3 py-2 text-right font-medium">Tienes</th><th className="px-3 py-2 text-right font-medium">Vendes al mes</th>
            <th className="px-3 py-2 font-medium">Te alcanza</th><th className="px-3 py-2 text-right font-medium">Comprar</th>
            <th className="px-4 py-2 text-right font-medium">Ganancia/mes</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map(g => [
            g.t ? <tr key={`g-${g.k}`} className="bg-neutral-50/70"><td colSpan={7} className="px-4 py-1.5 text-xs">
              <b className="font-semibold text-neutral-800">{g.t}</b> <span className="text-neutral-400">· {g.filas.length} · {g.ayuda}</span></td></tr> : null,
            ...g.filas.map(p => (
              <tr key={p.id} onClick={e => { if ((e.target as HTMLElement).tagName !== 'INPUT') marcar(p) }}
                className={`cursor-pointer border-t border-neutral-100 ${p.id in pedido ? 'bg-lime-50/60' : 'hover:bg-neutral-50'}`}>
                <td className="px-4 py-2.5"><input type="checkbox" checked={p.id in pedido} onChange={() => marcar(p)} onClick={e => e.stopPropagation()} aria-label={`Marcar ${p.name}`} /></td>
                <td className="py-2.5 pr-3"><Nombre p={p} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.stock_actual}{p.en_transito > 0 && <span className="block text-xs text-neutral-500">+{p.en_transito} en camino</span>}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{vende(p)}</td>
                <td className="px-3 py-2.5">{alcanza(p)}</td>
                <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>{comprar(p)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-500">${money(p.ganancia_mensual)}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
      {/* Celular: tarjetas */}
      <div className="divide-y divide-neutral-100 md:hidden">
        {grupos.map(g => (
          <div key={g.k}>
            {g.t && <p className="bg-neutral-50/70 px-4 py-1.5 text-xs"><b className="text-neutral-800">{g.t}</b> <span className="text-neutral-400">· {g.filas.length}</span></p>}
            {g.filas.map(p => (
              <div key={p.id} className={`flex gap-3 px-4 py-3 ${p.id in pedido ? 'bg-lime-50/60' : ''}`}>
                <input type="checkbox" className="mt-1" checked={p.id in pedido} onChange={() => marcar(p)} aria-label={`Marcar ${p.name}`} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Nombre p={p} />
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600">
                    <span>Tienes <b className="text-neutral-900">{p.stock_actual}</b>{p.en_transito > 0 ? ` +${p.en_transito}` : ''}</span>
                    <span>Vende <b className="text-neutral-900">{vende(p)}</b>/mes</span>
                    {alcanza(p)}
                  </div>
                </div>
                <div className="text-right"><span className="block text-[11px] text-neutral-500">Comprar</span>{comprar(p)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Nombre({ p }: { p: P }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-neutral-900" title={p.name}>{p.name}
        {p.historial_roto && <span className="ml-1 cursor-help text-amber-600" title={`El historial de movimientos no cierra con el stock (desfase de ${p.historial_desfase} u): se calcula por calendario, sin ajuste por días con stock.`}>⚠</span>}
      </p>
      <p className="text-xs text-neutral-400"><span className="font-mono">{p.code}</span>{p.categoria ? ` · ${p.categoria}` : ''}</p>
    </div>
  )
}

// ── Lista simple (Cayendo / Parados / Nuevos): tabla en escritorio, tarjetas en el celular ─────────────────────
type Col = { t: string; v: (p: P) => React.ReactNode; fuerte?: boolean; title?: (p: P) => string }
function Lista({ filas, cols, accion, vacio }: { filas: P[]; cols: Col[]; accion?: (p: P) => React.ReactNode; vacio: string }) {
  if (!filas.length) return <Vacio t={vacio} />
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <table className="hidden w-full text-sm md:table">
        <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
          <tr><th className="px-4 py-2 font-medium">Producto</th>{cols.map(c => <th key={c.t} className="px-3 py-2 text-right font-medium">{c.t}</th>)}{accion && <th className="w-28 px-4 py-2" />}</tr>
        </thead>
        <tbody>
          {filas.map(p => (
            <tr key={p.id} className="border-t border-neutral-100 hover:bg-neutral-50">
              <td className="max-w-xs px-4 py-2.5"><Nombre p={p} /></td>
              {cols.map(c => <td key={c.t} title={c.title?.(p)} className={`px-3 py-2.5 text-right tabular-nums ${c.fuerte ? 'font-semibold text-neutral-900' : 'text-neutral-600'}`}>{c.v(p)}</td>)}
              {accion && <td className="px-4 py-2.5 text-right">{accion(p)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="divide-y divide-neutral-100 md:hidden">
        {filas.map(p => (
          <div key={p.id} className="space-y-1.5 px-4 py-3">
            <div className="flex items-start justify-between gap-2"><Nombre p={p} />{accion?.(p)}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
              {cols.map(c => <span key={c.t}>{c.t}: <b className={c.fuerte ? 'text-neutral-900' : 'font-medium text-neutral-700'}>{c.v(p)}</b></span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Desactivar({ p, ocupado, onClick }: { p: P; ocupado: number | null; onClick: (p: P) => void }) {
  return p.stock_actual === 0
    ? <button onClick={() => onClick(p)} disabled={ocupado === p.id} className="btn-secondary px-2.5 py-1 text-xs">{ocupado === p.id ? '…' : 'Desactivar'}</button>
    : <span className="text-xs text-neutral-400" title="Para desactivarlo, primero véndelo o ajusta el stock a 0">con stock</span>
}

function Vacio({ t }: { t: string }) {
  return <p className="rounded-xl border border-dashed border-neutral-200 bg-white py-10 text-center text-sm text-neutral-400">{t}</p>
}

// ── Barra del pedido: crear la compra o descargarlo ─────────────────────────────────────────────────────────────
function BarraPedido({ repo, pedido, limpiar, crear }: { repo: P[]; pedido: Record<number, number>; limpiar: () => void; crear: (f: { p: P; n: number }[]) => void }) {
  const filas = Object.entries(pedido).map(([id, n]) => ({ p: repo.find(x => x.id === Number(id)), n })).filter(f => f.p)
    .sort((a, b) => String(a.p.code).localeCompare(String(b.p.code)))
  const unidades = filas.reduce((s, f) => s + f.n, 0)
  const costo = filas.reduce((s, f) => s + (f.p.cost || 0) * f.n, 0)
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
  const excel = () => {
    const aoa: (string | number)[][] = [['Código', 'Producto', 'Comprar', 'Tienes', 'En camino', 'Vende al mes', 'Costo unit', 'Costo total'],
      ...filas.map(({ p, n }) => [p.code, p.name, n, p.stock_actual, p.en_transito, p.demanda_mensual ?? p.venta_mensual, Math.round((p.cost || 0) * 100) / 100, Math.round((p.cost || 0) * n * 100) / 100]),
      [], ['', 'TOTAL', unidades, '', '', '', '', Math.round(costo * 100) / 100]]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 10 }, { wch: 44 }, { wch: 9 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 11 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Pedido'); XLSX.writeFile(wb, `pedido_${hoy}.xlsx`)
  }
  const txt = () => {
    const sep = '-'.repeat(48)
    const t = [`PEDIDO — ${hoy.split('-').reverse().join('/')}`, sep, ...filas.map(({ p, n }) => `${String(p.code).padEnd(10)} ${String(n).padStart(4)} u   ${p.name}`), sep,
      `TOTAL: ${filas.length} productos · ${unidades} unidades`].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' })); a.download = `pedido_${hoy}.txt`; a.click(); URL.revokeObjectURL(a.href)
  }
  return (
    <div data-barra-fija className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 px-4 md:bottom-4">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl bg-neutral-900 px-4 py-3 text-white shadow-lg">
        <p className="text-sm"><b>{filas.length}</b> producto{filas.length === 1 ? '' : 's'} · <b>{unidades}</b> u · <b>${money(costo)}</b></p>
        <div className="flex flex-wrap gap-2">
          <button onClick={limpiar} className="px-2 py-1.5 text-sm text-neutral-300 hover:text-white">Limpiar</button>
          <button onClick={excel} className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm hover:bg-neutral-800">Excel</button>
          <button onClick={txt} className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm hover:bg-neutral-800">TXT</button>
          <button onClick={() => crear(filas)} className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100">Crear compra</button>
        </div>
      </div>
    </div>
  )
}

// ── ⚙ Reglas: las decide cada empresa ───────────────────────────────────────────────────────────────────────────
const CAMPOS: { k: keyof ReglasStock; t: string; ayuda: string; sufijo: string; paso: number }[] = [
  { k: 'llegada', t: '¿Cuánto tarda en llegarte la mercancía?', ayuda: 'Desde que pides hasta que la tienes. Por debajo de esto te avisamos que repongas.', sufijo: 'meses', paso: 0.25 },
  { k: 'urgente', t: 'Es urgente si te alcanza para menos de', ayuda: 'Contando lo que ya viene en camino.', sufijo: 'meses', paso: 0.25 },
  { k: 'objetivo', t: 'Cuando pidas, compra para', ayuda: 'Lo sugerido llena este tiempo de ventas.', sufijo: 'meses', paso: 0.5 },
  { k: 'historia', t: 'Para saber cuánto vendes, mirar los últimos', ayuda: 'El promedio de ventas al mes sale de este período.', sufijo: 'meses', paso: 1 },
  { k: 'minimo', t: 'Vale la pena reponer si vende al menos', ayuda: 'Lo que vende menos no se sugiere, aunque esté en cero.', sufijo: 'al mes', paso: 1 },
  { k: 'paradoUnidades', t: 'Está parado si vendió menos de', ayuda: 'Teniendo stock. Va a «Parados» (candidatos a remate).', sufijo: 'unidades', paso: 1 },
  { k: 'paradoMeses', t: '…en los últimos', ayuda: '', sufijo: 'meses', paso: 1 },
  { k: 'nuevo', t: 'Es recién llegado si lleva menos de', ayuda: 'En inventario. Mientras tanto no se juzga como parado.', sufijo: 'meses', paso: 1 },
  { k: 'cayendo', t: 'Para ver si se está cayendo, comparar los últimos', ayuda: 'Contra el mismo tiempo anterior: se cae si vende la mitad o menos.', sufijo: 'meses', paso: 1 },
]

function PanelReglas({ onCerrar, onGuardado }: { onCerrar: () => void; onGuardado: () => void }) {
  const [d, setD] = useState<{ reglas: ReglasStock; recomendadas: ReglasStock; importacion: ReglasStock; editar: boolean } | null>(null)
  const [f, setF] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    let vivo = true
    fetch('/api/reports/stock-reglas', { cache: 'no-store' }).then(r => r.json()).then(x => {
      if (!vivo) return
      if (x.reglas) { setD(x); setF(Object.fromEntries(Object.entries(x.reglas).map(([k, v]) => [k, String(v)]))) } else setError(x.error ?? 'No se pudieron leer las reglas')
    }).catch(() => { if (vivo) setError('No se pudieron leer las reglas') })
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', k)
    return () => { vivo = false; window.removeEventListener('keydown', k) }
  }, [onCerrar])
  const usar = (r: ReglasStock) => setF(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])))
  const valores = useMemo(() => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(String(v).replace(',', '.'))])), [f])
  const guardar = async () => {
    setGuardando(true); setError(null)
    const r = await fetch('/api/reports/stock-reglas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valores) })
    const x = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(x.error ?? 'No se pudo guardar'); return }
    onGuardado()
  }
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Reglas del análisis de stock">
      <div className="absolute inset-0 bg-black/20" onClick={onCerrar} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Reglas del análisis</h2>
            <p className="text-sm text-neutral-500">Así decide el sistema qué reponer, qué está parado y qué se está cayendo.</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="text-xl leading-none text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!d ? <p className="text-sm text-neutral-500">{error ?? 'Cargando…'}</p> : <>
            {d.editar && (
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="self-center text-neutral-500">Partir de:</span>
                <button onClick={() => usar(d.recomendadas)} className="btn-secondary px-2.5 py-1 text-xs">Compras locales</button>
                <button onClick={() => usar(d.importacion)} className="btn-secondary px-2.5 py-1 text-xs">Importación (~4 meses)</button>
              </div>
            )}
            {CAMPOS.map(c => (
              <label key={c.k} className="block">
                <span className="text-sm font-medium text-neutral-800">{c.t}</span>
                <span className="mt-1 flex items-center gap-2">
                  <input type="number" inputMode="decimal" step={c.paso} min={0} value={f[c.k] ?? ''} disabled={!d.editar}
                    onChange={e => setF(x => ({ ...x, [c.k]: e.target.value }))}
                    className="w-24 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-right text-sm tabular-nums disabled:bg-neutral-50" />
                  <span className="text-sm text-neutral-500">{c.sufijo}</span>
                </span>
                {c.ayuda && <span className="mt-0.5 block text-xs text-neutral-500">{c.ayuda}</span>}
              </label>
            ))}
            {!d.editar && <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">Para cambiarlas hace falta el permiso «Configurar inventario».</p>}
            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          </>}
        </div>
        {d?.editar && (
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <button onClick={onCerrar} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={guardar} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Guardando…' : 'Guardar reglas'}</button>
          </div>
        )}
      </aside>
    </div>
  )
}
