'use client'
// Ventas → Por confirmar (2026-10-12): las ventas de MercadoLibre que todavía no están registradas
// (lib/porConfirmar.ts). Cada fila dice de un vistazo si se puede confirmar ya (productos, pago,
// mensaje del comprador) y "Confirmar" abre Nueva venta con todo cargado.
import { useCallback, useEffect, useState } from 'react'
import type { PorConfirmar as Fila } from '@/lib/porConfirmar'

interface Datos { dias: number; filas: Fila[]; ultimaBusqueda: string | null; pagosME: boolean; sincronizadas_at: string | null }

const hora = (s: string | null) => s ? new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit',
}) : '—'

function hace(s: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(s).getTime()) / 60000))
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d === 1 ? '' : 's'}`
}

const usd = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Tono = 'verde' | 'ambar' | 'rojo' | 'azul' | 'gris'
const TONO: Record<Tono, string> = {
  verde: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  ambar: 'bg-amber-50 text-amber-800 ring-amber-200',
  rojo: 'bg-red-50 text-red-800 ring-red-200',
  azul: 'bg-sky-50 text-sky-800 ring-sky-200',
  gris: 'bg-neutral-50 text-neutral-600 ring-neutral-200',
}
const PUNTO: Record<Tono, string> = {
  verde: 'bg-emerald-500', ambar: 'bg-amber-500', rojo: 'bg-red-500', azul: 'bg-sky-500', gris: 'bg-neutral-400',
}

function Etiqueta({ tono, children, title }: { tono: Tono; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONO[tono]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${PUNTO[tono]}`} aria-hidden="true" />
      {children}
    </span>
  )
}

function IconoActualizar({ girando }: { girando: boolean }) {
  return (
    <svg className={`h-4 w-4 ${girando ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </svg>
  )
}

function estadoProductos(f: Fila): { tono: Tono; texto: string; title: string } {
  if (f.productos === 'listo') return { tono: 'verde', texto: 'Productos listos', title: 'Cada publicación está vinculada a un solo producto' }
  if (f.productos === 'elegir') return { tono: 'ambar', texto: 'Elegir producto', title: 'Una publicación está en varios productos: hay que elegir cuál se vendió' }
  return { tono: 'ambar', texto: 'Sin vincular', title: 'Una publicación no está vinculada a ningún producto: hay que buscarlo a mano' }
}

function estadoPago(f: Fila, ultima: string | null): { tono: Tono; texto: string; title?: string } {
  if (f.pago?.verificacion === 'valido') return { tono: 'verde', texto: 'Pago verificado' }
  if (f.pago?.verificacion === 'invalido') return { tono: 'rojo', texto: 'Pago inválido' }
  if (f.pago) return { tono: 'azul', texto: `Pago por verificar${f.pago.monto ? ` · Bs ${usd(f.pago.monto)}` : ''}` }
  if (!ultima || new Date(ultima) < new Date(f.fecha)) return { tono: 'gris', texto: 'Pago sin buscar', title: `La última búsqueda de pagos (${hora(ultima)}) fue antes de la compra` }
  return { tono: 'ambar', texto: 'No ha pagado', title: `Se buscó el ${hora(ultima)} y no apareció: no ha pagado o no subió el comprobante` }
}

function FilaVenta({ f, d, onConfirmar }: { f: Fila; d: Datos; onConfirmar: (numero: string) => void }) {
  const prod = estadoProductos(f)
  const pago = d.pagosME ? estadoPago(f, d.ultimaBusqueda) : null
  const quedan = d.dias - Math.floor((Date.now() - new Date(f.fecha).getTime()) / 86_400_000)
  return (
    <li className="group flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center hover:bg-neutral-50/70">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-semibold text-neutral-900 truncate">{f.comprador ?? f.nick ?? 'Sin nombre'}</span>
          {f.comprador && f.nick && <span className="text-xs text-neutral-400">@{f.nick}</span>}
          <span className="font-mono text-[11px] text-neutral-400">{f.numero}</span>
        </div>
        <div className="text-sm text-neutral-700 space-y-0.5">
          {f.lineas.map((l, k) => (
            <div key={k} className="truncate" title={l.titulo}>
              <span className="font-medium">{l.cantidad} ×</span> {l.titulo}
              {l.variante && <span className="text-neutral-400"> · {l.variante}</span>}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <Etiqueta tono={prod.tono} title={prod.title}>{prod.texto}</Etiqueta>
          {pago && <Etiqueta tono={pago.tono} title={pago.title}>{pago.texto}</Etiqueta>}
          {!f.vencida && quedan <= 2 && <Etiqueta tono="rojo">{quedan <= 0 ? 'Vence hoy' : `Quedan ${quedan} día${quedan === 1 ? '' : 's'}`}</Etiqueta>}
          <span className="text-[11px] text-neutral-400">{hace(f.fecha)} · {f.cuenta}</span>
        </div>
        {f.mensaje && (
          <div className="mt-1 flex items-start gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs text-violet-900 ring-1 ring-inset ring-violet-200">
            <svg className="mt-px h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
            </svg>
            <span className="min-w-0"><b>Escribió después de comprar:</b> <span className="line-clamp-2">{f.mensaje.texto}</span></span>
          </div>
        )}
      </div>
      <button type="button" onClick={() => onConfirmar(f.numero)}
        className="btn-primary text-sm whitespace-nowrap self-start sm:self-center">
        Confirmar
      </button>
    </li>
  )
}

function Grupo({ titulo, nota, filas, d, onConfirmar, plegable }: {
  titulo: string; nota: string; filas: Fila[]; d: Datos; onConfirmar: (numero: string) => void; plegable?: boolean
}) {
  const [abierto, setAbierto] = useState(!plegable)
  if (!filas.length) return null
  return (
    <section className="border-b border-neutral-100 last:border-b-0">
      <button type="button" onClick={() => plegable && setAbierto(a => !a)} disabled={!plegable}
        className={`flex w-full items-baseline gap-2 bg-neutral-50 px-4 py-2 text-left ${abierto ? 'border-b border-neutral-100' : ''} ${plegable ? 'hover:bg-neutral-100' : 'cursor-default'}`}>
        {plegable && (
          <svg className={`h-3 w-3 self-center text-neutral-400 transition-transform ${abierto ? 'rotate-90' : ''}`} viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        )}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{titulo}</h3>
        <span className="text-xs font-medium text-neutral-400">{filas.length}</span>
        <span className="hidden sm:inline text-[11px] text-neutral-400">· {nota}</span>
        {plegable && <span className="ml-auto text-[11px] text-neutral-400">{abierto ? 'Ocultar' : 'Ver'}</span>}
      </button>
      {abierto && (
        <ul className="divide-y divide-neutral-100">
          {filas.map(f => <FilaVenta key={f.numero} f={f} d={d} onConfirmar={onConfirmar} />)}
        </ul>
      )}
    </section>
  )
}

export default function PorConfirmar({ datos, onRecargar, onConfirmar }: {
  datos: Datos | null
  onRecargar: () => Promise<void>
  onConfirmar: (numero: string) => void
}) {
  const [actualizando, setActualizando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revisado, setRevisado] = useState<{ at: string; nuevas: number } | null>(null)
  const [verVencidas, setVerVencidas] = useState(false)
  // "Traer ME" (2026-10-12; Pagos ME salió del menú de los usuarios): le pide a la PC del vigilante que traiga
  // los pagos y guías del portal. Tarda 1-3 min: se recarga la lista cada 10 s hasta que llega la búsqueda nueva.
  const [pidiendoME, setPidiendoME] = useState<number | null>(null)
  const [avisoME, setAvisoME] = useState<string | null>(null)
  const ultimaME = datos?.ultimaBusqueda ? new Date(datos.ultimaBusqueda).getTime() : 0
  // Buscando = se pidió y todavía no llegó una búsqueda terminada después del pedido.
  const buscandoME = pidiendoME != null && ultimaME < pidiendoME - 5000
  useEffect(() => {
    if (!buscandoME || pidiendoME == null) return
    const t = setInterval(() => {
      if (Date.now() - pidiendoME > 5 * 60_000) {
        setPidiendoME(null)
        setAvisoME('La PC de los pagos no respondió en 5 minutos: revisa que esté encendida (Pagos MercadoEnvíos, en el menú de la cuenta del administrador).')
        return
      }
      onRecargar()
    }, 10_000)
    return () => clearInterval(t)
  }, [buscandoME, pidiendoME, onRecargar])
  const traerME = async () => {
    setAvisoME(null)
    const r = await fetch('/api/pagos-me/traer', { method: 'POST' }).catch(() => null)
    if (r?.ok) setPidiendoME(Date.now())
    else setAvisoME('No se pudo pedir la búsqueda de pagos.')
  }

  const actualizar = async () => {
    setActualizando(true); setError(null)
    try {
      const r = await fetch('/api/sales/por-confirmar', { method: 'POST' })
      const j = await r.json().catch(() => null)
      if (!r.ok || (j && !j.ok)) setError(j?.errores?.join(' · ') || j?.error || 'No se pudo traer de MercadoLibre')
      else setRevisado({ at: new Date().toISOString(), nuevas: Number(j?.nuevas) || 0 })
      await onRecargar()
    } finally { setActualizando(false) }
  }

  if (!datos) return <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-400">Cargando…</div>

  const vigentes = datos.filas.filter(f => !f.vencida)
  const vencidas = datos.filas.filter(f => f.vencida)
  const conPago = vigentes.filter(f => f.pago && f.pago.verificacion !== 'invalido')
  const sinPago = vigentes.filter(f => !conPago.includes(f))

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-neutral-500 leading-relaxed">
          Ventas de MercadoLibre que todavía no están registradas. Se traen solas cada hora
          {revisado
            ? <> (revisado recién: <b className="text-neutral-700">{hora(revisado.at)}</b> ·{' '}
                <b className={revisado.nuevas ? 'text-emerald-700' : 'text-neutral-700'}>
                  {revisado.nuevas ? `${revisado.nuevas} ${revisado.nuevas === 1 ? 'venta nueva' : 'ventas nuevas'}` : 'nada nuevo'}
                </b>)</>
            : datos.sincronizadas_at && <> (última: <b className="text-neutral-700">{hora(datos.sincronizadas_at)}</b>)</>}.
          {datos.pagosME && <> Pagos: {buscandoME
            ? <b className="text-violet-700">buscando en MercadoEnvíos (1 a 3 min)…</b>
            : datos.ultimaBusqueda ? <>última búsqueda <b className="text-neutral-700">{hora(datos.ultimaBusqueda)}</b></> : 'sin buscar todavía'}.</>}
          {' '}Al confirmar se abre la venta con el cliente, el pago y los productos cargados.
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={actualizar} disabled={actualizando} title="Trae de MercadoLibre las ventas nuevas"
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm hover:border-neutral-400 hover:bg-neutral-200 disabled:cursor-wait disabled:text-neutral-400">
            <IconoActualizar girando={actualizando} />
            {actualizando ? 'Trayendo…' : 'Traer ML'}
          </button>
          {datos.pagosME && (
            <button type="button" onClick={traerME} disabled={buscandoME} title="Trae de MercadoEnvíos los pagos y guías (lo hace la PC de los pagos)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm hover:border-neutral-400 hover:bg-neutral-200 disabled:cursor-wait disabled:text-neutral-400">
              <IconoActualizar girando={buscandoME} />
              {buscandoME ? 'Buscando pagos…' : 'Traer ME'}
            </button>
          )}
        </div>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}
      {avisoME && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{avisoME}</div>}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        {vigentes.length ? (
          datos.pagosME ? <>
            <Grupo titulo="Con pago" nota="Listas para revisar y confirmar" filas={conPago} d={datos} onConfirmar={onConfirmar} />
            {!conPago.length && (
              <div className="px-4 py-6 text-center border-b border-neutral-100">
                <p className="text-sm font-medium text-neutral-700">Nada con pago por confirmar</p>
                <p className="mt-1 text-xs text-neutral-400">Cuando un cliente pague, su venta aparece aquí después de buscar los pagos.</p>
              </div>
            )}
            <Grupo titulo="Sin pago todavía" nota="El cliente no ha pagado, o el pago no se ha buscado" filas={sinPago} d={datos} onConfirmar={onConfirmar} plegable />
          </> : (
            <ul className="divide-y divide-neutral-100">
              {vigentes.map(f => <FilaVenta key={f.numero} f={f} d={datos} onConfirmar={onConfirmar} />)}
            </ul>
          )
        ) : (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-neutral-700">Todo al día</p>
            <p className="mt-1 text-xs text-neutral-400">No hay ventas de MercadoLibre sin registrar.</p>
          </div>
        )}
      </div>

      {vencidas.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50/60">
          <button type="button" onClick={() => setVerVencidas(v => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
            <span className="text-sm font-medium text-neutral-600">
              Vencidas <span className="text-neutral-400">{vencidas.length}</span>
            </span>
            <span className="text-xs text-neutral-400">
              Más de {datos.dias} días sin registrar: Calificaciones las toma como no concretadas · {verVencidas ? 'Ocultar' : 'Ver'}
            </span>
          </button>
          {verVencidas && (
            <ul className="divide-y divide-neutral-100 border-t border-neutral-200 bg-white">
              {vencidas.map(f => <FilaVenta key={f.numero} f={f} d={datos} onConfirmar={onConfirmar} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** Las que hay que trabajar: con pago (0 = al día). Sin Pagos ME, todas las vigentes. */
export function pendientesPorConfirmar(datos: Datos | null) {
  return datos?.filas.filter(f => !f.vencida && (!datos.pagosME || (!!f.pago && f.pago.verificacion !== 'invalido'))).length ?? 0
}

/** Número dentro del botón "Por confirmar" (botón blanco): naranja si hay ventas por confirmar. */
export function NumeroBoton({ n, cargando = false }: { n: number; cargando?: boolean }) {
  return (
    <span className={`ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-semibold num ${
      n > 0 ? 'bg-orange-500 text-white' : 'bg-neutral-100 text-neutral-400'}`}>
      {cargando ? '·' : n}
    </span>
  )
}

/** Carga de la lista (la usan VentasClient y el Inicio para el conteo y la vista). */
export function usePorConfirmar(activo: boolean) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const cargar = useCallback(async () => {
    if (!activo) return
    const r = await fetch('/api/sales/por-confirmar', { cache: 'no-store' }).catch(() => null)
    if (r?.ok) setDatos(await r.json())
  }, [activo])
  useEffect(() => { cargar() }, [cargar])
  return { datos, cargar }
}
