'use client'
import { useCallback, useEffect, useState } from 'react'
import { Cargando } from '@/components/ui'

// Mensajes → Al comprar (lib/mensajeAlComprar.ts, mig 118): un mensaje propio a cada venta nueva, una sola vez.
interface Config { activo: boolean; texto: string; desde: string | null }
interface Fila { pack: string; estado: string; motivo: string | null; texto: string | null; creado_at: string; enviado_at: string | null
                 comprador: string | null; producto: string | null; cuenta: string | null }
interface Datos { config: Config; lista: Fila[]; max: number; esperaMin: number; puedeConfigurar: boolean }

const fechaCorta = (s: string) => new Date(s).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const ESTADO: Record<string, { t: string; c: string }> = {
  enviado: { t: 'Enviado', c: 'text-emerald-700' }, saltado: { t: 'No se mandó', c: 'text-neutral-500' },
  error: { t: 'Error', c: 'text-red-700' }, enviando: { t: 'Enviando…', c: 'text-sky-700' },
}
// Ejemplo para medir el largo: un nombre y un producto típicos (el producto se acorta solo si hace falta).
const EJEMPLO = { nombre: 'Alejandra', producto: 'Audífonos Bluetooth Inalámbricos Con Micrófono Negro' }

export default function MensajeAlComprar() {
  const [d, setD] = useState<Datos | null>(null)
  const [cfg, setCfg] = useState<Config | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/mensajes/al-comprar')
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg({ ok: false, texto: j.error ?? 'No se pudo cargar' }); return }
    setD(j); setCfg(c => c ?? j.config)
  }, [])
  useEffect(() => {
    let vivo = true
    fetch('/api/mensajes/al-comprar').then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!vivo) return
      if (!r.ok) setMsg({ ok: false, texto: j.error ?? 'No se pudo cargar' })
      else { setD(j); setCfg(c => c ?? j.config) }
    }).catch(() => {})
    return () => { vivo = false }
  }, [])

  const guardar = async () => {
    if (!cfg) return
    setMsg(null)
    const r = await fetch('/api/mensajes/al-comprar', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: cfg.activo, texto: cfg.texto }) })
    const j = await r.json().catch(() => ({}))
    setMsg(r.ok ? { ok: true, texto: 'Guardado' } : { ok: false, texto: j.error ?? 'No se pudo guardar' })
    if (r.ok) { setCfg(null); await cargar() }
  }

  if (!d || !cfg) return msg ? <p className="text-sm text-red-600">{msg.texto}</p> : <Cargando />
  const lectura = !d.puedeConfigurar
  const ejemplo = cfg.texto.replaceAll('{nombre}', EJEMPLO.nombre).replaceAll('{producto}', EJEMPLO.producto).replace(/\s{2,}/g, ' ').trim()
  const largo = ejemplo.length

  return (
    <div className="space-y-4">
      <section className={`rounded-xl border shadow-sm p-4 space-y-3 ${d.config.activo ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-neutral-200'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={cfg.activo} disabled={lectura} onChange={e => setCfg({ ...cfg, activo: e.target.checked })} className="mt-1 w-4 h-4" />
          <span>
            <span className="font-semibold text-neutral-900">Mandar un mensaje a cada comprador nuevo</span>
            <span className="block text-sm text-neutral-600">
              Unos <b>{d.esperaMin} a 8 minutos</b> después de la compra, después de los dos mensajes automáticos de MercadoLibre, le llega
              {' '}este mensaje tuyo. <b>Una sola vez por venta.</b> Solo a las ventas que entren desde que lo prendes.
            </span>
            <span className="block text-xs text-neutral-500 mt-1">
              No se manda si la venta se canceló o si el comprador ya te escribió (para no pisar la conversación).
            </span>
          </span>
        </label>

        <div className="space-y-1">
          <textarea value={cfg.texto} disabled={lectura} rows={4} maxLength={300}
            onChange={e => setCfg({ ...cfg, texto: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm" />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-neutral-500"><code>{'{nombre}'}</code> = primer nombre del comprador · <code>{'{producto}'}</code> = lo que compró</span>
            <span className={`num font-medium ${largo > d.max ? 'text-red-700' : largo > d.max - 40 ? 'text-amber-700' : 'text-neutral-500'}`}
              title="Largo con un nombre y un producto de ejemplo. MercadoLibre corta los mensajes de más de 350 caracteres sin avisar; si el producto es muy largo, el sistema lo acorta.">
              {largo} / {d.max} caracteres
            </span>
          </div>
          {largo > d.max && <p className="text-xs text-red-700">Con un nombre y un producto normales pasa de {d.max}: ML lo cortaría. Acórtalo.</p>}
          <p className="text-xs text-neutral-500"><b>Así le llega:</b> {ejemplo}</p>
          <p className="text-xs text-neutral-400">
            Para no tener problemas con MercadoLibre: que sea de <b>la compra</b> (cómo pagar, cómo coordinar el envío), sin promociones ni
            {' '}ofertas de otros productos.
          </p>
        </div>

        {!lectura && (
          <div className="flex items-center justify-end gap-3">
            {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.texto}</span>}
            <button onClick={guardar} disabled={largo > d.max} className="btn-primary text-sm">Guardar</button>
          </div>
        )}
        {lectura && <p className="text-xs text-neutral-500">Lo configura un administrador de tu empresa.</p>}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <h3 className="border-b border-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-900">Últimos 7 días</h3>
        {d.lista.length === 0 ? <p className="px-4 py-6 text-center text-sm text-neutral-400">Todavía no se mandó ninguno.</p> : (
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
      </section>
    </div>
  )
}
