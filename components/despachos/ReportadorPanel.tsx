'use client'
import { useCallback, useEffect, useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'

interface Cuenta { nombre: string; filtro: string; pagina: string }
interface Config { cuentas: Cuenta[]; plantillas: string[]; bloque: string }
interface Equipo {
  id: number; nombre: string | null; vinculado_at: string | null; last_seen_at: string | null
  version: string | null; codigo: string | null; codigo_expira: string | null
}
interface Estado { equipos: Equipo[]; config: Config; problemas: string[]; limite: number }

const fechaHora = (s: string) => new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

// Igual que lib/reportador.ts rellenar(): peor caso = página más larga + guía de 12 dígitos.
const rellenar = (t: string, bloque: string, pagina: string, guia: string) =>
  (t + bloque).split('{pagina}').join(pagina).split('{guia}').join(guia)

/** Panel del Reportador conectado: equipos vinculados y mensajes (Despachos). */
export default function ReportadorPanel({ isAdmin }: { isAdmin: boolean }) {
  const confirm = useConfirm()
  const [estado, setEstado]   = useState<Estado | null>(null)
  const [editando, setEditando] = useState<Config | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(() => fetch('/api/despachos/reportador').then(async r => {
    if (r.ok) setEstado(await r.json())
  }), [])
  useEffect(() => { cargar() }, [cargar])

  const vincular = async () => {
    setError(null)
    const r = await fetch('/api/despachos/reportador/equipos', { method: 'POST' })
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'Error'); return }
    cargar()
  }

  const desvincular = async (e: Equipo) => {
    if (!await confirm({
      title: 'Desvincular equipo',
      message: `¿Desvincular "${e.nombre ?? 'equipo'}"? Dejará de poder reportar hasta que lo vuelvas a vincular.`,
      confirmText: 'Desvincular', danger: true,
    })) return
    await fetch(`/api/despachos/reportador/equipos/${e.id}`, { method: 'DELETE' })
    cargar()
  }

  const guardar = async () => {
    if (!editando) return
    setGuardando(true); setError(null)
    const r = await fetch('/api/despachos/reportador', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editando),
    })
    setGuardando(false)
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'Error'); return }
    setEditando(null)
    cargar()
  }

  if (!estado) return null
  const { equipos, config, problemas, limite } = estado
  const vinculados = equipos.filter(e => e.vinculado_at)
  const codigos    = equipos.filter(e => !e.vinculado_at && e.codigo)

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-neutral-100">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800">Reportador</h2>
          <p className="text-xs text-neutral-500">
            Programa que le escribe a cada comprador su guía. Toma los envíos de las jornadas cerradas.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={() => setEditando(structuredClone(config))} className="btn-secondary text-xs">Mensajes y cuentas</button>
            <button onClick={vincular} className="btn-secondary text-xs">+ Vincular equipo</button>
          </div>
        )}
      </div>

      {error && <div className="mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
      {problemas.length > 0 && !editando && (
        <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-sm">
          Configuración incompleta: {problemas.join(' · ')}
        </div>
      )}

      <div className="px-4 py-3 space-y-2 text-sm">
        {codigos.map(c => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-200 rounded px-3 py-2">
            <span>Código para vincular:</span>
            <span className="font-mono text-lg font-bold tracking-widest">{c.codigo}</span>
            <span className="text-xs text-blue-700">
              Escríbelo en el Reportador del equipo. Vence {c.codigo_expira ? `a las ${new Date(c.codigo_expira).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit' })}` : 'pronto'}.
            </span>
          </div>
        ))}
        {vinculados.length === 0
          ? <p className="text-neutral-400">Ningún equipo vinculado todavía.</p>
          : vinculados.map(e => (
              <div key={e.id} className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{e.nombre ?? `Equipo #${e.id}`}</span>
                  <span className="text-xs text-neutral-500 ml-2">
                    {e.last_seen_at ? `última conexión ${fechaHora(e.last_seen_at)}` : 'sin conexión'}
                    {e.version ? ` · v${e.version}` : ''}
                  </span>
                </div>
                {isAdmin && <button onClick={() => desvincular(e)} className="text-xs text-neutral-400 hover:text-red-600">Desvincular</button>}
              </div>
            ))}
      </div>

      {editando && (
        <EditorConfig config={editando} limite={limite} onChange={setEditando}
          onGuardar={guardar} onCancelar={() => { setEditando(null); setError(null) }} guardando={guardando} />
      )}
    </section>
  )
}

function EditorConfig({ config, limite, onChange, onGuardar, onCancelar, guardando }: {
  config: Config; limite: number; onChange: (c: Config) => void
  onGuardar: () => void; onCancelar: () => void; guardando: boolean
}) {
  const setCuenta = (i: number, k: keyof Cuenta, v: string) =>
    onChange({ ...config, cuentas: config.cuentas.map((c, j) => (j === i ? { ...c, [k]: v } : c)) })
  const setPlantilla = (i: number, v: string) =>
    onChange({ ...config, plantillas: config.plantillas.map((p, j) => (j === i ? v : p)) })
  const paginaLarga = config.cuentas.reduce((a, c) => (c.pagina.length > a.length ? c.pagina : a), '')
  const input = 'border border-neutral-300 rounded px-2 py-1 text-sm w-full'

  return (
    <div className="border-t border-neutral-100 px-4 py-4 space-y-4 bg-neutral-50/50">
      <div>
        <h3 className="text-xs font-semibold text-neutral-600 mb-1">Cuentas de MercadoLibre</h3>
        <p className="text-xs text-neutral-500 mb-2">
          Cada envío va a la cuenta cuyo <b>remitente</b> (en la etiqueta) empieza con el texto indicado.
        </p>
        <div className="space-y-2">
          {config.cuentas.map((c, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr_auto] gap-2 items-center">
              <input className={input} placeholder="Nombre (p.ej. PIKEKE)" value={c.nombre} onChange={e => setCuenta(i, 'nombre', e.target.value)} />
              <input className={input} placeholder="Remitente empieza con" value={c.filtro} onChange={e => setCuenta(i, 'filtro', e.target.value)} />
              <input className={input} placeholder="Página de la tienda (opcional)" value={c.pagina} onChange={e => setCuenta(i, 'pagina', e.target.value)} />
              <button onClick={() => onChange({ ...config, cuentas: config.cuentas.filter((_, j) => j !== i) })}
                className="text-xs text-neutral-400 hover:text-red-600">Quitar</button>
            </div>
          ))}
          {config.cuentas.length < 5 && (
            <button onClick={() => onChange({ ...config, cuentas: [...config.cuentas, { nombre: '', filtro: '', pagina: '' }] })}
              className="text-xs text-neutral-600 underline">+ Agregar cuenta</button>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-neutral-600 mb-1">Plantillas del mensaje</h3>
        <p className="text-xs text-neutral-500 mb-2">
          Se elige una al azar por comprador. <code>{'{guia}'}</code> se reemplaza por la guía y <code>{'{pagina}'}</code> por la página de la cuenta.
          MercadoLibre corta en {limite} caracteres sin avisar.
        </p>
        <div className="space-y-2">
          {config.plantillas.map((p, i) => {
            const largo = rellenar(p, config.bloque, paginaLarga, '9'.repeat(12)).length
            return (
              <div key={i} className="flex gap-2 items-start">
                <textarea className={`${input} min-h-[2.5rem]`} rows={1} value={p} onChange={e => setPlantilla(i, e.target.value)} />
                <span className={`text-xs whitespace-nowrap pt-1 ${largo > limite ? 'text-red-700 font-semibold' : 'text-neutral-500'}`}>
                  {largo}/{limite}
                </span>
                <button onClick={() => onChange({ ...config, plantillas: config.plantillas.filter((_, j) => j !== i) })}
                  className="text-xs text-neutral-400 hover:text-red-600 pt-1">Quitar</button>
              </div>
            )
          })}
          {config.plantillas.length < 10 && (
            <button onClick={() => onChange({ ...config, plantillas: [...config.plantillas, 'Buen día, su pedido fue despachado. Guía ZOOM: {guia}'] })}
              className="text-xs text-neutral-600 underline">+ Agregar plantilla</button>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-neutral-600 mb-1">Texto final (se agrega a todas las plantillas)</h3>
        <textarea className={input} rows={5} value={config.bloque} onChange={e => onChange({ ...config, bloque: e.target.value })} />
        <p className="text-xs text-neutral-500 mt-1">
          Ojo: MercadoLibre rechaza links de Facebook (incluso acortados). t.me y youtube.com sí pasan.
        </p>
      </div>

      {config.plantillas[0] && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-600 mb-1">Vista previa</h3>
          <pre className="text-xs bg-white border border-neutral-200 rounded p-2 whitespace-pre-wrap font-sans">
            {rellenar(config.plantillas[0], config.bloque, config.cuentas[0]?.pagina ?? '', '1701822939')}
          </pre>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="btn-secondary text-sm">Cancelar</button>
        <button onClick={onGuardar} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  )
}
