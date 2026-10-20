'use client'
// Pagos ME → "Comprobar con el banco" (20-10; lógica en lib/conciliacionBanco.ts, API /api/pagos-me/comprobar).
// Se suben los estados de cuenta (Bancamiga, Banesco, Mercantil, Provincial…) y el cruce se hace AQUÍ, en el navegador:
// los archivos no van al servidor. Se confía en lo que dice el banco, no en lo que escribió el comprador.
// Nada se aprueba solo: "Aprobar" = "Pago correcto", con la nota del movimiento del banco.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { BotonComprobante } from '@/components/ventas/VerComprobante'
import type { EstadoCuenta, MovBanco, PagoME as PagoCruce, ResultadoCruce, ResultadoPago } from '@/lib/conciliacionBanco'

interface Pago extends PagoCruce { cuenta: string | null; banco_emisor: string | null; verificacion: string; comprobante: boolean
  venta_estado: string | null }   // ya cargada en Ventas (no sale en Por confirmar)
interface Archivo { nombre: string; datos: ArrayBuffer; banco: string; estado: EstadoCuenta | null; error: string | null }

const BANCOS = ['Bancamiga', 'Banesco', 'Mercantil', 'BBVA Provincial', 'Banco Plaza']
const bs = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dm = (f: string | null) => f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '—'
const ESTADO_VENTA: Record<string, string> = { BORRADOR: 'Borrador', REABIERTA: 'Reabierta', PAGO_VERIFICADO: 'Pago verificado', PROCESADA: 'Procesada', DESCARGADA: 'Despachada', DESCARGADA_LOCAL: 'Entregada' }
const lib = () => import('@/lib/conciliacionBanco')   // xlsx pesa: solo se carga al subir un archivo

const GRUPOS: { k: ResultadoPago['nivel']; t: string; ayuda: string; cls: string }[] = [
  { k: 'seguro',     t: '✅ Seguros',            ayuda: 'Referencia y monto coinciden con el banco',                       cls: 'border-green-200 bg-green-50/40' },
  { k: 'probable',   t: '🟢 Probables',          ayuda: 'Mismo monto y fecha (o banco de origen); la referencia no cruza', cls: 'border-lime-200 bg-lime-50/40' },
  { k: 'revisar',    t: '🟡 Revisar',            ayuda: 'La referencia cruza pero el monto no (llegó menos, o mucho más)', cls: 'border-amber-200 bg-amber-50/40' },
  { k: 'no_aparece', t: '🔴 No aparecen',        ayuda: 'El banco que dijo el comprador está subido y no está el pago',     cls: 'border-red-200 bg-red-50/40' },
  { k: 'sin_estado', t: '⚪ Sin estado de cuenta', ayuda: 'Falta subir el banco (o el archivo no trae ese día)',             cls: 'border-neutral-200 bg-neutral-50' },
]

export default function ComprobarBanco({ onAprobados }: { onAprobados: () => void }) {
  const confirm = useConfirm()
  const [pagos, setPagos] = useState<Pago[] | null>(null)
  const [margen, setMargen] = useState(700)
  const [puedeConfigurar, setPuedeConfigurar] = useState(false)
  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [resultado, setResultado] = useState<ResultadoCruce | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [abierto, setAbierto] = useState<Record<string, boolean>>({ seguro: true, probable: true, revisar: true })
  const [guardado, setGuardado] = useState<number | null>(null)   // pagos con el resultado del banco guardado

  const cargarPagos = useCallback(() => fetch('/api/pagos-me/comprobar', { cache: 'no-store' }).then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudieron cargar los pagos'); return }
    setPagos(d.pagos); setMargen(d.margen); setPuedeConfigurar(d.puedeConfigurar)
  }), [])
  useEffect(() => { cargarPagos() }, [cargarPagos])

  // Cada vez que cambian los archivos, el margen o los pagos: se vuelve a cruzar.
  useEffect(() => {
    if (!pagos) return
    const estados = archivos.map(a => a.estado).filter((e): e is EstadoCuenta => !!e)
    if (!estados.length) return   // sin archivos válidos no se muestra resultado (ver `hayEstados`)
    let vivo = true
    let espera: ReturnType<typeof setTimeout> | undefined
    lib().then(({ cruzarPagos }) => {
      if (!vivo) return
      const r = cruzarPagos(pagos, estados, { margenEmbalaje: margen })
      setResultado(r)
      // Se guarda lo que dijo el banco de cada pago (mig. 110): todo el equipo lo ve en Por confirmar y en la venta.
      // Solo el movimiento que le corresponde, no el estado de cuenta; "sin estado de cuenta" no se guarda.
      espera = setTimeout(() => {
        const resultados = r.pagos.filter(x => x.nivel !== 'sin_estado').map(x => ({
          ids: x.ventas.map(v => v.id), nivel: x.nivel, motivo: x.motivo.slice(0, 300),
          mov: x.mov ? { banco: x.mov.banco.slice(0, 40), fecha: x.mov.fecha, monto: x.mov.monto, ref: x.mov.ref.slice(0, 40), concepto: x.mov.concepto.slice(0, 200) } : null,
        }))
        fetch('/api/pagos-me/comprobar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resultados }) })
          .then(res => res.ok ? res.json() : null).then(d => { if (vivo && d) setGuardado(d.guardados) }).catch(() => {})
      }, 800)
    })
    return () => { vivo = false; if (espera) clearTimeout(espera) }
  }, [pagos, archivos, margen])

  const leer = async (a: Omit<Archivo, 'estado' | 'error'>): Promise<Archivo> => {
    const { leerEstadoCuenta } = await lib()
    try {
      const e = leerEstadoCuenta(new Uint8Array(a.datos), a.nombre, a.banco || undefined)
      return { ...a, banco: e.banco, estado: e.banco === 'Desconocido' ? null : e,
        error: e.banco === 'Desconocido' ? 'No reconocí el banco: elígelo' : e.movimientos.length ? null : 'No encontré créditos en el archivo' }
    } catch (err) {
      return { ...a, estado: null, error: err instanceof Error ? err.message : 'No se pudo leer' }
    }
  }
  const subir = async (files: FileList | null) => {
    if (!files?.length) return
    setError(null)
    const nuevos = await Promise.all([...files].map(async f => leer({ nombre: f.name, datos: await f.arrayBuffer(), banco: '' })))
    setArchivos(as => [...as, ...nuevos])
  }
  const cambiarBanco = async (i: number, banco: string) => {
    const a = await leer({ ...archivos[i], banco })
    setArchivos(as => as.map((x, k) => k === i ? a : x))
  }

  const pendientes = (r: ResultadoPago) => r.ventas.filter(v => (v as Pago).verificacion === 'pendiente') as Pago[]
  const porNivel = useMemo(() => {
    const m: Record<string, ResultadoPago[]> = {}
    for (const r of resultado?.pagos ?? []) if (pendientes(r).length) (m[r.nivel] ??= []).push(r)
    return m
  }, [resultado])

  const nota = (r: ResultadoPago) => r.mov
    ? `Comprobado con el banco: ${r.mov.banco} ${dm(r.mov.fecha)} Bs ${bs(r.mov.monto)}${r.mov.ref ? ` ref ${r.mov.ref}` : ''}`
    : 'Comprobado con el banco'
  const aprobar = async (lista: ResultadoPago[]) => {
    const total = lista.reduce((s, r) => s + pendientes(r).length, 0)
    if (!await confirm({ title: `Aprobar ${total} pago${total === 1 ? '' : 's'}`, confirmText: 'Aprobar',
      message: 'Quedan como "Pago correcto", con la nota del movimiento del banco. Es lo mismo que verificarlos a mano.' })) return
    setOcupado(true); setError(null)
    let ok = 0
    for (const r of lista) {
      const res = await fetch('/api/pagos-me/verificar', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: pendientes(r).map(v => v.id), verificacion: 'valido', nota: nota(r) }) }).catch(() => null)
      if (res?.ok) ok += pendientes(r).length
    }
    setOcupado(false)
    setAviso(`${ok} pago${ok === 1 ? '' : 's'} aprobado${ok === 1 ? '' : 's'}.${ok < total ? ` ${total - ok} no se pudieron guardar: inténtalo de nuevo.` : ''}`)
    await cargarPagos(); onAprobados()
  }

  if (!pagos) return <p className="text-sm text-neutral-400">{error ?? 'Cargando pagos…'}</p>
  const hayEstados = archivos.some(a => a.estado)
  const nPend = pagos.filter(p => p.verificacion === 'pendiente').length

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Sube los estados de cuenta</h2>
            <p className="text-xs text-neutral-500">Bancamiga, Banesco, Mercantil, Provincial… ({nPend} pagos por verificar en los últimos 30 días). Los archivos no salen de tu computadora.</p>
          </div>
          <label className="btn-primary cursor-pointer text-sm">
            + Subir archivos
            <input type="file" multiple accept=".xls,.xlsx,.csv,.html,.htm" className="hidden" onChange={e => { subir(e.target.files); e.target.value = '' }} />
          </label>
        </div>
        {archivos.length > 0 && (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-100 text-sm">
            {archivos.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-neutral-700" title={a.nombre}>{a.nombre}</span>
                <select value={BANCOS.includes(a.banco) ? a.banco : ''} onChange={e => cambiarBanco(i, e.target.value)}
                  className="rounded border border-neutral-300 px-2 py-1 text-xs">
                  <option value="">¿Qué banco?</option>
                  {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                {a.estado
                  ? <span className="text-xs text-neutral-500">{a.estado.movimientos.length} créditos · {dm(a.estado.desde)} al {dm(a.estado.hasta)}</span>
                  : <span className="text-xs text-red-700">{a.error}</span>}
                <button onClick={() => setArchivos(as => as.filter((_, k) => k !== i))} className="px-1 text-neutral-400 hover:text-red-600" title="Quitar">✕</button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          Embalaje opcional: un pago está bien si llegó hasta
          {puedeConfigurar ? (
            <input type="number" min={0} step={50} value={margen} className="w-20 rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-900"
              onChange={e => setMargen(Math.max(0, Number(e.target.value) || 0))}
              onBlur={() => fetch('/api/pagos-me/comprobar', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ margen }) })} />
          ) : <b className="text-neutral-800">{bs(margen)}</b>}
          Bs más por venta.
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {guardado != null && hayEstados && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          🏦 Resultado guardado en {guardado} pago{guardado === 1 ? '' : 's'}: todo el equipo lo ve en cada venta de Por confirmar.
        </div>
      )}
      {aviso && <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">✓ {aviso}</div>}

      {resultado && hayEstados && (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            {GRUPOS.map(g => <span key={g.k} className={`rounded-full border px-2.5 py-1 ${g.cls}`}>{g.t} <b>{porNivel[g.k]?.length ?? 0}</b></span>)}
            {resultado.embalajeSuelto.length > 0 && <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-neutral-500" title="Créditos chicos sin venta: embalaje mandado aparte">Embalaje aparte: {resultado.embalajeSuelto.length}</span>}
            {resultado.sinPago.length > 0 && <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-neutral-500" title="Créditos del banco que no son de ninguna venta de Pagos ME">Créditos sin venta: {resultado.sinPago.length}</span>}
          </div>

          {GRUPOS.map(g => {
            const lista = porNivel[g.k] ?? []
            if (!lista.length) return null
            const aprobables = g.k === 'seguro' || g.k === 'probable'
            return (
              <section key={g.k} className={`rounded-xl border ${g.cls}`}>
                <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <button onClick={() => setAbierto(x => ({ ...x, [g.k]: !x[g.k] }))} className="text-left">
                    <span className="text-sm font-semibold text-neutral-900">{abierto[g.k] ? '▾' : '▸'} {g.t} ({lista.length})</span>
                    <span className="ml-2 text-xs text-neutral-500">{g.ayuda}</span>
                  </button>
                  {g.k === 'seguro' && <button disabled={ocupado} onClick={() => aprobar(lista)} className="btn-primary ml-auto text-xs disabled:opacity-50">Aprobar los {lista.length}</button>}
                </div>
                {abierto[g.k] && (
                  <ul className="divide-y divide-neutral-100 border-t border-neutral-100 bg-white text-sm">
                    {lista.map((r, i) => <FilaResultado key={i} r={r} pendientes={pendientes(r)} aprobable={aprobables} ocupado={ocupado} onAprobar={() => aprobar([r])} />)}
                  </ul>
                )}
              </section>
            )
          })}
          {Object.keys(porNivel).length === 0 && <p className="text-sm text-neutral-500">No hay pagos pendientes para cruzar con estos archivos.</p>}
        </>
      )}
    </div>
  )
}

function FilaResultado({ r, pendientes, aprobable, ocupado, onAprobar }: {
  r: ResultadoPago; pendientes: Pago[]; aprobable: boolean; ocupado: boolean; onAprobar: () => void
}) {
  const p = pendientes[0]
  const m: MovBanco | null = r.mov
  return (
    <li className="grid gap-2 px-4 py-2.5 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="font-mono text-xs text-neutral-800">{pendientes.map(v => v.venta).join(' + ')}</div>
        {p.venta_estado && (
          <a href={`/ventas?venta=${encodeURIComponent(p.venta)}`} className="text-[11px] font-medium text-sky-700 hover:underline"
            title="Ya está cargada en Ventas: por eso no sale en Por confirmar. Ábrela para verificar el pago">
            Ya en Ventas · {ESTADO_VENTA[p.venta_estado] ?? p.venta_estado} → Abrir venta
          </a>
        )}
        <div className="text-xs text-neutral-500">
          Dijo: <b className="text-neutral-700">Bs {bs(pendientes.reduce((s, v) => s + Number(v.monto_pagado ?? 0), 0))}</b> · {dm(p.fecha_pago)}
          {p.referencia ? ` · ref ${p.referencia}` : ''} · {p.banco_emisor ?? '?'} → {p.banco_receptor ?? (p.metodo_pago === 'transfer' ? 'transferencia' : '?')}
        </div>
      </div>
      <div className="min-w-0 text-xs">
        {m ? (
          <>
            <div className="text-neutral-500">Banco: <b className="text-neutral-800">Bs {bs(m.monto)}</b> · {m.banco} · {dm(m.fecha)}{m.ref ? ` · ref ${m.ref}` : ''}</div>
            <div className="truncate text-neutral-400" title={m.concepto}>{m.concepto}</div>
          </>
        ) : <span className="text-neutral-400">—</span>}
        <div className="text-neutral-600">{r.motivo}</div>
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        {p.comprobante && <BotonComprobante pagoId={p.id} venta={p.venta}
          datos={{ monto: p.monto_pagado, totalOrden: p.total_orden, banco: p.banco_emisor, referencia: p.referencia, metodo: p.metodo_pago }} />}
        {aprobable && <button disabled={ocupado} onClick={onAprobar} className="btn-secondary text-xs disabled:opacity-50">Aprobar</button>}
      </div>
    </li>
  )
}
