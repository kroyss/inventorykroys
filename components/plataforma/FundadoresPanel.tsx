'use client'
import { useCallback, useEffect, useState } from 'react'
import VisitasFundadores from './VisitasFundadores'
import { PREGUNTAS, PUNTO_NICK, type Pregunta } from '@/lib/fundadores'

interface Tanda { numero: number; cupos: number; abierta: boolean; inscribe_desde: string | null; inscribe_hasta: string | null; tomados: number }
interface Verif {
  encontrado: boolean; motivo?: string; nickname?: string; nivel?: string | null; lider?: string | null
  ventas_total?: number | null; ventas_periodo?: number | null; periodo?: string | null; desde?: string | null
  anios?: number | null; ventas_texto?: string | null
}
interface Solicitud {
  id: number; nombre: string; telegram: string; nick_ml: string | null; mensaje: string | null
  ventas_mes: string; cuentas: string; despacho: string; dolor: string; inventario: string; herramientas: string | null; compromiso: string | null
  puntaje: number; estado: 'descartado' | 'calificado' | 'aprobado' | 'rechazado'; tanda: number | null
  sospechosa: string | null; ml_verificado: Verif | null; notas: string | null; created_at: string
  fotos: number[]; previas: { ronda: number; estado: string; notas: string | null; fecha: string; fotos: number[] }[]
}
type Filtro = 'calificado' | 'aprobado' | 'rechazado' | 'descartado' | 'todas' | 'radar'

// Marcó "Saber qué vender o qué traer": no suma para Fundadores, pero es público para el Radar
// (también si quedó descartado o rechazado).
const quiereRadar = (s: Solicitud) => s.dolor.split(',').includes('que_vender')

const ESTADO: Record<Solicitud['estado'], { t: string; c: string }> = {
  calificado: { t: 'Por revisar', c: 'bg-sky-50 text-sky-800 ring-sky-200' },
  aprobado:   { t: 'Aprobado', c: 'bg-lime-50 text-lime-800 ring-lime-300' },
  rechazado:  { t: 'Rechazado', c: 'bg-neutral-100 text-neutral-600 ring-neutral-200' },
  descartado: { t: 'Descartado', c: 'bg-neutral-100 text-neutral-500 ring-neutral-200' },
}

const FILTRO: Record<Filtro, string> = {
  calificado: 'Por revisar', aprobado: 'Aprobados', rechazado: 'Rechazados', descartado: 'Descartados', todas: 'Todas', radar: '📡 Interés Radar',
}

// Respuestas en filas: etiqueta corta + una pastilla por opción (verde = suma puntos) + los puntos de la fila.
const ETIQUETA: Record<Pregunta['campo'], string> = {
  ventas_mes: 'Ventas al mes', cuentas: 'Cuentas ML', despacho: 'Despacha por', dolor: 'Le quita tiempo', inventario: 'Usa sistema', herramientas: 'Paga por', compromiso: 'Inventario',
}

function Respuestas({ s }: { s: Solicitud }) {
  return (
    <dl className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1.5 text-sm">
      {PREGUNTAS.filter(p => s[p.campo] != null).map(p => {
        const elegidas = s[p.campo]!.split(',').map(v => p.opciones.find(o => o.valor === v) ?? { valor: v, texto: v, puntos: 0 })
        const pts = elegidas.reduce((a, o) => a + o.puntos, 0)
        return (
          <div key={p.campo} className="contents">
            <dt className="text-neutral-500 py-0.5">{ETIQUETA[p.campo]}</dt>
            <dd className="flex flex-wrap gap-1">
              {elegidas.map(o => (
                <span key={o.valor} className={`rounded-md px-2 py-0.5 text-[13px] ${
                  'descarta' in o && o.descarta ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
                  : o.puntos > 0 ? 'bg-lime-50 text-lime-900 ring-1 ring-inset ring-lime-300'
                  : 'bg-white text-neutral-600 ring-1 ring-inset ring-neutral-300'}`}>{o.texto}</span>
              ))}
            </dd>
            <dd className={`text-xs text-right py-0.5 num ${pts > 0 ? 'text-lime-700 font-medium' : 'text-neutral-300'}`}>+{pts}</dd>
          </div>
        )
      })}
    </dl>
  )
}

const fecha = (s: string) => new Date(s).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Plataforma → Fundadores: solicitudes del Programa Fundadores, por puntaje, y las tandas. */
export default function FundadoresPanel() {
  const [datos, setDatos] = useState<{ solicitudes: Solicitud[]; tandas: Tanda[]; maximo: number } | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('calificado')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; telegram?: string } | null>(null)
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 8000)
    return () => clearTimeout(t)
  }, [aviso])

  const cargar = useCallback(async () => {
    const r = await fetch('/api/plataforma/fundadores')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
    setDatos(d)
  }, [])
  useEffect(() => {
    let vivo = true
    fetch('/api/plataforma/fundadores').then(r => r.json()).then(d => { if (vivo) setDatos(d) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  // Fotos de la nota interna (migración 071): capturas del perfil de ML, reputación, etc.
  const subirFoto = async (s: Solicitud, f: File) => {
    setOcupado(s.id); setError(null)
    const fd = new FormData(); fd.append('foto', f)
    const r = await fetch(`/api/plataforma/fundadores/${s.id}/fotos`, { method: 'POST', body: fd })
    const d = await r.json().catch(() => ({}))
    setOcupado(null)
    if (!r.ok) { setError(d.error ?? 'No se pudo guardar la foto'); return }
    cargar()
  }
  const borrarFoto = async (id: number) => {
    if (!window.confirm('¿Borrar esta foto de la nota?')) return
    await fetch(`/api/plataforma/fundadores/fotos/${id}`, { method: 'DELETE' })
    cargar()
  }

  const accion = async (s: Solicitud, body: { accion: string; notas?: string }) => {
    setError(null); setOcupado(s.id)
    try {
      const r = await fetch(`/api/plataforma/fundadores/${s.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setError(d.error ?? 'No se pudo')
      else if ('accion' in body && body.accion === 'aprobar')
        setAviso({ texto: `${s.nombre} aprobado en la ronda ${d.tanda}. Pasó a “Aprobados”: escríbele por Telegram.`, telegram: s.telegram })
      else if ('accion' in body && body.accion === 'rechazar')
        setAviso({ texto: `${s.nombre} ${s.estado === 'aprobado' ? 'salió de su ronda y quedó' : 'quedó'} en “Rechazados”. No se le avisa nada.` })
      else if ('accion' in body && body.accion === 'reconsiderar')
        setAviso({ texto: `${s.nombre} volvió a “Por revisar”.` })
      await cargar()
    } finally { setOcupado(null) }
  }
  const verificar = async (s: Solicitud, nick?: string) => {
    setError(null); setOcupado(s.id)
    try {
      const r = await fetch(`/api/plataforma/fundadores/${s.id}/verificar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nick ? { nick } : {}),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setError(d.error ?? 'No se pudo verificar')
      await cargar()
    } finally { setOcupado(null) }
  }
  const tanda = async (t: Tanda, cambio: { abierta?: boolean; inscribe_desde?: string | null; inscribe_hasta?: string | null }) => {
    await fetch(`/api/plataforma/fundadores/tandas/${t.numero}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambio),
    })
    cargar()
  }

  if (!datos) return <p className="text-sm text-neutral-400">Cargando…</p>
  const de = (e: Filtro) => e === 'todas' ? datos.solicitudes
    : e === 'radar' ? datos.solicitudes.filter(quiereRadar)
    : datos.solicitudes.filter(s => s.estado === e)
  const cuenta = (e: Filtro) => de(e).length
  const lista = de(filtro)
  const enlace = typeof window !== 'undefined' ? `${window.location.origin}/fundadores` : '/fundadores'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-500">Página pública:</span>
        <a href="/fundadores" target="_blank" rel="noreferrer" className="font-mono text-neutral-800 underline underline-offset-2">{enlace}</a>
        <button onClick={() => navigator.clipboard?.writeText(enlace)} className="btn-ghost text-xs px-2 py-1">Copiar</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {datos.tandas.map(t => (
          <div key={t.numero} className={`rounded-xl border p-4 bg-white ${t.abierta ? 'border-lime-400' : 'border-neutral-200'}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-900">Ronda {t.numero}</span>
              <span className={`text-xs font-medium ${t.abierta ? 'text-lime-700' : 'text-neutral-400'}`}>{t.abierta ? 'Abierta' : 'Cerrada'}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
              Postulaciones
              <input type="date" aria-label="Postulaciones desde" defaultValue={t.inscribe_desde ?? ''}
                onChange={e => tanda(t, { inscribe_desde: e.target.value || null })}
                className="border border-neutral-200 rounded px-1.5 py-0.5 text-neutral-700" />
              al
              <input type="date" aria-label="Postulaciones hasta" defaultValue={t.inscribe_hasta ?? ''}
                onChange={e => tanda(t, { inscribe_hasta: e.target.value || null })}
                className="border border-neutral-200 rounded px-1.5 py-0.5 text-neutral-700" />
            </div>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: t.cupos }, (_, i) => (
                <span key={i} className={`h-2 flex-1 rounded-full ${i < t.tomados ? 'bg-lime-500' : 'bg-neutral-200'}`} />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
              <span>{t.tomados} de {t.cupos} cupos</span>
              <button onClick={() => tanda(t, { abierta: !t.abierta })} className="underline underline-offset-2 hover:text-neutral-800">
                {t.abierta ? 'Cerrar' : 'Abrir'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <VisitasFundadores />

      <div className="flex flex-wrap gap-1.5">
        {(['calificado', 'aprobado', 'rechazado', 'descartado', 'todas', 'radar'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`px-3 py-1 text-xs font-medium rounded-full border ${filtro === f ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'}`}>
            {FILTRO[f]} ({cuenta(f)})
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
      {aviso && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-lime-50 border border-lime-300 text-lime-900 px-4 py-2 rounded text-sm">
          <span>✓ {aviso.texto}</span>
          {aviso.telegram && (
            <a href={`https://t.me/${aviso.telegram}`} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
              Abrir @{aviso.telegram} en Telegram
            </a>
          )}
          <button onClick={() => setAviso(null)} aria-label="Cerrar" className="ml-auto text-lime-700 hover:text-lime-900">✕</button>
        </div>
      )}

      <p className="text-xs text-neutral-500 flex flex-wrap items-center gap-x-3 gap-y-1">
        Las pastillas son lo que marcó:
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-lime-50 ring-1 ring-inset ring-lime-300" />suma puntos</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-white ring-1 ring-inset ring-neutral-300" />marcada, no suma</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 ring-1 ring-inset ring-red-200" />descarta (&lt; 30 ventas)</span>
      </p>

      {lista.length === 0 ? (
        <p className="text-sm text-neutral-400 py-6 text-center">No hay solicitudes en esta vista.</p>
      ) : (
        <div className="space-y-2">
          {lista.map(s => {
            const v = s.ml_verificado
            return (
              <div key={s.id} className="bg-white rounded-xl border border-neutral-200 p-4 flex flex-wrap gap-x-6 gap-y-3">
                <div className="w-16 shrink-0 text-center">
                  <div className="text-2xl font-semibold text-neutral-900 num">{s.puntaje}</div>
                  <div className="text-[11px] text-neutral-400">de {datos.maximo}</div>
                </div>
                <div className="flex-1 min-w-[16rem] space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-neutral-900">{s.nombre}</span>
                    <a href={`https://t.me/${s.telegram}`} target="_blank" rel="noreferrer" className="text-sm text-sky-700 hover:underline">@{s.telegram}</a>
                    <span className={`text-[11px] rounded-full px-2 py-0.5 ring-1 ring-inset ${ESTADO[s.estado].c}`}>
                      {ESTADO[s.estado].t}{s.estado === 'aprobado' && s.tanda ? ` · ronda ${s.tanda}` : ''}
                    </span>
                    {quiereRadar(s) && (
                      <span title="Marcó “Saber qué vender o qué traer”: posible cliente del Radar"
                        className="text-[11px] rounded-full px-2 py-0.5 bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-200">📡 Interés Radar</span>
                    )}
                    <span className="text-xs text-neutral-400">{fecha(s.created_at)}</span>
                  </div>
                  <div className="pt-1"><Respuestas s={s} /></div>
                  <div className="text-xs text-neutral-500 flex flex-wrap items-center gap-2">
                    {s.nick_ml ? <>
                      <span>Nick ML: <a href={`https://www.mercadolibre.com.ve/perfil/vendedor/${encodeURIComponent(s.nick_ml)}`} target="_blank" rel="noreferrer"
                        title="Ver su perfil en MercadoLibre (reputación y calificaciones)" className="font-bold text-neutral-700 underline underline-offset-2 hover:text-neutral-900">{s.nick_ml} ↗</a> <span className="text-lime-700">+{PUNTO_NICK}</span></span>
                      {v ? (v.encontrado
                        ? <span className="text-emerald-700">✓ {v.nickname} · {v.ventas_total != null ? `${v.ventas_total.toLocaleString('de-DE')} ventas en total` : v.ventas_texto ?? 'perfil encontrado'}
                            {v.anios ? ` · ${v.anios} años vendiendo` : ''}
                            {v.ventas_periodo != null ? ` · ${v.ventas_periodo} en ${v.periodo === '60 days' ? '60 días' : v.periodo}` : ''}
                            {v.nivel ? ` · reputación ${v.nivel.replace(/^\d_/, '')}` : ''}{v.lider ? ` · MercadoLíder ${v.lider}` : ''}</span>
                        : <span className="text-amber-700">✗ {v.motivo}</span>) : null}
                      <button onClick={() => verificar(s)} disabled={ocupado === s.id} className="underline underline-offset-2 hover:text-neutral-800">
                        {v ? 'verificar de nuevo' : 'Verificar en ML'}
                      </button>
                      {v && !v.encontrado && (
                        // Suelen escribir el nombre de la tienda: se corrige con el nick real o el enlace de su perfil.
                        <form className="flex items-center gap-1" onSubmit={e => {
                          e.preventDefault()
                          const n = String(new FormData(e.currentTarget).get('nick') ?? '').trim()
                          if (n) verificar(s, n)
                        }}>
                          <input name="nick" placeholder="Nick correcto o enlace del perfil" maxLength={200}
                            className="border border-neutral-300 rounded px-2 py-0.5 text-xs w-56" />
                          <button type="submit" disabled={ocupado === s.id} className="btn-secondary text-xs py-0.5">Corregir</button>
                        </form>
                      )}
                    </> : <span className="text-neutral-400">Sin nick de ML</span>}
                  </div>
                  {s.mensaje && (
                    <p className="text-sm text-neutral-700 bg-neutral-50 border-l-2 border-lime-500 rounded-r px-3 py-1.5 whitespace-pre-line">“{s.mensaje}”</p>
                  )}
                  {s.sospechosa && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">⚠ Ojo: {s.sospechosa}</p>}
                  <input defaultValue={s.notas ?? ''} placeholder="Nota interna… (pega una captura con Ctrl+V)" maxLength={1000}
                    onBlur={e => { if ((e.target.value || null) !== s.notas) accion(s, { accion: 'nota', notas: e.target.value }) }}
                    onPaste={e => {
                      const img = [...e.clipboardData.files].find(f => f.type.startsWith('image/'))
                      if (img) { e.preventDefault(); subirFoto(s, img) }
                    }}
                    className="w-full text-xs border border-transparent hover:border-neutral-200 focus:border-neutral-300 rounded px-2 py-1 text-neutral-600" />
                  <FotosNota fotos={s.fotos} onSubir={f => subirFoto(s, f)} onBorrar={borrarFoto} ocupado={ocupado === s.id} />
                  {s.previas.length > 0 && (
                    <div className="rounded border border-amber-200 bg-amber-50/60 px-2 py-1.5 space-y-1">
                      <p className="text-[11px] font-medium text-amber-900">Ya lo investigaste en rondas anteriores</p>
                      {s.previas.map((p, i) => (
                        <div key={i} className="text-xs text-neutral-700">
                          <span className="text-neutral-500">Ronda {p.ronda} · {p.fecha} · {ESTADO[p.estado as Solicitud['estado']]?.t ?? p.estado}</span>
                          {p.notas && <span> — {p.notas}</span>}
                          {p.fotos.length > 0 && <FotosNota fotos={p.fotos} />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-2 shrink-0">
                  {s.estado !== 'aprobado' && (
                    <button onClick={() => accion(s, { accion: 'aprobar' })} disabled={ocupado === s.id} className="btn-primary text-xs">Aprobar</button>
                  )}
                  {(s.estado === 'calificado' || s.estado === 'aprobado') && (
                    <button onClick={() => accion(s, { accion: 'rechazar' })} disabled={ocupado === s.id} className="btn-secondary text-xs">
                      {s.estado === 'aprobado' ? 'Quitar' : 'Rechazar'}
                    </button>
                  )}
                  {(s.estado === 'rechazado' || s.estado === 'descartado') && (
                    <button onClick={() => accion(s, { accion: 'reconsiderar' })} disabled={ocupado === s.id} className="btn-ghost text-xs">Reconsiderar</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-xs text-neutral-400">
        Aprobar asigna a la ronda en cuyos días se postuló (si ya está llena, a la siguiente con cupo). Al aprobar, escríbele por Telegram y crea su empresa en “Empresas” con la cuenta “⭐ Fundador” (30 días gratis desde ese día).
      </p>
    </div>
  )
}

/** Miniaturas de las fotos de una nota (clic = abrir grande). Con `onSubir`, botón para agregar. */
function FotosNota({ fotos, onSubir, onBorrar, ocupado }: {
  fotos: number[]; onSubir?: (f: File) => void; onBorrar?: (id: number) => void; ocupado?: boolean
}) {
  if (!fotos.length && !onSubir) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {fotos.map(id => (
        <span key={id} className="relative group">
          <a href={`/api/plataforma/fundadores/fotos/${id}`} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/plataforma/fundadores/fotos/${id}`} alt="Foto de la nota" className="h-14 w-20 object-cover rounded border border-neutral-200" />
          </a>
          {onBorrar && (
            <button onClick={() => onBorrar(id)} title="Borrar foto"
              className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-4 h-4 items-center justify-center rounded-full bg-neutral-800 text-white text-[10px]">×</button>
          )}
        </span>
      ))}
      {onSubir && (
        <label className={`text-[11px] text-neutral-500 hover:text-neutral-800 cursor-pointer px-1.5 py-0.5 rounded border border-dashed border-neutral-300 ${ocupado ? 'opacity-50' : ''}`}>
          {ocupado ? 'Subiendo…' : '+ Foto'}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={ocupado}
            onChange={e => { const f = e.target.files?.[0]; if (f) onSubir(f); e.target.value = '' }} />
        </label>
      )}
    </div>
  )
}
