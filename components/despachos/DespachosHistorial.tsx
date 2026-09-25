'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { PageHeader, EmptyState, Pagination } from '@/components/ui'

interface Jornada {
  id: number
  status: 'ABIERTA' | 'CERRADA'
  opened_at: string
  closed_at: string | null
  bot_csv_at: string | null
  tiene_manifiesto: boolean
  opened_by: string | null
  closed_by: string | null
  lotes: number
  envios: number
}
interface EtiquetaLote { id: number; venta: string | null; guia: string | null; destinatario: string | null; reimpresion: boolean }
interface Lote { id: number; generated_at: string; label_count: number; page_count: number; generated_by: string | null; etiquetas: EtiquetaLote[] }
interface EtiquetaHallada {
  id: number; venta: string | null; guia: string | null; destinatario: string | null; remitente: string | null
  reimpresion: boolean; lote_id: number; generated_at: string; jornada_id: number | null
  jornada_status: string | null; closed_at: string | null
}

const fechaHora = (s: string) => new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
})

// Descarga verificando antes que el archivo exista (si no, muestra el error en vez de bajar un JSON).
async function descargarSeguro(href: string, onError: (m: string) => void) {
  const res = await fetch(href, { method: 'GET' })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    onError(b.error ?? `Error ${res.status}`)
    return
  }
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') ?? ''
  const nombre = decodeURIComponent(cd.match(/filename="([^"]+)"/)?.[1] ?? 'archivo.pdf')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nombre
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function DespachosHistorial() {
  const [page, setPage]         = useState(1)
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [total, setTotal]       = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading]   = useState(true)
  const [abierta, setAbierta]   = useState<number | null>(null)
  const [detalle, setDetalle]   = useState<Record<number, Lote[]>>({})
  const [qInput, setQInput]     = useState('')
  const [q, setQ]               = useState('')
  const [hallazgos, setHallazgos] = useState<EtiquetaHallada[] | null>(null)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 350)
    return () => clearTimeout(t)
  }, [qInput])

  const reqId = useRef(0)
  const cargar = useCallback(() => {
    const my = ++reqId.current
    const url = q ? `/api/despachos/historial?q=${encodeURIComponent(q)}` : `/api/despachos/historial?page=${page}`
    return fetch(url).then(r => r.json()).catch(() => null).then(data => {
      if (my !== reqId.current || !data) return
      if (q) {
        setHallazgos(data.etiquetas ?? [])
      } else {
        setHallazgos(null)
        setJornadas(data.jornadas ?? [])
        setTotal(data.total ?? 0)
        setPageSize(data.pageSize ?? 20)
      }
      setLoading(false)
    })
  }, [q, page])
  useEffect(() => { cargar() }, [cargar])

  const toggle = async (id: number) => {
    if (abierta === id) { setAbierta(null); return }
    setAbierta(id)
    if (!detalle[id]) {
      const data = await fetch(`/api/despachos/jornadas/${id}`).then(r => r.json()).catch(() => null)
      if (data?.lotes) setDetalle(d => ({ ...d, [id]: data.lotes }))
    }
  }

  const bajar = (href: string) => { setError(null); descargarSeguro(href, setError) }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Historial de despachos"
        subtitle="Jornadas, lotes impresos y etiquetas originales — para volver a descargar o revisar"
        actions={<Link href="/despachos" className="btn-secondary text-sm">← Volver a Despachos</Link>}
      />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

      <input type="search" value={qInput} onChange={e => setQInput(e.target.value)}
        placeholder="Buscar por N° de venta, guía, destinatario o remitente…"
        className="w-full sm:w-96 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />

      {hallazgos ? (
        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
          <h2 className="px-4 py-3 border-b border-neutral-100 text-sm font-semibold text-neutral-800">
            Etiquetas impresas que coinciden ({hallazgos.length}{hallazgos.length === 100 ? '+' : ''})
          </h2>
          {hallazgos.length === 0 ? <EmptyState message="Ninguna etiqueta impresa coincide." /> : (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2 text-left">Venta</th><th className="px-4 py-2 text-left">Guía</th>
                  <th className="px-4 py-2 text-left">Destinatario</th><th className="px-4 py-2 text-left">Impresa</th><th />
                </tr>
              </thead>
              <tbody>
                {hallazgos.map(e => (
                  <tr key={e.id} className="border-t border-neutral-100">
                    <td className="px-4 py-2 font-mono text-xs">{e.venta ?? '—'}{e.reimpresion && <span className="ml-1 text-amber-700">(reimpresión)</span>}</td>
                    <td className="px-4 py-2 font-mono text-xs">{e.guia ?? '—'}</td>
                    <td className="px-4 py-2 max-w-[14rem] truncate">{e.destinatario ?? '—'}</td>
                    <td className="px-4 py-2 text-xs text-neutral-500 whitespace-nowrap">
                      {fechaHora(e.generated_at)} · lote {e.lote_id}
                      {e.jornada_id && ` · jornada ${e.jornada_id}${e.jornada_status === 'ABIERTA' ? ' (abierta)' : ''}`}
                    </td>
                    <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                      <button onClick={() => bajar(`/api/despachos/etiquetas/${e.id}/pdf`)} className="btn-secondary text-xs">↓ Etiqueta original</button>
                      <button onClick={() => bajar(`/api/despachos/lotes/${e.lote_id}/pdf`)} className="btn-secondary text-xs">↓ Lote</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : (
        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          {loading ? <p className="px-4 py-8 text-center text-neutral-400 text-sm">Cargando…</p>
            : jornadas.length === 0 ? <EmptyState message="Todavía no hay jornadas." />
            : (
              <div className="divide-y divide-neutral-100">
                {jornadas.map(j => (
                  <div key={j.id}>
                    <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm hover:bg-neutral-50 cursor-pointer"
                      onClick={() => toggle(j.id)}>
                      <span className="text-neutral-400 w-4">{abierta === j.id ? '▾' : '▸'}</span>
                      <span className="font-mono text-xs text-neutral-500">#{j.id}</span>
                      <span className="font-medium">
                        {j.closed_at ? fechaHora(j.closed_at) : `Abierta desde ${fechaHora(j.opened_at)}`}
                      </span>
                      {j.status === 'ABIERTA' && <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-800">En curso</span>}
                      <span className="text-neutral-600">{j.envios} envío(s) · {j.lotes} lote(s)</span>
                      <span className="text-xs text-neutral-400">{j.closed_by ?? j.opened_by ?? ''}</span>
                      <span className="ml-auto" onClick={e => e.stopPropagation()}>
                        {j.tiene_manifiesto && (
                          <button onClick={() => bajar(`/api/despachos/jornadas/${j.id}/manifiesto`)} className="btn-secondary text-xs">↓ Manifiesto</button>
                        )}
                      </span>
                    </div>
                    {abierta === j.id && (
                      <div className="bg-neutral-50 px-4 py-3 space-y-3">
                        {!detalle[j.id] ? <p className="text-xs text-neutral-400">Cargando…</p>
                          : detalle[j.id].length === 0 ? <p className="text-xs text-neutral-400">Sin lotes impresos.</p>
                          : detalle[j.id].map(l => (
                            <div key={l.id} className="bg-white rounded-lg border border-neutral-200">
                              <div className="px-3 py-2 flex flex-wrap items-center gap-3 text-sm border-b border-neutral-100">
                                <span className="font-medium">Lote {l.id}</span>
                                <span className="text-neutral-500">{fechaHora(l.generated_at)}</span>
                                <span className="text-neutral-500">{l.label_count} etiqueta(s) · {l.page_count} pág.</span>
                                <span className="text-xs text-neutral-400">{l.generated_by ?? ''}</span>
                                <button onClick={() => bajar(`/api/despachos/lotes/${l.id}/pdf`)} className="btn-secondary text-xs ml-auto">↓ PDF del lote</button>
                              </div>
                              <table className="w-full text-xs">
                                <tbody>
                                  {l.etiquetas.map(e => (
                                    <tr key={e.id} className="border-t border-neutral-50">
                                      <td className="px-3 py-1 font-mono">{e.venta ?? '—'}</td>
                                      <td className="px-3 py-1 font-mono text-neutral-500">{e.guia ?? '—'}</td>
                                      <td className="px-3 py-1 max-w-[14rem] truncate">{e.destinatario ?? ''}</td>
                                      <td className="px-3 py-1 text-amber-700">{e.reimpresion ? 'reimpresión' : ''}</td>
                                      <td className="px-3 py-1 text-right">
                                        <button onClick={() => bajar(`/api/despachos/etiquetas/${e.id}/pdf`)}
                                          className="underline text-neutral-600 hover:text-neutral-900">original</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          <Pagination total={total} page={page} pageSize={pageSize} onChange={setPage} />
        </section>
      )}
    </div>
  )
}
