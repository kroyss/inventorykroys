'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Cargando } from '@/components/ui'
import { Ventana } from '@/components/ui/Ventana'

// Mensajes → Configuración → Al recibir compra (lib/mensajeAlComprar.ts, mig 118): mensajes propios a cada venta nueva,
// una sola vez. 22-11 (el dueño): hasta 2 mensajes, en acordeón (uno abierto a la vez), el campo se ve completo,
// «Ver cómo llega» en una ventana y el historial por páginas.
interface Config { activo: boolean; textos: string[]; desde: string | null }
interface Fila { pack: string; estado: string; motivo: string | null; texto: string | null; creado_at: string; enviado_at: string | null
                 comprador: string | null; producto: string | null; cuenta: string | null }
interface Datos { config: Config; lista: Fila[]; hayMas: boolean; pagina: number; max: number; maxMensajes: number; esperaMin: number; puedeConfigurar: boolean }

const fechaCorta = (s: string) => new Date(s).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const ESTADO: Record<string, { t: string; c: string }> = {
  enviado: { t: 'Enviado', c: 'text-emerald-700' }, saltado: { t: 'No se mandó', c: 'text-neutral-500' },
  error: { t: 'Error', c: 'text-red-700' }, enviando: { t: 'Enviando…', c: 'text-sky-700' },
}
// Ejemplo para medir el largo: un nombre y un producto típicos (el producto se acorta solo si hace falta, como armarTexto).
const EJEMPLO = { nombre: 'Alejandra', producto: 'Audífonos Bluetooth Inalámbricos Con Micrófono Negro' }
const armar = (t: string) => t.replaceAll('{nombre}', EJEMPLO.nombre).replaceAll('{producto}', EJEMPLO.producto).replace(/[ \t]{2,}/g, ' ')
  .replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

/** Campo que crece con el texto: se ve completo, sin barra interna. */
function CampoTexto({ valor, onCambio, disabled, max }: { valor: string; onCambio: (v: string) => void; disabled: boolean; max: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [valor])
  return (
    <textarea ref={ref} value={valor} disabled={disabled} rows={3} maxLength={max + 50} autoFocus={!disabled}
      onChange={e => onCambio(e.target.value)}
      className="w-full resize-none overflow-hidden rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm leading-relaxed focus:border-neutral-500 focus:outline-none" />
  )
}

export default function MensajeAlComprar() {
  const [d, setD] = useState<Datos | null>(null)
  const [cfg, setCfg] = useState<Config | null>(null)
  const [abierto, setAbierto] = useState(-1)           // qué mensaje se está editando (uno a la vez; al entrar, todos cerrados)
  const [verComo, setVerComo] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async (p: number, conConfig: boolean) => {
    const r = await fetch(`/api/mensajes/al-comprar?pagina=${p}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg({ ok: false, texto: j.error ?? 'No se pudo cargar' }); return }
    setD(j)
    if (conConfig) setCfg(j.config)
  }, [])
  useEffect(() => {
    let vivo = true
    fetch('/api/mensajes/al-comprar?pagina=1').then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!vivo) return
      if (!r.ok) setMsg({ ok: false, texto: j.error ?? 'No se pudo cargar' })
      else { setD(j); setCfg(j.config) }
    }).catch(() => {})
    return () => { vivo = false }
  }, [])

  const cambiarPagina = (p: number) => { setPagina(p); void cargar(p, false) }

  const guardar = async () => {
    if (!cfg) return
    setMsg(null); setGuardando(true)
    const textos = cfg.textos.map(t => t.trim()).filter(Boolean)
    const r = await fetch('/api/mensajes/al-comprar', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: cfg.activo, textos }) })
    const j = await r.json().catch(() => ({}))
    setGuardando(false)
    setMsg(r.ok ? { ok: true, texto: 'Guardado' } : { ok: false, texto: j.error ?? 'No se pudo guardar' })
    if (r.ok) { setAbierto(-1); await cargar(pagina, true) }
  }

  if (!d || !cfg) return msg ? <p className="text-sm text-red-600">{msg.texto}</p> : <Cargando />
  const lectura = !d.puedeConfigurar
  const largos = cfg.textos.map(t => armar(t).length)
  const pasado = largos.some(l => l > d.max)
  const vacio = cfg.textos.some(t => t.trim().length < 10)
  const cambiado = JSON.stringify({ a: cfg.activo, t: cfg.textos.map(t => t.trim()) }) !== JSON.stringify({ a: d.config.activo, t: d.config.textos })
  const setTexto = (i: number, v: string) => setCfg({ ...cfg, textos: cfg.textos.map((t, k) => k === i ? v : t) })
  const agregar = () => { setCfg({ ...cfg, textos: [...cfg.textos, ''] }); setAbierto(cfg.textos.length) }
  const quitar = (i: number) => { setCfg({ ...cfg, textos: cfg.textos.filter((_, k) => k !== i) }); setAbierto(0) }

  return (
    <div className="space-y-4">
      <section className={`rounded-xl border shadow-sm p-4 space-y-4 ${d.config.activo ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-neutral-200'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={cfg.activo} disabled={lectura} onChange={e => setCfg({ ...cfg, activo: e.target.checked })} className="mt-1 w-4 h-4" />
          <span>
            <span className="font-semibold text-neutral-900">Mandar mensajes a cada comprador nuevo</span>
            <span className="block text-sm text-neutral-600">
              A <b>los pocos segundos</b> de la compra (unos 10), después de los dos mensajes automáticos de MercadoLibre. <b>Una sola vez
              {' '}por venta</b> y solo a las ventas que entren desde que lo prendes.
            </span>
            <span className="block text-xs text-neutral-500 mt-1">
              No se manda si la venta se canceló o si el comprador escribió primero: así su mensaje queda en «Por atender» y no se pierde.
            </span>
          </span>
        </label>

        {/* Acordeón: un mensaje abierto a la vez; los cerrados muestran el comienzo y el largo. */}
        <div className="space-y-2">
          {cfg.textos.map((t, i) => {
            const abiertoAqui = abierto === i
            const largo = largos[i]
            const colorLargo = largo > d.max ? 'text-red-700' : largo > d.max - 40 ? 'text-amber-700' : 'text-neutral-500'
            return (
              <div key={i} className={`rounded-lg border bg-white ${abiertoAqui ? 'border-neutral-400 shadow-sm' : 'border-neutral-200'}`}>
                <button type="button" onClick={() => setAbierto(abiertoAqui ? -1 : i)} aria-expanded={abiertoAqui}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-neutral-900">Mensaje {i + 1}{i === 1 && <span className="font-normal text-neutral-500"> · unos segundos después del 1</span>}</span>
                    {!abiertoAqui && <span className="block truncate text-xs text-neutral-500">{t.trim() || 'Sin escribir'}</span>}
                  </span>
                  <span className={`num shrink-0 text-xs font-medium ${colorLargo}`}>{largo} / {d.max}</span>
                  <svg viewBox="0 0 16 16" className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${abiertoAqui ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
                </button>
                {abiertoAqui && (
                  <div className="space-y-1.5 border-t border-neutral-100 px-3 pb-3 pt-2.5">
                    <CampoTexto valor={t} onCambio={v => setTexto(i, v)} disabled={lectura} max={d.max} />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-neutral-500"><code>{'{nombre}'}</code> = primer nombre del comprador · <code>{'{producto}'}</code> = lo que compró</span>
                      {i > 0 && !lectura && <button type="button" onClick={() => quitar(i)} className="text-red-600 hover:underline">Quitar este mensaje</button>}
                    </div>
                    {largo > d.max && <p className="text-xs text-red-700">Con un nombre y un producto normales pasa de {d.max} caracteres: MercadoLibre lo cortaría. Acórtalo{cfg.textos.length < d.maxMensajes ? ' o pasa una parte al mensaje 2' : ''}.</p>}
                  </div>
                )}
              </div>
            )
          })}
          {!lectura && cfg.textos.length < d.maxMensajes && (
            <button type="button" onClick={agregar}
              className="w-full rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:border-neutral-400 hover:text-neutral-900">
              + Agregar un segundo mensaje <span className="text-neutral-400">(opcional, si no te alcanzan {d.max} caracteres)</span>
            </button>
          )}
          {cfg.textos.length > 1 && (
            <p className="text-xs text-amber-800 rounded-lg bg-amber-50 px-3 py-2">
              MercadoLibre limita los mensajes seguidos sin respuesta del comprador. Usa el segundo solo si hace falta: si ML lo rechaza,
              {' '}el primero igual llega y en el historial queda el motivo.
            </p>
          )}
          <p className="text-xs text-neutral-400">
            Para no tener problemas con MercadoLibre: que sea de <b>la compra</b> (cómo pagar, cómo coordinar el envío), sin promociones ni
            {' '}ofertas de otros productos.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setVerComo(true)} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50">
            Ver cómo llega
          </button>
          {!lectura ? (
            <div className="flex items-center gap-3">
              {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.texto}</span>}
              <button onClick={guardar} disabled={pasado || vacio || guardando || !cambiado} className="btn-primary text-sm disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          ) : <p className="text-xs text-neutral-500">Lo configura un administrador de tu empresa.</p>}
        </div>
      </section>

      {verComo && (
        <Ventana titulo="Así le llega al comprador" onCerrar={() => setVerComo(false)}>
          <p className="text-xs text-neutral-500">Con un nombre y un producto de ejemplo ({EJEMPLO.nombre} · {EJEMPLO.producto}).</p>
          <div className="space-y-2 rounded-xl bg-neutral-100 p-3">
            {['Mensaje automático de MercadoLibre: datos de la compra', 'Mensaje automático de MercadoLibre: cómo sigue el envío'].map(t => (
              <div key={t} className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white/60 px-3 py-2 text-xs italic text-neutral-400">{t}</div>
            ))}
            {cfg.textos.filter(t => t.trim()).map((t, i) => (
              <div key={i} className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm [overflow-wrap:anywhere]">
                {armar(t)}
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-500">Se ve como en la conversación de MercadoLibre del comprador: primero los dos de ML y después {cfg.textos.length > 1 ? 'los tuyos' : 'el tuyo'}.</p>
        </Ventana>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <h3 className="border-b border-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-900">Últimos 7 días</h3>
        {d.lista.length === 0 ? <p className="px-4 py-6 text-center text-sm text-neutral-400">{pagina > 1 ? 'No hay más.' : 'Todavía no se mandó ninguno.'}</p> : (
          <ul className="divide-y divide-neutral-100">
            {d.lista.map(f => (
              <li key={f.pack} className="px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`text-xs font-semibold ${ESTADO[f.estado]?.c ?? ''}`}>{ESTADO[f.estado]?.t ?? f.estado}</span>
                  <span className="font-medium text-neutral-900">{f.comprador ?? '—'}</span>
                  <span className="font-mono text-[11px] text-neutral-400">{f.pack}</span>
                  <span className="text-xs text-neutral-400">{f.cuenta ?? ''} · {fechaCorta(f.enviado_at ?? f.creado_at)}</span>
                </div>
                {f.producto && <div className="truncate text-xs text-neutral-600">{f.producto}</div>}
                {f.motivo && <div className="text-xs text-neutral-500">{f.motivo}</div>}
              </li>
            ))}
          </ul>
        )}
        {(pagina > 1 || d.hayMas) && (
          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-2 text-sm">
            <button type="button" disabled={pagina <= 1} onClick={() => cambiarPagina(pagina - 1)} className="text-neutral-700 disabled:text-neutral-300">‹ Más nuevos</button>
            <span className="text-xs text-neutral-400">Página {pagina}</span>
            <button type="button" disabled={!d.hayMas} onClick={() => cambiarPagina(pagina + 1)} className="text-neutral-700 disabled:text-neutral-300">Más viejos ›</button>
          </div>
        )}
      </section>
    </div>
  )
}
