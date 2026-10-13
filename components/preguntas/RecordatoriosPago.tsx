'use client'
import { useCallback, useEffect, useState } from 'react'
import { Cargando, EmptyState } from '@/components/ui'

// Mensajes → Recordatorios (lib/recordatoriosPago.ts): configuración, a quién le llegaría hoy y los
// detenidos. Solo empresas con Pagos ME.
interface Config { activo: boolean; dias: number; veces: 1 | 2; texto: string; final: { activo: boolean; texto: string } }
interface Fila {
  pack: string; cuenta: string; comprador: string | null; producto: string | null; fecha: string; dia: number
  enviados: number; ultimo_at: string | null; error: string | null; ultimo: boolean; texto: string
}
interface Turno { clave: string; estado: string; at?: string; enviados?: number; errores?: number; saltados?: number; motivo?: string }
interface Datos {
  config: Config; horas: number[]; turno: Turno | null; puedeConfigurar: boolean; lista: Fila[]
  detenidos: { pack: string; detenido: string; detenido_at: string; enviados: number; comprador: string | null; producto: string | null }[]
}

const DETENIDO: Record<string, string> = { manual: 'Ya pagó (a mano)', ml: 'ML rechazó el mensaje', cancelada: 'Venta cancelada' }
const fechaCorta = (s: string) => new Date(s).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function RecordatoriosPago() {
  const [d, setD] = useState<Datos | null>(null)
  const [cfg, setCfg] = useState<Config | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/mensajes/recordatorios')
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg({ ok: false, texto: j.error ?? 'No se pudo cargar' }); return }
    setD(j); setCfg(c => c ?? j.config)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    if (!cfg) return
    setMsg(null)
    const r = await fetch('/api/mensajes/recordatorios', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
    const j = await r.json().catch(() => ({}))
    setMsg(r.ok ? { ok: true, texto: 'Guardado' } : { ok: false, texto: j.error ?? 'No se pudo guardar' })
    if (r.ok) { setCfg(null); await cargar() }
  }
  const detener = async (pack: string, detener: boolean) => {
    setOcupado(pack)
    await fetch('/api/mensajes/recordatorios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack, detener }) })
    await cargar(); setOcupado(null)
  }

  if (!d || !cfg) return msg ? <p className="text-sm text-red-600">{msg.texto}</p> : <Cargando />
  const lectura = !d.puedeConfigurar
  const total = cfg.dias * cfg.veces
  const t = d.turno

  return (
    <div className="space-y-4">
      <section className={`rounded-xl border shadow-sm p-4 space-y-2 ${d.config.activo ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-neutral-200'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={cfg.activo} disabled={lectura} onChange={e => setCfg({ ...cfg, activo: e.target.checked })} className="mt-1 w-4 h-4" />
          <span>
            <span className="font-semibold text-neutral-900">Recordar el pago a quien compró y no ha concretado</span>
            <span className="block text-sm text-neutral-600">
              Desde el <b>2.º día</b> de la compra se le manda un mensaje por MercadoLibre. Antes de cada envío se traen los pagos de
              {' '}MercadoEnvíos: si no se pueden traer, <b>ese turno no se manda nada</b>.
            </span>
            <span className="block text-xs text-neutral-500 mt-1">
              No se le manda a quien: ya tiene el pago traído, la venta registrada o la guía en Despachos, está calificada o cancelada,
              {' '}o te escribió después de comprar. Ni a quien marques &quot;Ya pagó&quot;.
            </span>
          </span>
        </label>
        {t && (
          <p className="text-xs text-neutral-600 border-t border-black/5 pt-2">
            Último turno: {t.at ? fechaCorta(t.at) : t.clave.split('#')[0]} ·{' '}
            {t.estado === 'listo' ? <>{t.enviados ?? 0} enviados{t.saltados ? ` · ${t.saltados} saltados (ya escribieron o se cancelaron)` : ''}{t.errores ? <span className="text-red-700"> · {t.errores} con error</span> : ''}</>
              : t.estado === 'omitido' ? <span className="text-amber-800">no se mandó nada: {t.motivo}</span>
              : t.estado === 'esperando_me' ? 'trayendo los pagos de MercadoEnvíos…' : 'enviando…'}
          </p>
        )}
      </section>

      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-700">
          <label className="flex items-center gap-2">Durante
            <select value={cfg.dias} disabled={lectura} onChange={e => setCfg({ ...cfg, dias: Number(e.target.value) })} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm">
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} {n === 1 ? 'día' : 'días'}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <select value={cfg.veces} disabled={lectura} onChange={e => setCfg({ ...cfg, veces: Number(e.target.value) === 2 ? 2 : 1 })} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm">
              <option value={1}>1 vez al día (10:00)</option>
              <option value={2}>2 veces al día (10:00 y 17:00)</option>
            </select>
          </label>
          <span className="text-xs text-neutral-500">Máximo {total} {total === 1 ? 'recordatorio' : 'recordatorios'} por compra.</span>
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-neutral-900">Texto del recordatorio</h2>
          <textarea value={cfg.texto} disabled={lectura} rows={3} maxLength={290} onChange={e => setCfg({ ...cfg, texto: e.target.value })}
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          <p className="text-xs text-neutral-500">{'{nombre}'} = primer nombre del comprador · {'{producto}'} = lo que compró. Deja la frase &quot;si ya pagaste, ignora este mensaje&quot;: si a alguien le llega por error, no molesta.</p>
        </div>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm font-semibold text-neutral-900 cursor-pointer">
            <input type="checkbox" checked={cfg.final.activo} disabled={lectura} onChange={e => setCfg({ ...cfg, final: { ...cfg.final, activo: e.target.checked } })} className="w-4 h-4" />
            Último aviso con otro texto
          </label>
          {cfg.final.activo && (
            <textarea value={cfg.final.texto} disabled={lectura} rows={3} maxLength={290} onChange={e => setCfg({ ...cfg, final: { ...cfg.final, texto: e.target.value } })}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          )}
        </div>
        {!lectura && (
          <div className="flex items-center justify-end gap-3">
            {msg && <span className={`text-xs ${msg.ok ? 'text-neutral-600' : 'text-red-600'}`}>{msg.texto}</span>}
            <button onClick={guardar} className="btn-primary text-sm">Guardar</button>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <h2 className="px-4 py-3 text-sm font-semibold text-neutral-900 border-b border-neutral-100">
          {d.config.activo ? 'Hoy le llegaría a' : 'Si lo prendes, hoy le llegaría a'} ({d.lista.length})
        </h2>
        {d.lista.length === 0 ? <EmptyState message="Nadie: todas las compras de estos días ya tienen alguna señal de pago." /> : (
          <ul className="divide-y divide-neutral-100">
            {d.lista.map(f => (
              <li key={f.pack} className="px-4 py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <span className="font-semibold text-neutral-700 bg-neutral-100 rounded-full px-2 py-0.5">{f.cuenta}</span>
                  <span className="text-neutral-800 font-medium">{f.comprador ?? '—'}</span>
                  <span>compró hace {f.dia} días · venta {f.pack}</span>
                  {f.enviados > 0 && <span>· {f.enviados} de {total} enviados</span>}
                  {f.ultimo && <span className="text-amber-700">· último aviso</span>}
                  <button onClick={() => detener(f.pack, true)} disabled={ocupado === f.pack}
                    className="ml-auto btn-secondary text-xs" title="No se le mandan más recordatorios a esta venta">Ya pagó, no recordar</button>
                </div>
                <p className="text-sm text-neutral-900 truncate">{f.producto}</p>
                <p className="text-xs text-neutral-500 italic">&ldquo;{f.texto}&rdquo;</p>
                {f.error && <p className="text-xs text-red-600">Último intento: {f.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {d.detenidos.length > 0 && (
        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-semibold text-neutral-900 border-b border-neutral-100">Detenidos (últimos 10 días)</h2>
          <ul className="divide-y divide-neutral-100">
            {d.detenidos.map(x => (
              <li key={x.pack} className="px-4 py-2.5 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                <span className="text-neutral-800 font-medium">{x.comprador ?? x.pack}</span>
                <span className="truncate max-w-[16rem]">{x.producto}</span>
                <span>· {DETENIDO[x.detenido] ?? x.detenido} · {fechaCorta(x.detenido_at)}</span>
                {x.detenido === 'manual' && (
                  <button onClick={() => detener(x.pack, false)} disabled={ocupado === x.pack} className="ml-auto btn-secondary text-xs">Volver a recordar</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
