'use client'
// Mensajes → Atendidas → Seguimiento (11-11, pedido del dueño): chips al lado del buscador para ver las ventas que
// todavía no muestran pago, antes de que venza el plazo de cierre. La lista la arma /api/mensajes/seguimiento.
import Link from 'next/link'
import { Nuevo, vistoNuevo } from '@/components/ui/Nuevo'
import { Pagination } from '@/components/ui'

export type FiltroSeg = 'todas' | 'sin_concretar' | 'atencion'
export interface FilaSeg {
  pack_id: string; cuenta: string; fecha: string; recordatorios: number; ultimo_mov: string; atencion: boolean
  nunca_escribio: boolean; dia: number; vence_at: string; sin_leer: number; ultimo_texto: string | null
  ultimo_de_comprador: boolean | null; ultimo_at: string | null; productos: string | null; notas: string | null
  comprador_nick: string | null; comprador_nombre: string | null; imagen: string | null
}
export interface DatosSeg {
  senal: 'completa' | 'parcial' | null; plazo?: number; horas?: number; traido?: string | null
  contadores?: { sin_concretar: number; atencion: number }; lista?: FilaSeg[]; total?: number; porPagina?: number
}

const horasDesde = (f: string) => Math.max(0, Math.round((Date.now() - new Date(f).getTime()) / 3_600_000))
function venceEn(f: string) {
  const h = Math.round((new Date(f).getTime() - Date.now()) / 3_600_000)
  if (h < 1) return 'vence ya'
  if (h < 24) return `vence en ${h} h`
  return `vence ${new Date(f).toLocaleDateString('es', { weekday: 'short', day: 'numeric' })}`
}

/** Los chips (van al lado del buscador). Sin señal de pago (ni Pagos ME, ni Despachos, ni Ventas) no se muestran. */
export function ChipsSeguimiento({ datos, valor, onCambio }: { datos: DatosSeg | null; valor: FiltroSeg; onCambio: (f: FiltroSeg) => void }) {
  if (!datos?.senal) return null
  const n = datos.contadores
  const chip = (f: FiltroSeg, texto: React.ReactNode, cuenta?: number, alerta = false) => {
    const activo = valor === f
    return (
      <button type="button" aria-pressed={activo} onClick={() => { vistoNuevo('seguimiento'); onCambio(f) }}
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
    <div role="group" aria-label="Seguimiento de ventas" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
      {chip('todas', 'Todas')}
      {chip('sin_concretar', 'Sin concretar', n?.sin_concretar)}
      {chip('atencion', <>Requiere atención<Nuevo clave="seguimiento" className="!ml-0" /></>, n?.atencion, true)}
    </div>
  )
}

/** La lista de seguimiento (reemplaza la de Atendidas mientras un chip está activo). */
export function ListaSeguimiento({ datos, filtro, horas, onHoras, pagina, onPagina, abierta, onAbrir }: {
  datos: DatosSeg | null; filtro: Exclude<FiltroSeg, 'todas'>; horas: 12 | 24; onHoras: (h: 12 | 24) => void
  pagina: number; onPagina: (p: number) => void; abierta: string | null; onAbrir: (pack: string) => void
}) {
  const lista = datos?.lista
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
        <span className="min-w-0 flex-1">
          {filtro === 'atencion'
            ? <>Sin pago y sin ningún mensaje ni recordatorio en las últimas {horas} h.</>
            : <>Ventas sin pago, ni guía, ni venta registrada, dentro de tus {datos?.plazo ?? 3} días de plazo.</>}
          {' '}Primero la que vence antes.
        </span>
        {filtro === 'atencion' && (
          <span className="inline-flex shrink-0 overflow-hidden rounded-full border border-neutral-300 bg-white" role="group" aria-label="Horas sin movimiento">
            {([12, 24] as const).map(h => (
              <button key={h} type="button" aria-pressed={horas === h} onClick={() => onHoras(h)}
                className={`h-7 px-2.5 text-[11px] font-medium ${horas === h ? 'bg-neutral-800 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}>{h} h</button>
            ))}
          </span>
        )}
        {datos?.senal === 'completa' && (datos.traido
          ? <span className="w-full text-emerald-700 sm:w-auto">Pagos traídos hoy {datos.traido} ✓</span>
          : <Link href="/pagos-me" className="w-full font-medium text-amber-700 underline-offset-2 hover:underline sm:w-auto">Falta traer los pagos de hoy →</Link>)}
        {datos?.senal === 'parcial' && (
          <span className="w-full text-neutral-500">Se mira si tiene guía en Despachos o venta registrada: un pago reciente puede no verse todavía.</span>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm divide-y divide-neutral-100">
        {!lista ? <p className="px-4 py-8 text-center text-sm text-neutral-400">Cargando…</p>
          : lista.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">
              {filtro === 'atencion' ? 'Nada pendiente: todas las ventas sin pago tienen movimiento reciente.' : 'Todas tus ventas recientes ya tienen pago o guía. ¡Al día!'}
            </p>
          ) : lista.map(c => {
            const plazo = datos?.plazo ?? 3
            return (
              <button key={c.pack_id} type="button" onClick={() => onAbrir(c.pack_id)}
                className={`flex w-full gap-3 px-4 py-3 text-left transition-colors ${abierta === c.pack_id ? 'bg-lime-50/70' : 'hover:bg-neutral-50'}`}>
                {c.imagen
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.imagen} alt="" loading="lazy" className="mt-0.5 h-11 w-11 shrink-0 rounded-md border border-neutral-200 bg-white object-contain" />
                  : <span className="mt-0.5 h-11 w-11 shrink-0 rounded-md bg-neutral-100" />}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-700">{c.cuenta}</span>
                    <span className="truncate">{c.comprador_nombre || c.comprador_nick || 'Comprador'}</span>
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
                  <p className="flex flex-wrap gap-x-2 text-xs text-neutral-500">
                    <span className={c.dia >= plazo ? 'font-medium text-red-600' : ''}>🕒 Día {Math.min(c.dia, plazo)} de {plazo} · {venceEn(c.vence_at)}</span>
                    {c.recordatorios > 0 && <span>· recordatorio {c.recordatorios} enviado</span>}
                    <span>· {c.ultimo_at || c.recordatorios ? `último movimiento hace ${horasDesde(c.ultimo_mov)} h` : `compró hace ${horasDesde(c.fecha)} h`}</span>
                  </p>
                </div>
              </button>
            )
          })}
        {datos?.total !== undefined && datos.porPagina && datos.total > datos.porPagina && (
          <Pagination total={datos.total} page={pagina} pageSize={datos.porPagina} onChange={onPagina} />
        )}
      </div>
    </div>
  )
}
