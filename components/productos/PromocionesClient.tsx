'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader, EmptyState, FilterPills, Pagination } from '@/components/ui'
import { envioPorTransportista, topeDescuento, type EstadoEnvio } from '@/lib/mlShipping'
import type { CampanaML, PromoDeItem } from '@/lib/promocionesML'

// Promociones de MercadoLibre, Fase 1: SOLO LECTURA (migración 094). Por publicación: en qué campañas
// de ML está o puede entrar, su peso (del portal de MercadoEnvíos) y el envío gratis por transportista
// al precio actual, con el descuento máximo que aguanta sin perderlo (ZOOM y TEALCA, o solo TEALCA).

export interface CampanaVista extends CampanaML { cuentas: string[]; adentro: number; candidatas: number }
export interface FilaPromo {
  id: string; cuenta: string; titulo: string; precio: number; producto: string | null
  peso: number | null; pesoFuente: 'portal' | 'producto' | null
  promos: (PromoDeItem & { nombre: string })[]
}

type Filtro = 'todas' | 'adentro' | 'candidatas' | 'tealca' | 'destino' | 'sin_peso'
const POR_PAGINA = 50

const usd = (n: number | null | undefined) => n == null ? '—' : `$${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })}%`
const fecha = (s: string | null) => s ? new Date(s).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit' }) : '—'
const cuando = (s: string | null) => s ? new Date(s).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' }) : 'nunca'
const urlML = (id: string) => `https://articulo.mercadolibre.com.ve/${id.replace(/^MLV/, 'MLV-')}`

const ENVIO: Record<EstadoEnvio, { t: string; c: string }> = {
  ambas:    { t: 'ZOOM y TEALCA', c: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  tealca:   { t: 'Solo TEALCA',   c: 'bg-amber-50 text-amber-800 border-amber-200' },
  destino:  { t: 'Cobro a destino', c: 'bg-red-50 text-red-700 border-red-200' },
  sin_peso: { t: 'Sin peso',      c: 'bg-neutral-50 text-neutral-500 border-neutral-200' },
}

export default function PromocionesClient({ filas, campanas, cuentas, pesosAl, conPagosME }: {
  filas: FilaPromo[]; campanas: CampanaVista[]
  cuentas: { nombre: string; actualizado_at: string; error: string | null }[]
  pesosAl: string | null; conPagosME: boolean
}) {
  const router = useRouter()
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [cuenta, setCuenta] = useState('')
  const [campana, setCampana] = useState('')
  const [buscar, setBuscar] = useState('')
  const [pagina, setPagina] = useState(1)
  const [busy, setBusy] = useState<'ml' | 'pesos' | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Cálculo por fila: precio actual (el de la campaña en la que está, si está en alguna) y envío gratis.
  const vistas = useMemo(() => filas.map(f => {
    const adentro = f.promos.filter(p => p.estado === 'started' && p.precio != null)
    const enPromo = adentro.length ? adentro.reduce((a, b) => (b.precio! < a.precio! ? b : a)) : null
    const actual = enPromo?.precio ?? f.precio
    const envio = envioPorTransportista(f.peso, actual)
    return {
      ...f, enPromo, actual,
      descuento: enPromo && f.precio > 0 ? (1 - actual / f.precio) * 100 : 0,
      candidatas: f.promos.filter(p => p.estado === 'candidate'),
      envio,
      topeAmbas: topeDescuento(f.precio, envio.minZoom),
      topeTealca: topeDescuento(f.precio, envio.minTealca),
    }
  }), [filas])

  const base = vistas.filter(v => (!cuenta || v.cuenta === cuenta) && (!campana || v.promos.some(p => p.campana === campana)))
  const cuenta_ = (fn: (v: typeof vistas[number]) => boolean) => base.filter(fn).length
  const filtros: Record<Filtro, (v: typeof vistas[number]) => boolean> = {
    todas: () => true,
    adentro: v => !!v.enPromo,
    candidatas: v => v.candidatas.length > 0,
    tealca: v => v.envio.estado === 'tealca',
    destino: v => v.envio.estado === 'destino',
    sin_peso: v => v.envio.estado === 'sin_peso',
  }
  const q = buscar.trim().toLowerCase()
  const lista = base.filter(filtros[filtro]).filter(v => !q || v.titulo.toLowerCase().includes(q) || v.id.toLowerCase().includes(q) || (v.producto ?? '').toLowerCase().includes(q))
  const visibles = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  const actualizarML = async () => {
    setBusy('ml'); setError(null); setAviso('Leyendo campañas y precios de MercadoLibre… puede tardar un minuto.')
    const r = await fetch('/api/promociones/actualizar', { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setAviso(null); setError(d.error ?? 'No se pudo actualizar'); return }
    const res = (d.resultado ?? []) as { cuenta: string; ok: boolean; publicaciones?: number; campanas?: number; error?: string }[]
    setAviso(res.map(x => x.ok ? `${x.cuenta}: ${x.publicaciones} publicaciones, ${x.campanas} campañas` : `${x.cuenta}: error (${x.error})`).join(' · ') || 'Sin cuentas activas')
    router.refresh()
  }
  const actualizarPesos = async () => {
    setBusy('pesos'); setError(null); setAviso(null)
    const r = await fetch('/api/promociones/pesos', { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setError(d.error ?? 'No se pudo pedir'); return }
    setAviso('Pedido enviado a la PC de Pagos ME: trae los pesos del portal en 1–2 minutos (la PC tiene que estar prendida). Recarga la página después.')
  }

  const sinFoto = cuentas.length === 0

  return (
    <div className="space-y-4">
      <PageHeader title="Promociones" subtitle="Campañas de MercadoLibre y envío gratis por transportista · solo lectura"
        actions={<>
          <Link href="/productos" className="btn-secondary text-sm whitespace-nowrap">← Productos</Link>
          {conPagosME && (
            <button onClick={actualizarPesos} disabled={!!busy} className="btn-secondary text-sm whitespace-nowrap"
              title="Lee los pesos del portal de MercadoEnvíos con el programa de la PC (Pagos ME)">
              {busy === 'pesos' ? 'Pidiendo…' : 'Actualizar pesos'}
            </button>
          )}
          <button onClick={actualizarML} disabled={!!busy} className="btn-primary text-sm whitespace-nowrap">
            {busy === 'ml' ? 'Actualizando…' : 'Actualizar desde MercadoLibre'}
          </button>
        </>} />

      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-600 flex flex-wrap gap-x-5 gap-y-1">
        {cuentas.map(c => (
          <span key={c.nombre}>
            <b className="text-neutral-800">{c.nombre}</b> · MercadoLibre {cuando(c.actualizado_at)}
            {c.error && <span className="text-red-700"> · error: {c.error}</span>}
          </span>
        ))}
        <span>Pesos del portal: {cuando(pesosAl)}{conPagosME ? ' (se traen solos 1 vez al día)' : ''}</span>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      {aviso && <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">{aviso}</div>}

      {sinFoto ? (
        <EmptyState message='Todavía no se leyó nada de MercadoLibre. Toca "Actualizar desde MercadoLibre".' />
      ) : <>
        {/* Campañas */}
        {campanas.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campanas.map(c => (
              <button key={c.id} onClick={() => { setCampana(campana === c.id ? '' : c.id); setPagina(1) }}
                className={`text-left rounded-xl border px-4 py-3 bg-white transition-colors ${campana === c.id ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-neutral-200 hover:border-neutral-300'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-neutral-900">{c.nombre}</div>
                  <span className="text-[11px] text-neutral-400 whitespace-nowrap">{c.tipo}</span>
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">{fecha(c.inicio)} → {fecha(c.fin)} · entrar hasta {fecha(c.limite)} · {c.cuentas.join(', ')}</div>
                <div className="text-sm mt-2"><b>{c.adentro}</b> adentro · <b>{c.candidatas}</b> pueden entrar</div>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <FilterPills<Filtro> value={filtro} onChange={v => { setFiltro(v); setPagina(1) }} options={[
            { value: 'todas', label: 'Todas', count: base.length },
            { value: 'adentro', label: 'En promoción', count: cuenta_(filtros.adentro) },
            { value: 'candidatas', label: 'Pueden entrar', count: cuenta_(filtros.candidatas) },
            { value: 'tealca', label: 'Pierden ZOOM', count: cuenta_(filtros.tealca) },
            { value: 'destino', label: 'Cobro a destino', count: cuenta_(filtros.destino) },
            { value: 'sin_peso', label: 'Sin peso', count: cuenta_(filtros.sin_peso) },
          ]} />
          {cuentas.length > 1 && (
            <select value={cuenta} onChange={e => { setCuenta(e.target.value); setPagina(1) }} className="border border-neutral-300 rounded-lg px-2 py-1 text-sm">
              <option value="">Todas las cuentas</option>
              {cuentas.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
            </select>
          )}
          <input value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(1) }} placeholder="Buscar título, MLV o código"
            className="border border-neutral-300 rounded-lg px-3 py-1 text-sm ml-auto w-full sm:w-64" />
        </div>

        {lista.length === 0 ? <EmptyState message="Nada con este filtro." /> : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left">Publicación</th>
                  <th className="px-3 py-2 text-right">Peso</th>
                  <th className="px-3 py-2 text-right">Publicado</th>
                  <th className="px-3 py-2 text-left">En promoción</th>
                  <th className="px-3 py-2 text-left">Puede entrar</th>
                  <th className="px-3 py-2 text-left">Envío gratis hoy</th>
                  <th className="px-3 py-2 text-left">Descuento máximo</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(v => (
                  <tr key={`${v.cuenta}-${v.id}`} className="border-t border-neutral-100 align-top">
                    <td className="px-3 py-2 max-w-[320px]">
                      <a href={urlML(v.id)} target="_blank" rel="noreferrer" className="text-neutral-900 hover:underline line-clamp-2">{v.titulo}</a>
                      <div className="text-[11px] text-neutral-400">{v.id} · {v.cuenta}{v.producto ? ` · ${v.producto}` : ''}</div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {v.peso != null ? <>{v.peso.toLocaleString('de-DE')} kg<div className="text-[11px] text-neutral-400">{v.pesoFuente === 'portal' ? 'portal' : 'producto'}</div></> : <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{usd(v.precio)}</td>
                    <td className="px-3 py-2 text-xs">
                      {v.enPromo ? <>
                        <div className="font-medium text-neutral-900">{usd(v.actual)} <span className="text-emerald-700">−{pct(v.descuento)}</span></div>
                        <div className="text-neutral-500">{v.enPromo.nombre}</div>
                      </> : <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {v.candidatas.length ? v.candidatas.map(p => (
                        <div key={p.campana}>{p.nombre}{p.minimo != null && <span className="text-neutral-400"> · desde {usd(p.minimo)}</span>}</div>
                      )) : <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`inline-block px-2 py-0.5 rounded-full border ${ENVIO[v.envio.estado].c}`}>{ENVIO[v.envio.estado].t}</span>
                      {v.envio.minZoom != null && <div className="text-[11px] text-neutral-400 mt-0.5">mín. ZOOM {usd(v.envio.minZoom)} · TEALCA {usd(v.envio.minTealca)}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {v.envio.estado === 'sin_peso' ? <span className="text-neutral-400">falta el peso</span> : <>
                        <div>{v.topeAmbas != null ? <>ambas hasta <b>{pct(v.topeAmbas)}</b></> : <span className="text-neutral-400">ZOOM no llega</span>}</div>
                        <div>{v.topeTealca != null ? <>TEALCA hasta <b>{pct(v.topeTealca)}</b></> : <span className="text-red-600">TEALCA no llega</span>}</div>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination total={lista.length} page={pagina} pageSize={POR_PAGINA} onChange={setPagina} />
          </div>
        )}
        <p className="text-xs text-neutral-400">
          El descuento máximo se calcula sobre el precio publicado y la tabla de MercadoEnvíos (oct-2026) de cada transportista.
          Esta versión no ve los descuentos individuales que hayas puesto a mano en una publicación; solo las campañas.
        </p>
      </>}
    </div>
  )
}
