'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PageHeader, EmptyState } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'

// ── Tipos de la API ─────────────────────────────────────────────────────────
type Estado =
  | 'OK' | 'REIMPRESION' | 'ERROR_PDF' | 'NO_ETIQUETA' | 'SIN_VENTA'
  | 'ESTADO' | 'SIN_PRODUCTOS' | 'DUPLICADA' | 'YA_IMPRESA'

interface Etiqueta {
  id: number
  original_name: string
  venta: string | null
  guia: string | null
  remitente: string | null
  destinatario: string | null
  incluida: boolean
  sale_status: string | null
  sale_notes: string | null
  items: { product_name: string; quantity: number; notes: string | null }[]
  estado: Estado
  detalle: string | null
}
interface LoteDetalle {
  id: number
  status: string
  created_at: string
  created_by: string | null
  imprimibles: number
  etiquetas: Etiqueta[]
}
interface LoteGenerado { id: number; generated_at: string; label_count: number; page_count: number; generated_by: string | null }
interface Overview {
  jornada: { id: number; opened_at: string; opened_by: string | null; lotes: LoteGenerado[]; total_envios: number } | null
  pendientes: { id: number; created_at: string; created_by: string | null; etiquetas: number }[]
  cerradas: {
    id: number; opened_at: string; closed_at: string; total_envios: number; lotes: number
    closed_by: string | null; bot_csv_at: string | null; reimpresiones: number
  }[]
}
interface Falla { etiqueta_id: number; original_name: string; venta: string | null; detalle: string }

const IMPRIMIBLE: Record<Estado, boolean> = {
  OK: true, REIMPRESION: true, ERROR_PDF: false, NO_ETIQUETA: false, SIN_VENTA: false,
  ESTADO: false, SIN_PRODUCTOS: false, DUPLICADA: false, YA_IMPRESA: false,
}
const ESTADO_UI: Record<Estado, { label: string; cls: string }> = {
  OK:            { label: 'Lista',            cls: 'bg-green-100 text-green-800' },
  REIMPRESION:   { label: 'Reimpresión',      cls: 'bg-amber-100 text-amber-800' },
  ERROR_PDF:     { label: 'PDF dañado',       cls: 'bg-red-100 text-red-800' },
  NO_ETIQUETA:   { label: 'No es etiqueta',   cls: 'bg-red-100 text-red-800' },
  SIN_VENTA:     { label: 'Venta no cargada', cls: 'bg-red-100 text-red-800' },
  ESTADO:        { label: 'Venta sin procesar', cls: 'bg-red-100 text-red-800' },
  SIN_PRODUCTOS: { label: 'Sin productos',    cls: 'bg-red-100 text-red-800' },
  DUPLICADA:     { label: 'Duplicada',        cls: 'bg-red-100 text-red-800' },
  YA_IMPRESA:    { label: 'Ya impresa',       cls: 'bg-red-100 text-red-800' },
}

const fechaHora = (s: string) => new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})
const hora = (s: string) => new Date(s).toLocaleTimeString('es-VE', {
  timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit',
})

function descargar(href: string) {
  const a = document.createElement('a')
  a.href = href
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

interface ApiBody { error?: string; fallas?: Falla[]; rechazados?: string[]; pendientes?: number; lote_id?: number; jornada_id?: number }

// Respuestas que no son JSON las corta el proxy (nginx) antes de llegar a la app.
async function errorDe(res: Response): Promise<ApiBody> {
  try { return (await res.json()) as ApiBody }
  catch {
    if (res.status === 413) return { error: 'El servidor rechazó el envío por tamaño. Sube los PDFs en tandas más chicas.' }
    if (res.status === 504) return { error: 'El servidor tardó demasiado en responder. Recarga para ver si se completó.' }
    return { error: `Error ${res.status}` }
  }
}

const TANDA = 60  // PDFs por envío al servidor (MAX_PDFS_POR_SUBIDA)

// Solo PDF (el servidor igual lo revisa por contenido, no por nombre).
const esPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')

// ── Pantalla ────────────────────────────────────────────────────────────────
export default function DespachosClient() {
  const confirm = useConfirm()
  const [data, setData]         = useState<Overview | null>(null)
  const [lotes, setLotes]       = useState<Record<number, LoteDetalle>>({})
  const [busy, setBusy]         = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [aviso, setAviso]       = useState<string | null>(null)
  const [fallas, setFallas]     = useState<Falla[]>([])

  const cargar = useCallback(() => fetch('/api/despachos').then(async res => {
    if (!res.ok) { setError((await errorDe(res)).error ?? 'Error'); return }
    const ov: Overview = await res.json()
    const detalles = await Promise.all(ov.pendientes.map(p =>
      fetch(`/api/despachos/lotes/${p.id}`).then(r => r.ok ? r.json() as Promise<LoteDetalle> : null)))
    setData(ov)
    setLotes(Object.fromEntries(detalles.filter((d): d is LoteDetalle => !!d).map(d => [d.id, d])))
  }), [])

  useEffect(() => { cargar() }, [cargar])

  // Destino de lo que se suelta/pega en la zona principal: el lote pendiente si hay
  // uno solo (se va armando de a poco), si no un lote nuevo.
  const loteDestino = data?.pendientes.length === 1 ? data.pendientes[0].id : undefined

  // Ctrl+V: pegar PDFs copiados (Ctrl+C) desde el explorador de archivos. El handler
  // vive en un ref para que el listener (montado una vez) use siempre el estado actual.
  const pegarRef = useRef<(files: File[]) => void>(() => {})
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      pegarRef.current(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  // Muchos PDFs se mandan en tandas: la primera crea el lote y las demás se le agregan.
  const subir = async (todos: File[], loteId?: number) => {
    const files = todos.filter(esPdf)
    const ignorados = todos.filter(f => !esPdf(f)).map(f => `${f.name || 'archivo'}: solo se aceptan PDF`)
    if (files.length === 0) {
      if (ignorados.length) { setError(`Solo se aceptan PDF. ${ignorados.join(' · ')}`); setAviso(null) }
      return
    }
    setBusy('subir'); setError(null); setAviso(null); setFallas([])
    let lote = loteId
    const rechazados: string[] = [...ignorados]
    for (let i = 0; i < files.length; i += TANDA) {
      const fd = new FormData()
      files.slice(i, i + TANDA).forEach(f => fd.append('files', f))
      if (lote) fd.append('lote_id', String(lote))
      const res = await fetch('/api/despachos/lotes', { method: 'POST', body: fd })
      const body = await errorDe(res)
      rechazados.push(...(body.rechazados ?? []))
      if (!res.ok) {
        const subidos = i > 0 ? ` (se subieron los primeros ${i})` : ''
        setError([`${body.error}${subidos}`, ...rechazados].join(' · '))
        setBusy(null); cargar(); return
      }
      lote = body.lote_id
    }
    setBusy(null)
    if (rechazados.length) setAviso(`No se tomaron: ${rechazados.join(' · ')}`)
    cargar()
  }

  useEffect(() => {
    pegarRef.current = (files: File[]) => { if (!busy) subir(files, loteDestino) }
  })

  const toggleIncluida = async (loteId: number, e: Etiqueta) => {
    await fetch(`/api/despachos/lotes/${loteId}/etiquetas/${e.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incluida: !e.incluida }),
    })
    const d = await fetch(`/api/despachos/lotes/${loteId}`).then(r => r.json())
    setLotes(prev => ({ ...prev, [loteId]: d }))
  }

  const generar = async (lote: LoteDetalle) => {
    setBusy(`generar-${lote.id}`); setError(null); setAviso(null); setFallas([])
    const res = await fetch(`/api/despachos/lotes/${lote.id}/generar`, { method: 'POST' })
    const body = await errorDe(res)
    setBusy(null)
    if (!res.ok) { setError(body.error ?? 'Error'); setFallas(body.fallas ?? []); cargar(); return }
    descargar(`/api/despachos/lotes/${lote.id}/pdf`)
    setAviso('PDF generado y verificado. Ábrelo con tu visor de PDF e imprime a "Tamaño real" (100%), no "Ajustar a la página".')
    cargar()
  }

  const descartar = async (lote: LoteDetalle) => {
    if (!await confirm({ title: 'Descartar lote', message: `¿Descartar este lote de ${lote.etiquetas.length} etiqueta(s)? No se imprimió nada.`, confirmText: 'Descartar', danger: true })) return
    await fetch(`/api/despachos/lotes/${lote.id}`, { method: 'DELETE' })
    cargar()
  }

  const cerrarJornada = async (forzar = false): Promise<void> => {
    if (!forzar && !await confirm({
      title: 'Cerrar jornada',
      message: `Se genera el manifiesto con los ${data?.jornada?.total_envios ?? 0} envíos de la jornada y se cierra.`,
      confirmText: 'Generar manifiesto',
    })) return
    setBusy('cerrar'); setError(null); setAviso(null)
    const res = await fetch('/api/despachos/jornadas/cerrar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forzar }),
    })
    const body = await errorDe(res)
    setBusy(null)
    if (res.status === 409) {
      if (await confirm({ title: 'Hay lotes sin generar', message: `${body.error} ¿Cerrar la jornada de todas formas?`, confirmText: 'Cerrar igual' })) {
        return cerrarJornada(true)
      }
      return
    }
    if (!res.ok) { setError(body.error ?? 'Error'); cargar(); return }
    descargar(`/api/despachos/jornadas/${body.jornada_id}/manifiesto`)
    setAviso('Jornada cerrada. Baja también el CSV del Reportador desde "Jornadas cerradas".')
    cargar()
  }

  // Bajar el CSV dos veces y correr el Reportador con los dos = mensajes repetidos.
  const bajarCsv = async (j: Overview['cerradas'][number]) => {
    const partes = [
      j.reimpresiones > 0
        ? `${j.reimpresiones} reimpresión(es) no van en el CSV: esos compradores ya fueron reportados.`
        : '',
      j.bot_csv_at
        ? `OJO: este CSV ya se bajó el ${fechaHora(j.bot_csv_at)}. Si el Reportador ya lo usó, correrlo otra vez les escribe DOS veces a los compradores.`
        : '',
    ].filter(Boolean)
    if (partes.length && !await confirm({
      title: 'CSV del Reportador', message: partes.join(' '), confirmText: 'Bajar CSV', danger: !!j.bot_csv_at,
    })) return
    descargar(`/api/despachos/jornadas/${j.id}/bot-csv`)
    setTimeout(cargar, 1500)
  }

  if (!data) return <p className="text-sm text-neutral-400">{error ?? 'Cargando…'}</p>

  const pendientes = data.pendientes.map(p => lotes[p.id]).filter(Boolean)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Despachos"
        subtitle={data.jornada
          ? `Jornada abierta desde ${fechaHora(data.jornada.opened_at)} · ${data.jornada.total_envios} envío(s)`
          : 'Sin jornada abierta: se abre sola al generar el primer lote'}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
          {error}
          {fallas.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {fallas.map(f => <li key={f.etiqueta_id}>{f.venta ?? f.original_name}: {f.detalle}</li>)}
            </ul>
          )}
        </div>
      )}
      {aviso && <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded text-sm">{aviso}</div>}

      <Dropzone onFiles={f => subir(f, loteDestino)} busy={busy === 'subir'} agregaALote={loteDestino} />

      {pendientes.map(l => (
        <LotePendiente key={l.id} lote={l} busy={busy}
          onToggle={e => toggleIncluida(l.id, e)}
          onRevalidar={cargar}
          onAgregar={f => subir(f, l.id)}
          onGenerar={() => generar(l)}
          onDescartar={() => descartar(l)} />
      ))}

      {/* Jornada abierta */}
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <h2 className="text-sm font-semibold text-neutral-800">Lotes impresos de la jornada</h2>
          {data.jornada && data.jornada.lotes.length > 0 && (
            <button onClick={() => cerrarJornada()} disabled={busy === 'cerrar'} className="btn-primary text-sm">
              {busy === 'cerrar' ? 'Generando…' : `Cerrar jornada → Manifiesto (${data.jornada.total_envios})`}
            </button>
          )}
        </div>
        {!data.jornada || data.jornada.lotes.length === 0
          ? <EmptyState message="Todavía no se imprimió ningún lote en esta jornada." />
          : (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr><th className="px-4 py-2 text-left">Lote</th><th className="px-4 py-2 text-left">Hora</th>
                  <th className="px-4 py-2 text-right">Etiquetas</th><th className="px-4 py-2 text-right">Hojas</th>
                  <th className="px-4 py-2 text-left">Por</th><th /></tr>
              </thead>
              <tbody>
                {data.jornada.lotes.map((l, i) => (
                  <tr key={l.id} className="border-t border-neutral-100">
                    <td className="px-4 py-2">Lote {i + 1} <span className="text-neutral-400">#{l.id}</span></td>
                    <td className="px-4 py-2">{fechaHora(l.generated_at)}</td>
                    <td className="px-4 py-2 text-right">{l.label_count}</td>
                    <td className="px-4 py-2 text-right">{l.page_count}</td>
                    <td className="px-4 py-2 text-neutral-500">{l.generated_by ?? '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => descargar(`/api/despachos/lotes/${l.id}/pdf`)} className="btn-secondary text-xs">
                        ↓ PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>

      {/* Jornadas cerradas */}
      {data.cerradas.length > 0 && (
        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm">
          <h2 className="px-4 py-3 border-b border-neutral-100 text-sm font-semibold text-neutral-800">Jornadas cerradas</h2>
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr><th className="px-4 py-2 text-left">Cierre</th><th className="px-4 py-2 text-right">Envíos</th>
                <th className="px-4 py-2 text-right">Lotes</th><th className="px-4 py-2 text-left">Por</th><th /></tr>
            </thead>
            <tbody>
              {data.cerradas.map(j => (
                <tr key={j.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{fechaHora(j.closed_at)}</td>
                  <td className="px-4 py-2 text-right">{j.total_envios}</td>
                  <td className="px-4 py-2 text-right">{j.lotes}</td>
                  <td className="px-4 py-2 text-neutral-500">{j.closed_by ?? '—'}</td>
                  <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => descargar(`/api/despachos/jornadas/${j.id}/manifiesto`)} className="btn-secondary text-xs">↓ Manifiesto</button>
                    <button onClick={() => bajarCsv(j)} className="btn-secondary text-xs"
                      title={j.bot_csv_at ? `Ya se bajó el ${fechaHora(j.bot_csv_at)}` : undefined}>
                      ↓ CSV Reportador{j.bot_csv_at ? ' ✓' : ''}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

// ── Subida ──────────────────────────────────────────────────────────────────
function Dropzone({ onFiles, busy, compact, agregaALote }: {
  onFiles: (f: File[]) => void; busy: boolean; compact?: boolean; agregaALote?: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onFiles(Array.from(e.dataTransfer.files)) }}
      onClick={() => !busy && inputRef.current?.click()}
      className={`rounded-xl border-2 border-dashed text-center cursor-pointer transition-colors ${
        compact ? 'px-3 py-2' : 'px-4 py-8'
      } ${over ? 'border-neutral-800 bg-neutral-100' : 'border-neutral-300 bg-white hover:border-neutral-500'}`}>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden"
        onChange={e => { onFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      {busy
        ? <p className="text-sm text-neutral-600">Leyendo etiquetas…</p>
        : compact
          ? <p className="text-xs text-neutral-600">+ Agregar PDFs a este lote</p>
          : <>
              <p className="text-sm font-medium text-neutral-800">
                Arrastra aquí los PDFs de Mercado Envíos, pégalos con <kbd className="px-1 border border-neutral-300 rounded text-xs">Ctrl</kbd>+<kbd className="px-1 border border-neutral-300 rounded text-xs">V</kbd> o haz clic para elegirlos
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                Solo PDF, tal cual se descargan (sin convertir ni imprimir a PDF). Se pueden mezclar cuentas.
                {agregaALote && <> Se agregan al lote pendiente #{agregaALote}.</>}
              </p>
            </>}
    </div>
  )
}

// ── Lote pendiente (revisión antes de generar) ──────────────────────────────
function LotePendiente({ lote, busy, onToggle, onRevalidar, onAgregar, onGenerar, onDescartar }: {
  lote: LoteDetalle
  busy: string | null
  onToggle: (e: Etiqueta) => void
  onRevalidar: () => void
  onAgregar: (f: File[]) => void
  onGenerar: () => void
  onDescartar: () => void
}) {
  const conProblema = lote.etiquetas.filter(e => !IMPRIMIBLE[e.estado]).length
  const generando = busy === `generar-${lote.id}`
  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-neutral-100">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800">
            Lote pendiente <span className="text-neutral-400">#{lote.id}</span>
          </h2>
          <p className="text-xs text-neutral-500">
            {lote.etiquetas.length} etiqueta(s) · <span className="text-green-700">{lote.imprimibles} lista(s)</span>
            {conProblema > 0 && <> · <span className="text-red-700">{conProblema} con problema</span></>}
            {' '}· subido {hora(lote.created_at)}{lote.created_by ? ` por ${lote.created_by}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRevalidar} className="btn-secondary text-xs" title="Volver a cruzar con las ventas (p.ej. después de cargar una venta que faltaba)">↻ Revalidar</button>
          <button onClick={onDescartar} className="btn-secondary text-xs">Descartar</button>
          <button onClick={onGenerar} disabled={generando || lote.imprimibles === 0} className="btn-primary text-sm">
            {generando ? 'Generando y verificando…' : `Generar PDF (${lote.imprimibles})`}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 w-8" title="Incluir en el PDF" />
              <th className="px-3 py-2 text-left">Venta</th>
              <th className="px-3 py-2 text-left">Guía ZOOM</th>
              <th className="px-3 py-2 text-left">Remitente</th>
              <th className="px-3 py-2 text-left">Productos (del sistema)</th>
              <th className="px-3 py-2 text-left">Nota</th>
              <th className="px-3 py-2 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {lote.etiquetas.map(e => {
              const ui = ESTADO_UI[e.estado]
              const nota = e.sale_notes || e.items.find(i => i.notes)?.notes || ''
              return (
                <tr key={e.id} className={`border-t border-neutral-100 align-top ${!e.incluida ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2 text-center">
                    {IMPRIMIBLE[e.estado] && (
                      <input type="checkbox" checked={e.incluida} onChange={() => onToggle(e)} title="Incluir en el PDF" />
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{e.venta ?? <span className="text-neutral-400">{e.original_name}</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.guia ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{e.remitente?.slice(0, 22) ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    {e.items.length === 0 ? '—' : e.items.map((i, k) => <div key={k}>{i.quantity} - {i.product_name}</div>)}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-600">{nota}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`inline-block px-2 py-0.5 rounded-full ${ui.cls}`}>{ui.label}</span>
                    {e.detalle && <div className="text-neutral-500 mt-0.5">{e.detalle}</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t border-neutral-100">
        <Dropzone onFiles={onAgregar} busy={busy === 'subir'} compact />
      </div>
    </section>
  )
}
