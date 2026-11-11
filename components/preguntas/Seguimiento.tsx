'use client'
// Mensajes → Por atender → Seguimiento (11-11, pedido del dueño; 12-11 pasó de Atendidas a Por atender): «Sin respuesta»
// es la lista de siempre; «Sin guía» y «Sin mensaje», las ventas que todavía no muestran pago antes de que venza el plazo.
// La lista la arma /api/mensajes/seguimiento.
import { useEffect, useState } from 'react'
import Link from '@/components/ui/Link'
import { Nuevo, vistoNuevo } from '@/components/ui/Nuevo'
import { Pagination } from '@/components/ui'

export type FiltroSeg = 'todas' | 'sin_concretar' | 'atencion'
export interface FilaSeg {
  pack_id: string; cuenta: string; fecha: string; recordatorios: number; ultimo_mov: string; atencion: boolean
  nunca_escribio: boolean; dia: number; vence_at: string; sin_leer: number; ultimo_texto: string | null
  ultimo_de_comprador: boolean | null; ultimo_at: string | null; productos: string | null; notas: string | null
  comprador_nick: string | null; comprador_nombre: string | null; imagen: string | null
  compras?: number; packs?: string[]; sin_mensajes?: boolean
}
export interface DatosSeg {
  senal: 'completa' | 'ml' | null; plazo?: number; horas?: number; traido?: string | null
  contadores?: { sin_concretar: number; atencion: number }; lista?: FilaSeg[]; total?: number; porPagina?: number
}

const horasDesde = (f: string) => Math.max(0, Math.round((Date.now() - new Date(f).getTime()) / 3_600_000))
const horasHasta = (f: string) => Math.round((new Date(f).getTime() - Date.now()) / 3_600_000)
function venceEn(f: string) {
  const h = horasHasta(f)
  if (h < 1) return 'Vence ya'
  if (h < 24) return `Vence en ${h} h`
  return `Vence el ${new Date(f).toLocaleDateString('es', { weekday: 'short', day: 'numeric' })}`
}
const tiempo = (h: number) => h < 48 ? `${h} h` : `${Math.floor(h / 24)} días`

/** Los chips (van al lado del buscador). */
export function ChipsSeguimiento({ datos, valor, onCambio, sinRespuesta }: { datos: DatosSeg | null; valor: FiltroSeg; onCambio: (f: FiltroSeg) => void; sinRespuesta?: number }) {
  if (!datos?.senal) return null
  const n = datos.contadores
  const chip = (f: FiltroSeg, texto: React.ReactNode, titulo: string, cuenta?: number, alerta = false) => {
    const activo = valor === f
    return (
      <button type="button" aria-pressed={activo} title={titulo} onClick={() => { vistoNuevo('seguimiento'); onCambio(f) }}
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors ${
          activo ? (alerta ? 'border-amber-500 bg-amber-500 text-white' : 'border-neutral-800 bg-neutral-800 text-white')
            : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
        {texto}
        {cuenta !== undefined && (
          <span className={`num rounded-full px-1.5 text-[11px] leading-5 ${activo ? 'bg-white/25' : alerta && cuenta > 0 ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-600'}`}>{cuenta}</span>
        )}
      </button>
    )
  }
  return (
    <div role="group" aria-label="Seguimiento de ventas" className="-mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
      {chip('todas', 'Responder', 'Conversaciones con mensajes del comprador sin contestar', sinRespuesta)}
      {chip('sin_concretar', <>Pedir pago<Nuevo clave="seguimiento" className="!ml-0" /></>, 'Ventas sin señal de pago (ni guía de MercadoEnvíos, ni pago, ni venta registrada, ni guía en Despachos) dentro de tu plazo', n?.sin_concretar)}
      {chip('atencion', 'Escribirle', 'Sin guía y sin mensajes del comprador ni del equipo en las últimas horas (los recordatorios automáticos no cuentan)', n?.atencion, true)}
    </div>
  )
}

/** La lista de seguimiento (reemplaza la de Atendidas mientras un chip está activo). */
export function ListaSeguimiento({ datos, filtro, horas, onHoras, pagina, onPagina, abierta, onAbrir, onRecargar }: {
  datos: DatosSeg | null; filtro: Exclude<FiltroSeg, 'todas'>; horas: 12 | 24; onHoras: (h: 12 | 24) => void
  pagina: number; onPagina: (p: number) => void; abierta: string | null; onAbrir: (pack: string) => void; onRecargar: () => void
}) {
  // «Quitar» (12-11): saca la venta del seguimiento y frena los recordatorios; se puede deshacer unos segundos.
  const [quitando, setQuitando] = useState<string | null>(null)
  const [quitada, setQuitada] = useState<{ packs: string[]; nombre: string } | null>(null)
  const [errorQ, setErrorQ] = useState<string | null>(null)
  useEffect(() => { if (!quitada) return; const t = setTimeout(() => setQuitada(null), 10_000); return () => clearTimeout(t) }, [quitada])
  const quitar = async (packs: string[], nombre: string, si: boolean) => {
    setQuitando(packs[0]); setErrorQ(null)
    const r = await fetch('/api/mensajes/seguimiento', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packs, quitar: si }) }).catch(() => null)
    setQuitando(null)
    if (!r?.ok) { setErrorQ(si ? 'No se pudo quitar. Prueba de nuevo.' : 'No se pudo deshacer. Prueba de nuevo.'); return }
    setQuitada(si ? { packs, nombre } : null)
    onRecargar()
  }
  const lista = datos?.lista
  return (
    <div className="space-y-2">
      {/* 12-11 (el dueño): cabecera de 2 líneas como máximo, al lado de los botones; el detalle va en el title.
          «Pagos traídos» solo se avisa cuando FALTA traerlos (si ya se trajeron no hace falta decirlo). */}
      <div className="flex items-center gap-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs leading-snug text-neutral-600">
        <p className="line-clamp-2 min-w-0 flex-1"
          title={filtro === 'atencion'
            ? `Ventas sin pago que llevan más de ${horas} h sin mensajes del comprador ni del equipo. Los recordatorios automáticos no cuentan. Primero la que vence antes.`
            : `Ventas sin guía de MercadoEnvíos ni pago registrado, dentro de tus ${datos?.plazo ?? 3} días de plazo. Primero la que vence antes.`}>
          {filtro === 'atencion'
            ? <>Sin pago y <b className="font-semibold text-neutral-800">+{horas} h sin mensajes</b> · primero la que vence antes</>
            : <>Sin pago ni guía, dentro de tus <b className="font-semibold text-neutral-800">{datos?.plazo ?? 3} días</b> · primero la que vence antes</>}
          {datos?.senal === 'completa' && !datos.traido && <>
            {' · '}<Link href="/pagos-me" className="font-medium text-amber-700 underline underline-offset-2">Falta traer los pagos de hoy →</Link>
          </>}
        </p>
        {filtro === 'atencion' && (
          <span className="inline-flex shrink-0 overflow-hidden rounded-full border border-neutral-300 bg-white" role="group" aria-label="Horas sin mensajes">
            {([12, 24] as const).map(h => (
              <button key={h} type="button" aria-pressed={horas === h} onClick={() => onHoras(h)}
                className={`h-7 px-2.5 text-[11px] font-medium ${horas === h ? 'bg-neutral-800 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}>+{h} h</button>
            ))}
          </span>
        )}
      </div>
      {(quitada || errorQ) && (
        <div role="status" className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${errorQ ? 'bg-red-50 text-red-700' : 'bg-neutral-800 text-white'}`}>
          <span className="min-w-0 flex-1 truncate">{errorQ ?? <>Quitaste a <b>{quitada!.nombre}</b> del seguimiento (y de los recordatorios).</>}</span>
          {quitada && !errorQ && (
            <button type="button" disabled={!!quitando} onClick={() => quitar(quitada.packs, quitada.nombre, false)}
              className="shrink-0 font-semibold text-lime-300 underline-offset-2 hover:underline disabled:opacity-50">Deshacer</button>
          )}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm divide-y divide-neutral-100">
        {!lista ? <p className="px-4 py-8 text-center text-sm text-neutral-400">Cargando…</p>
          : lista.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">
              {filtro === 'atencion' ? 'Nada pendiente: todas las ventas sin guía tienen mensajes recientes.' : 'Todas tus ventas recientes ya tienen guía o pago. ¡Al día!'}
            </p>
          ) : lista.map(c => {
            const plazo = datos?.plazo ?? 3
            const quedan = horasHasta(c.vence_at)
            const packs = c.packs ?? [c.pack_id]
            const sinMsg = horasDesde(c.ultimo_mov)
            const abiertaAqui = packs.includes(abierta ?? '')
            const nombre = c.comprador_nombre || c.comprador_nick || 'Comprador'
            return (
              // Toda la fila abre la conversación (botón estirado debajo); encima solo son clicables la ✕ y las compras.
              <div key={c.pack_id} className={`group relative flex gap-3 px-4 py-3 transition-colors ${abiertaAqui ? 'bg-lime-50/70' : 'hover:bg-neutral-50'}`}>
                <button type="button" onClick={() => onAbrir(c.pack_id)} aria-label={`Abrir la conversación con ${nombre}`}
                  className="absolute inset-0 z-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lime-500" />
                {c.imagen
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.imagen} alt="" loading="lazy" className="pointer-events-none relative mt-0.5 h-11 w-11 shrink-0 rounded-md border border-neutral-200 bg-white object-contain" />
                  : <span className="pointer-events-none relative mt-0.5 h-11 w-11 shrink-0 rounded-md bg-neutral-100" />}
                <div className="pointer-events-none relative min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 pr-7 text-xs text-neutral-500">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-700">{c.cuenta}</span>
                    <span className="truncate">{nombre}</span>
                    {c.sin_leer > 0 && <span className="num rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">{c.sin_leer}</span>}
                    <span className={`ml-auto shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${c.nunca_escribio ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-800'}`}>
                      {c.nunca_escribio ? 'Nunca escribió' : 'Escribió y no pagó'}
                    </span>
                  </div>
                  <p className="truncate text-sm font-medium text-neutral-900">{c.productos ?? `Venta ${c.pack_id}`}</p>
                  {c.ultimo_texto && (
                    <p className="truncate text-sm text-neutral-500">
                      {c.ultimo_de_comprador === false && <span className="text-neutral-400">Tú: </span>}{c.ultimo_texto}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-neutral-500">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 font-semibold ${quedan < 12 ? 'bg-red-50 text-red-700' : 'bg-neutral-100 text-neutral-800'}`}>🕒 {venceEn(c.vence_at)}</span>
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 font-medium ${c.atencion ? 'bg-amber-50 text-amber-800' : 'text-neutral-600'}`}>
                      {c.sin_mensajes ? `Sin mensajes desde la compra (${tiempo(sinMsg)})` : `Sin mensajes hace ${tiempo(sinMsg)}`}
                    </span>
                    <span className="whitespace-nowrap">Día {Math.min(c.dia, plazo)} de {plazo}{c.recordatorios > 0 && ` · ${c.recordatorios} recordatorio${c.recordatorios > 1 ? 's' : ''}`}</span>
                    {packs.length > 1 && (
                      // Mismo comprador, varias compras sin pagar: una fila; cada compra se abre con su número.
                      <span className="pointer-events-auto inline-flex items-center gap-1 whitespace-nowrap" role="group" aria-label={`${packs.length} compras sin pagar`}>
                        <span className="font-medium text-neutral-700">· {packs.length} compras</span>
                        <span className="inline-flex overflow-hidden rounded-full border border-neutral-300 bg-white">
                          {packs.map((p, i) => (
                            <button key={p} type="button" onClick={() => onAbrir(p)} aria-pressed={abierta === p}
                              title={`Abrir la compra ${i + 1}`} aria-label={`Abrir la compra ${i + 1}`}
                              className={`num h-5 min-w-5 px-1.5 text-[11px] font-semibold leading-5 transition-colors ${i ? 'border-l border-neutral-200' : ''} ${abierta === p ? 'bg-neutral-800 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>
                              {i + 1}
                            </button>
                          ))}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <button type="button" disabled={quitando === packs[0]}
                  onClick={() => quitar(packs, nombre, true)}
                  title={`Quitar de la lista definitivamente${packs.length > 1 ? ` (las ${packs.length} compras)` : ''}: ya pagó, no va a pagar o no la sigues. Tampoco se le mandan más recordatorios.`}
                  aria-label={`Quitar a ${nombre} de la lista`}
                  className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 disabled:opacity-40">
                  {quitando === packs[0]
                    ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" />
                    : <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>}
                </button>
              </div>
            )
          })}
        {datos?.total !== undefined && datos.porPagina && datos.total > datos.porPagina && (
          <Pagination total={datos.total} page={pagina} pageSize={datos.porPagina} onChange={onPagina} />
        )}
      </div>
    </div>
  )
}
