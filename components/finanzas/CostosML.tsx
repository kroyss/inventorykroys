'use client'
import { useCallback, useEffect, useState } from 'react'
import { money } from '@/components/ui'
import { MonthField } from '@/components/ui/DateField'

// Finanzas → Costos ML (lib/costosEnviosML.ts): costo de los envíos gratis de ML Venezuela por cuenta y mes calendario,
// calculado desde las guías de Despachos y la tabla de costos por peso, al lado de lo que ML facturó.
type Tramo = { maxKg: number; c1: number; c2: number; c3: number }
type Guia = { guia: string; venta: string | null; fecha: string; carrier: string; productos: string | null; peso: number | null; sinPeso: boolean; rango: string; usd: number; estimado: boolean }
type Cargo = { fecha: string; tipo: 'envios' | 'mi_pagina' | 'otro'; detalle: string; bs: number }
type Cuenta = {
  conexionId: number; cuenta: string; envios: number; columna: string; usd: number; usdEstimado: number; sinPeso: number
  guias: Guia[]; facturado: { cargos: Cargo[]; error?: string; consultado?: string } | null
}
type Datos = { mes: string; tabla: Tramo[]; bcv: number | null; bcvFecha: string | null; cuentas: Cuenta[] }

const mesAnterior = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const bs = (n: number) => `Bs ${money(n)}`

export default function CostosML() {
  const [mes, setMes] = useState(mesAnterior)
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [verTabla, setVerTabla] = useState(false)

  const cargar = useCallback(() => {
    setD(null); setError(null)
    fetch(`/api/finance/costos-ml?mes=${mes}&factura=1`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setError(j.error ?? 'No se pudo cargar'); else setD(j)
    })
  }, [mes])
  useEffect(() => { cargar() }, [cargar])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthField value={mes} onChange={(v: string) => setMes(v)} />
        <button type="button" onClick={() => setVerTabla(v => !v)} className="text-sm text-sky-700">
          {verTabla ? 'Ocultar tabla de costos' : 'Ver / editar tabla de costos de ML'}</button>
      </div>
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 space-y-1">
        <p>MercadoLibre Venezuela cobra los envíos gratis del <b>mes calendario</b> según el peso y cuántos envíos tuvo cada cuenta, a tasa BCV, en los primeros 7 días del mes siguiente (&laquo;Cargo Especial&raquo;). Aquí se calcula con las guías subidas a <b>Despachos</b> y el peso de cada producto. Como ML, cada guía cuenta en el mes en que se <b>cerró la orden</b> (las del 31 que se suben el 1 van al mes anterior) y no se cuentan las de <b>cobro a destino</b> (esas las paga el comprador).</p>
        <p className="text-xs">Una guía generada se cobra aunque la venta se cancele: si lo facturado da un poco más, suele ser por guías que no se subieron a Despachos. Las que vienen <b>a cobro destino</b> no se cobran.</p>
      </div>

      {verTabla && d && <TablaCostos tabla={d.tabla} onGuardada={cargar} />}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {!d && !error && <p className="text-sm text-neutral-500">Calculando…</p>}

      {d && (
        <>
          <p className="text-xs text-neutral-500">Tasa BCV usada: {d.bcv ? `${money(d.bcv)} Bs/$ (${d.bcvFecha})` : 'sin tasa'} · último día del mes con tasa.</p>
          {!d.cuentas.length && <p className="text-sm text-neutral-500">No hay cuentas de MercadoLibre Venezuela conectadas.</p>}
          <div className="grid gap-4 xl:grid-cols-2">
            {d.cuentas.map(c => {
              const cargos = c.facturado?.cargos ?? []
              const envios = cargos.filter(x => x.tipo === 'envios').reduce((s, x) => s + x.bs, 0)
              const miPagina = cargos.filter(x => x.tipo === 'mi_pagina').reduce((s, x) => s + x.bs, 0)
              const otros = cargos.filter(x => x.tipo === 'otro')
              const envUsd = d.bcv && envios ? envios / d.bcv : null
              const dif = envUsd != null ? envUsd - c.usdEstimado : null
              const prom = c.envios ? c.usdEstimado / c.envios : 0
              return (
                <div key={c.conexionId} className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-neutral-900">{c.cuenta}</p>
                    <p className="text-xs text-neutral-500">{c.envios} guías · {c.columna}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-neutral-50 p-3">
                      <p className="text-xs text-neutral-500">Calculado (tabla ML)</p>
                      <p className="text-lg font-semibold num">${money(c.usdEstimado)}</p>
                      {d.bcv ? <p className="text-xs text-neutral-500 num">{bs(c.usdEstimado * d.bcv)}</p> : null}
                    </div>
                    <div className="rounded-lg bg-neutral-50 p-3">
                      <p className="text-xs text-neutral-500">Facturado por ML (envíos)</p>
                      {c.facturado?.error ? <p className="text-xs text-amber-700">{c.facturado.error}</p>
                        : envios ? <>
                          <p className="text-lg font-semibold num">{envUsd != null ? `$${money(envUsd)}` : '—'}</p>
                          <p className="text-xs text-neutral-500 num">{bs(envios)}</p>
                        </> : <p className="text-xs text-neutral-500">Todavía no aparece (ML lo carga los primeros 7 días del mes siguiente)</p>}
                    </div>
                  </div>
                  {dif != null && (
                    <p className={`text-xs ${Math.abs(dif) <= Math.max(2, c.usdEstimado * 0.05) ? 'text-green-700' : 'text-amber-700'}`}>
                      Diferencia: {dif >= 0 ? '+' : '−'}${money(Math.abs(dif))}
                      {prom > 0 && Math.abs(dif) >= prom ? ` (≈ ${Math.round(Math.abs(dif) / prom)} guías ${dif > 0 ? 'que ML cobró y no están en Despachos' : 'de más en Despachos'})` : ''}
                    </p>
                  )}
                  {c.sinPeso > 0 && (
                    <p className="text-xs text-amber-700">{c.sinPeso} guías son de productos sin peso: se calcularon con el promedio. <a href="/productos/mercadoenvios" className="underline">Cargar pesos</a></p>
                  )}
                  {(miPagina > 0 || otros.length > 0) && (
                    <div className="text-xs text-neutral-600 space-y-0.5">
                      {miPagina > 0 && <p>Mi página: {bs(miPagina)}{d.bcv ? ` (≈ $${money(miPagina / d.bcv)})` : ''}</p>}
                      {otros.map((x, i) => <p key={i}>Otro cargo especial {x.fecha}: {bs(x.bs)}</p>)}
                    </div>
                  )}
                  {c.guias.length > 0 && (
                    <button type="button" onClick={() => setAbierta(a => a === c.conexionId ? null : c.conexionId)} className="text-xs text-sky-700">
                      {abierta === c.conexionId ? 'Ocultar guías' : `Ver las ${c.guias.length} guías`}</button>
                  )}
                  {abierta === c.conexionId && (
                    <div className="max-h-96 overflow-auto rounded-lg border border-neutral-200">
                      <table className="w-full text-xs">
                        <thead className="bg-neutral-50 text-neutral-500 sticky top-0">
                          <tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Guía</th><th className="p-2 text-left">Productos</th><th className="p-2 text-right">Peso</th><th className="p-2 text-right">Costo</th></tr>
                        </thead>
                        <tbody>
                          {c.guias.map(g => (
                            <tr key={g.guia} className="border-t border-neutral-100">
                              <td className="p-2 whitespace-nowrap">{g.fecha.slice(8, 10)}/{g.fecha.slice(5, 7)}</td>
                              <td className="p-2 whitespace-nowrap">{g.guia}<span className="block text-neutral-400">{g.carrier} · {g.venta}</span></td>
                              <td className="p-2">{g.productos ?? '—'}</td>
                              <td className="p-2 text-right whitespace-nowrap num">{g.peso != null ? `${money(g.peso)} kg` : <span className="text-amber-700">sin peso</span>}</td>
                              <td className="p-2 text-right whitespace-nowrap num">${money(g.usd)}{g.estimado && <span className="text-neutral-400"> ~</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function TablaCostos({ tabla, onGuardada }: { tabla: Tramo[]; onGuardada: () => void }) {
  const [filas, setFilas] = useState(tabla.map(t => ({ maxKg: String(t.maxKg), c1: String(t.c1), c2: String(t.c2), c3: String(t.c3) })))
  const [msg, setMsg] = useState<string | null>(null)
  const num = (s: string) => Number(s.replace(',', '.'))
  const guardar = async () => {
    const t = filas.filter(f => f.maxKg.trim()).map(f => ({ maxKg: num(f.maxKg), c1: num(f.c1), c2: num(f.c2), c3: num(f.c3) }))
    if (t.some(x => [x.maxKg, x.c1, x.c2, x.c3].some(v => !Number.isFinite(v) || v < 0))) { setMsg('Revisa los números'); return }
    const r = await fetch('/api/finance/costos-ml', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tabla: t }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setMsg(j.error ?? 'No se pudo guardar'); else { setMsg('Guardada'); onGuardada() }
  }
  const campo = (i: number, k: 'maxKg' | 'c1' | 'c2' | 'c3') => (
    <input value={filas[i][k]} inputMode="decimal" onChange={e => setFilas(fs => fs.map((f, j) => j === i ? { ...f, [k]: e.target.value } : f))}
      className="w-20 rounded border border-neutral-300 px-2 py-1 text-right text-xs" />
  )
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3 text-sm">
      <p className="font-medium">Tabla de costos por envío (US$)</p>
      <p className="text-xs text-neutral-500">La que publica MercadoLibre Venezuela. Cada fila es &laquo;hasta X kg&raquo;. Cámbiala solo si ML publica una nueva.</p>
      <div className="overflow-auto">
        <table className="text-xs">
          <thead className="text-neutral-500"><tr><th className="p-1 text-left">Hasta kg</th><th className="p-1">3–50 envíos</th><th className="p-1">51–150</th><th className="p-1">Más de 150</th><th /></tr></thead>
          <tbody>
            {filas.map((_, i) => (
              <tr key={i}><td className="p-1">{campo(i, 'maxKg')}</td><td className="p-1">{campo(i, 'c1')}</td><td className="p-1">{campo(i, 'c2')}</td><td className="p-1">{campo(i, 'c3')}</td>
                <td className="p-1"><button type="button" onClick={() => setFilas(fs => fs.filter((_, j) => j !== i))} className="text-neutral-400 hover:text-red-600">✕</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setFilas(fs => [...fs, { maxKg: '', c1: '', c2: '', c3: '' }])} className="text-xs text-sky-700">+ Agregar fila</button>
        <button type="button" onClick={guardar} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">Guardar tabla</button>
        {msg && <span className="text-xs text-neutral-600">{msg}</span>}
      </div>
    </div>
  )
}
