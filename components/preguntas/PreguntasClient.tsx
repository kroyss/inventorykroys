'use client'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader, Tabs, Pagination, EmptyState, Cargando, StatusBadge } from '@/components/ui'
import { Sugerencias, UsoIA, avisarUsoIA, type Sugerencia } from '@/components/preguntas/AyudaIA'
import { PreguntasPrevias } from '@/components/preguntas/PreguntasPrevias'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { problemasDelTexto, revisarTexto, plantillaAplica, condicionPlantilla, type Plantilla } from '@/lib/preguntasTexto'

interface Pregunta {
  id: string; item_id: string; item_titulo: string | null; item_permalink: string | null; item_estado: string | null
  texto: string; estado: string; fecha: string
  respuesta: string | null; respuesta_estado: string | null; respuesta_fecha: string | null
  borrador: string | null; borrador_confianza: 'alta' | 'media' | 'baja' | null; borrador_falta: string | null
  borrador_web: boolean; borrador_at: string | null
  cuenta: string; respondida_por: string | null
  producto_code: string | null; producto_nombre: string | null; producto_stock: number | null
  producto_precio: number | null
  comprador_id: string | null; previas: number
  item_precio: number | null; item_precio_original: number | null; item_moneda: string | null
}

// Precio para decidir (regla de los $3, respuesta rápida en verde): SOLO el de MercadoLibre
// (el que ve el comprador, con la promoción). El del inventario no aplica aquí.
function precioUSD(p: Pregunta) {
  return p.item_precio && (p.item_moneda ?? 'USD') === 'USD' ? p.item_precio : null
}

// Link a la publicación: el que trajo ML o, si ML no dejó leerla, armado con el código.
function linkPublicacion(p: Pregunta) {
  if (p.item_permalink) return p.item_permalink
  const m = /^(ML[A-Z]|MCO)(\d+)$/.exec(p.item_id)
  if (!m) return null
  const dominio = m[1] === 'MCO' ? 'com.co' : 'com.ve'
  return `https://articulo.mercadolibre.${dominio}/${m[1]}-${m[2]}-_JM`
}

/** Producto de la pregunta: nombre del sistema (o título de ML) + código + stock. */
// Límite de precio de las respuestas rápidas (p. ej. "menos de $3 → mínimo 2 unidades"):
// debajo de él el precio se resalta para responder con la regla correcta.
function umbralDe(plantillas: Plantilla[]) {
  const h = plantillas.map(p => p.precio_hasta).filter((x): x is number => typeof x === 'number' && x > 0)
  return h.length ? Math.min(...h) : null
}
const usd = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Producto({ p, umbral = null }: { p: Pregunta; umbral?: number | null }) {
  const nombre = p.producto_nombre ?? p.item_titulo
  const link = linkPublicacion(p)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
      {link
        ? <a href={link} target="_blank" rel="noreferrer" title="Ver la publicación en MercadoLibre"
            className={`truncate max-w-[30rem] hover:underline underline-offset-2 ${nombre ? 'font-medium text-neutral-800' : 'text-neutral-500'}`}>
            {nombre ?? 'Publicación sin vincular a un producto'} <span className="text-neutral-400">↗</span>
          </a>
        : nombre
          ? <span className="font-medium text-neutral-800 truncate max-w-[30rem]">{nombre}</span>
          : <span className="text-neutral-500">Publicación sin vincular a un producto</span>}
      {p.producto_code && <span className="font-mono text-neutral-400">{p.producto_code}</span>}
      <Precio p={p} umbral={umbral} />
      {p.producto_stock !== null && (
        <span className={p.producto_stock > 0 ? 'text-emerald-700' : 'text-red-600'}>
          {p.producto_stock > 0 ? `${p.producto_stock} en stock` : 'Sin stock'}
        </span>
      )}
      <span className="font-mono text-neutral-400">{p.item_id}</span>
    </span>
  )
}
/** Precio en MercadoLibre ahora (con la promoción; el anterior, tachado). */
function Precio({ p, umbral }: { p: Pregunta; umbral: number | null }) {
  if (!p.item_precio) return null
  const simbolo = (p.item_moneda ?? 'USD') === 'USD' ? '$' : `${p.item_moneda} `
  const ref = precioUSD(p)
  const bajo = umbral !== null && ref !== null && ref < umbral
  return (
    <span className="inline-flex items-center gap-1.5" title="Precio en MercadoLibre ahora (con la promoción, si hay)">
      <span className={`font-semibold num ${bajo ? 'text-amber-800 bg-amber-50 ring-1 ring-inset ring-amber-200 rounded-full px-2 py-0.5' : 'text-neutral-800'}`}>
        {simbolo}{usd(p.item_precio)}{bajo && ` · menos de $${umbral}`}
      </span>
      {p.item_precio_original && <span className="text-xs text-neutral-400 line-through num">{simbolo}{usd(p.item_precio_original)}</span>}
    </span>
  )
}

interface Cuenta { id: number; nickname: string; estado: string; ultima_sync: string | null; ultimo_error: string | null }
interface Datos {
  preguntas: Pregunta[]; total: number; page: number; tam: number
  contadores: { pendientes: number; respondidas: number; cerradas_sin_respuesta: number }
  cuentas: Cuenta[]; configuracion: { ml: boolean; ia: boolean }
  plantillas: Plantilla[]
}
type Vista = 'pendientes' | 'respondidas' | 'cuentas'

function hace(fecha: string) {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} días`
}

const ESTADO_RESP: Record<string, { status: string; label: string }> = {
  ANSWERED: { status: 'FINALIZADA', label: 'Respondida' },
  CLOSED_UNANSWERED: { status: 'INCONSISTENTE', label: 'Cerrada sin respuesta' },
  BANNED: { status: 'INCONSISTENTE', label: 'Bloqueada por ML' },
  DELETED: { status: 'INACTIVO', label: 'Borrada' },
  DISABLED: { status: 'INACTIVO', label: 'Deshabilitada' },
  UNDER_REVIEW: { status: 'PAGO_VERIFICADO', label: 'En revisión de ML' },
}

export default function PreguntasClient({ isAdmin }: { isAdmin: boolean }) {
  // ?vista=cuentas (desde el aviso de "primer paso" de Automatizaciones) abre Cuentas y políticas.
  const pedida = useSearchParams().get('vista')
  const [vista, setVista] = useState<Vista>(isAdmin && pedida === 'cuentas' ? 'cuentas' : 'pendientes')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [datos, setDatos] = useState<Datos | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    const v = vista === 'respondidas' ? 'respondidas' : 'pendientes'
    const r = await fetch(`/api/preguntas?vista=${v}&page=${page}&q=${encodeURIComponent(q)}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setAviso({ tipo: 'error', texto: d.error ?? 'No se pudo cargar' }); return }
    setDatos(d)
  }, [vista, page, q])

  useEffect(() => { cargar() }, [cargar])
  // Refresco suave cada minuto (el cron trae lo nuevo de ML).
  useEffect(() => { const t = setInterval(cargar, 60_000); return () => clearInterval(t) }, [cargar])

  const sincronizar = async () => {
    setSincronizando(true)
    try {
      const r = await fetch('/api/preguntas/sincronizar', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setAviso({ tipo: 'error', texto: d.error ?? 'No se pudo actualizar' }); return }
      const errores = (d.resultado as { cuenta: string; error?: string }[]).filter(x => x.error)
      if (errores.length) setAviso({ tipo: 'error', texto: errores.map(e => `${e.cuenta}: ${e.error}`).join(' · ') })
      await cargar()
    } finally { setSincronizando(false) }
  }

  // Vuelta del OAuth de MercadoLibre (?conectada= / ?ml_error=)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const ok = p.get('conectada'), err = p.get('ml_error')
    if (ok || err) {
      setAviso(ok ? { tipo: 'ok', texto: `Cuenta ${ok} conectada. Trayendo sus preguntas…` } : { tipo: 'error', texto: err! })
      window.history.replaceState(null, '', '/preguntas')
      if (ok) { setVista('pendientes'); sincronizar() }
      else setVista('cuentas')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sinCuentas = datos && datos.cuentas.filter(c => c.estado === 'activa').length === 0
  const cont = datos?.contadores

  return (
    <div className="space-y-4">
      <PageHeader title="Preguntas" subtitle="Todas las preguntas de tus cuentas de MercadoLibre en una bandeja, con respuesta sugerida por IA"
        actions={<>
          <UsoIA />
          <button onClick={sincronizar} disabled={sincronizando || !!sinCuentas} className="btn-secondary text-sm">
            {sincronizando ? 'Actualizando…' : 'Actualizar ahora'}
          </button>
        </>} />

      {datos && (!datos.configuracion.ml || !datos.configuracion.ia) && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-lg text-sm">
          Falta configurar en el servidor:{' '}
          {[!datos.configuracion.ml && 'la app de MercadoLibre', !datos.configuracion.ia && 'la clave de la IA'].filter(Boolean).join(' y ')}.
        </div>
      )}
      {aviso && (
        <div className={`px-4 py-2.5 rounded-lg text-sm border flex items-start gap-3 ${aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <span className="flex-1">{aviso.texto}</span>
          <button onClick={() => setAviso(null)} className="opacity-60 hover:opacity-100" aria-label="Cerrar">✕</button>
        </div>
      )}

      <Tabs value={vista} onChange={v => { setVista(v); setPage(1) }} items={[
        { value: 'pendientes', label: 'Sin responder', count: cont?.pendientes },
        { value: 'respondidas', label: 'Historial', count: cont?.respondidas },
        ...(isAdmin ? [{ value: 'cuentas' as const, label: 'Cuentas y políticas' }] : []),
      ]} />

      {vista === 'cuentas' ? (
        datos ? (
          <div className="space-y-4">
            <Plantillas iniciales={datos.plantillas} onGuardado={cargar} />
            <CuentasYPoliticas cuentas={datos.cuentas} mlListo={datos.configuracion.ml} onCambio={cargar} />
          </div>
        ) : <Cargando />
      ) : !datos ? <Cargando /> : sinCuentas && datos.total === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
          <EmptyState message="Todavía no hay cuentas de MercadoLibre conectadas."
            cta={isAdmin
              ? <button onClick={() => setVista('cuentas')} className="btn-primary text-sm">Conectar una cuenta</button>
              : <span className="text-xs text-neutral-400">Pídele a un administrador que conecte las cuentas.</span>} />
        </div>
      ) : (
        <>
          {vista === 'respondidas' && (
            <input type="search" value={q} onChange={e => { setQ(e.target.value); setPage(1) }}
              placeholder="Buscar en preguntas, respuestas o publicaciones…"
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-full md:w-96" />
          )}
          {datos.preguntas.length === 0 ? (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
              <EmptyState message={vista === 'pendientes' ? 'No hay preguntas sin responder. Todo al día.' : 'Sin resultados.'} />
            </div>
          ) : vista === 'pendientes' ? (
            <div className="space-y-3">
              {datos.preguntas.map(p => (
                <TarjetaPendiente key={p.id} p={p} iaLista={datos.configuracion.ia} plantillas={datos.plantillas}
                  onRespondida={msg => { setAviso(msg); cargar() }} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100">
              {datos.preguntas.map(p => <FilaHistorial key={p.id} p={p} />)}
            </div>
          )}
          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            <Pagination total={datos.total} page={page} pageSize={datos.tam} onChange={setPage} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Pregunta sin responder ─────────────────────────────────────────────────
function TarjetaPendiente({ p, iaLista, plantillas, onRespondida }: {
  p: Pregunta; iaLista: boolean; plantillas: Plantilla[]; onRespondida: (a: { tipo: 'ok' | 'error'; texto: string }) => void
}) {
  const confirm = useConfirm()
  const [texto, setTexto] = useState(p.borrador ?? '')
  const [meta, setMeta] = useState({ confianza: p.borrador_confianza, falta: p.borrador_falta, web: p.borrador_web })
  const [pidiendo, setPidiendo] = useState<null | 'normal' | 'web'>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  useEffect(() => {
    let vivo = true
    fetch(`/api/preguntas/${p.id}/sugerencias`).then(r => r.ok ? r.json() : null).then(d => { if (vivo && d) setSugerencias(d.sugerencias) })
    return () => { vivo = false }
  }, [p.id])
  const problemas = texto.trim() ? problemasDelTexto(texto) : []
  const avisosTexto = texto.trim() ? revisarTexto(texto).avisos : []
  const pausada = p.item_estado && p.item_estado !== 'active'

  const proponer = async (web: boolean) => {
    setPidiendo(web ? 'web' : 'normal'); setError(null)
    try {
      const r = await fetch(`/api/preguntas/${p.id}/borrador`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ web }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'La IA no respondió'); return }
      setTexto(d.borrador.respuesta)
      setMeta({ confianza: d.borrador.confianza, falta: d.borrador.falta_dato, web: d.borrador.web })
      avisarUsoIA()
    } finally { setPidiendo(null) }
  }

  const enviar = async () => {
    const ok = await confirm({
      title: 'Publicar respuesta',
      message: `Se publicará en MercadoLibre (cuenta ${p.cuenta}) y la verá cualquier comprador:\n\n"${texto.trim()}"`,
      confirmText: 'Publicar',
    })
    if (!ok) return
    setEnviando(true); setError(null)
    try {
      const r = await fetch(`/api/preguntas/${p.id}/responder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError([d.error, ...(d.problemas ?? [])].filter(Boolean).join(' · ')); return }
      onRespondida(d.publicada
        ? { tipo: 'ok', texto: `Respuesta publicada en ${p.cuenta}.` }
        : { tipo: 'error', texto: d.aviso ?? 'MercadoLibre no confirmó la publicación' })
    } finally { setEnviando(false) }
  }

  const guardarNota = async () => {
    if (!nota?.trim()) return
    const r = await fetch('/api/preguntas/notas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: p.item_id, texto: nota }),
    })
    if (r.ok) { setNota(null) } else { setError('No se pudo guardar el dato') }
  }

  const tonoConfianza = meta.confianza === 'alta' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : meta.confianza === 'media' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-red-50 text-red-700 ring-red-200'

  return (
    <article className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        <span className="font-semibold text-neutral-700 bg-neutral-100 rounded-full px-2 py-0.5">{p.cuenta}</span>
        <Producto p={p} umbral={umbralDe(plantillas)} />
        {pausada && <span className="text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-full px-2 py-0.5">Publicación {p.item_estado === 'paused' ? 'pausada' : p.item_estado} · no sale en el panel de ML</span>}
        <span className="ml-auto whitespace-nowrap" title={new Date(p.fecha).toLocaleString('es-VE')}>{hace(p.fecha)}</span>
        {p.comprador_id && (
          <PreguntasPrevias n={p.previas} cargar={() =>
            fetch(`/api/preguntas/comprador?id=${p.comprador_id}&excluir=${p.id}`).then(r => (r.ok ? r.json() : []))} />
        )}
      </header>

      <p className="text-base text-neutral-900">{p.texto}</p>

      <div className="space-y-2">
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} maxLength={2000}
          placeholder="Escribe la respuesta o pídele una propuesta a la IA…"
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm resize-y" />
        {(meta.confianza || meta.falta || meta.web) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {meta.confianza && <span className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${tonoConfianza}`}>Confianza {meta.confianza}</span>}
            {meta.web && <span className="rounded-full px-2 py-0.5 ring-1 ring-inset bg-amber-50 text-amber-800 ring-amber-200">Con datos de internet: verificar antes de enviar</span>}
            {meta.falta && <span className="text-neutral-600">No encontré: <b>{meta.falta}</b></span>}
          </div>
        )}
        {problemas.length > 0 && <p className="text-xs text-red-600">MercadoLibre la rechazaría: {problemas.join(' · ')}</p>}
        {avisosTexto.length > 0 && <p className="text-xs text-amber-700">Ojo: {avisosTexto.join(' · ')}. Puedes publicar igual; al publicar se verifica si quedó.</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <Sugerencias lista={sugerencias} etiqueta="Parecidas:"
        onUsar={t => { setTexto(t); setMeta({ confianza: null, falta: null, web: false }) }} />

      {plantillas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-neutral-400 mr-1">Respuestas rápidas:</span>
          {plantillas.map((pl, i) => {
            const aplica = plantillaAplica(pl, precioUSD(p))
            const condicionada = pl.precio_desde != null || pl.precio_hasta != null
            return (
              <button key={i} type="button" onClick={() => { setTexto(pl.texto); setMeta({ confianza: null, falta: null, web: false }) }}
                title={`${pl.texto}\n\nPara ${condicionPlantilla(pl)}`}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  aplica && condicionada ? 'bg-lime-50 border-lime-300 text-lime-900 hover:bg-lime-100'
                  : aplica ? 'bg-white border-neutral-300 text-neutral-700 hover:border-neutral-500'
                  : 'bg-white border-neutral-200 text-neutral-400 hover:text-neutral-600'}`}>
                {aplica && condicionada && '✓ '}{pl.titulo}
              </button>
            )
          })}
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-2">
        <button onClick={() => proponer(false)} disabled={!iaLista || !!pidiendo} className="btn-secondary text-sm">
          {pidiendo === 'normal' ? 'Pensando…' : texto ? 'Proponer otra' : 'Proponer con IA'}
        </button>
        {meta.falta && (
          <button onClick={() => proponer(true)} disabled={!iaLista || !!pidiendo} className="btn-ghost text-sm"
            title="La IA busca datos técnicos del producto en internet">
            {pidiendo === 'web' ? 'Buscando…' : 'Buscar en internet'}
          </button>
        )}
        <button onClick={() => setNota(nota === null ? '' : null)} className="btn-ghost text-sm"
          title="Un dato de esta publicación que la IA debe saber la próxima vez">
          Anotar dato del producto
        </button>
        <button onClick={enviar} disabled={enviando || !texto.trim() || problemas.length > 0} className="btn-primary text-sm ml-auto">
          {enviando ? 'Publicando…' : 'Publicar respuesta'}
        </button>
      </footer>

      {nota !== null && (
        <div className="flex gap-2">
          <input value={nota} onChange={e => setNota(e.target.value)} maxLength={500} autoFocus
            placeholder="p. ej. Mide 30 × 20 cm y funciona con 110 V"
            className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          <button onClick={guardarNota} className="btn-secondary text-sm">Guardar dato</button>
        </div>
      )}
    </article>
  )
}

// ── Historial ──────────────────────────────────────────────────────────────
function FilaHistorial({ p }: { p: Pregunta }) {
  const e = ESTADO_RESP[p.estado] ?? { status: 'INACTIVO', label: p.estado }
  return (
    <div className="px-4 py-3 text-sm space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        <span className="font-semibold text-neutral-700">{p.cuenta}</span>
        <Producto p={p} />
        <span className="ml-auto whitespace-nowrap">{new Date(p.respuesta_fecha ?? p.fecha).toLocaleDateString('es-VE')}</span>
        <StatusBadge status={e.status} label={e.label} />
      </div>
      <p className="text-neutral-900">{p.texto}</p>
      {p.respuesta && (
        <p className="text-neutral-600 pl-3 border-l-2 border-neutral-200">
          {p.respuesta}
          <span className="text-xs text-neutral-400"> · {p.respondida_por ?? 'desde MercadoLibre'}</span>
        </p>
      )}
    </div>
  )
}

// ── Cuentas conectadas + políticas para la IA ──────────────────────────────
function CuentasYPoliticas({ cuentas, mlListo, onCambio }: { cuentas: Cuenta[]; mlListo: boolean; onCambio: () => void }) {
  const confirm = useConfirm()
  const [politicas, setPoliticas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(s => setPoliticas(s.preguntas_politicas ?? '')).catch(() => {})
  }, [])

  const guardar = async () => {
    setGuardando(true); setOk(false)
    const r = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preguntas_politicas: politicas }),
    })
    setGuardando(false); setOk(r.ok)
  }

  const desconectar = async (c: Cuenta) => {
    if (!await confirm({ title: `Desconectar ${c.nickname}`, message: 'Se dejan de traer sus preguntas y no se podrá responder desde aquí. Lo ya guardado se conserva.', confirmText: 'Desconectar', danger: true })) return
    await fetch(`/api/ml/conexiones/${c.id}`, { method: 'DELETE' })
    onCambio()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-neutral-900">Cuentas de MercadoLibre</h2>
          {mlListo
            ? <a href="/api/ml/conectar" className="btn-primary text-sm">Conectar cuenta</a>
            : <span className="text-xs text-amber-700">Falta configurar la app de ML</span>}
        </div>
        <p className="text-xs text-neutral-500">
          Te lleva a MercadoLibre para autorizar. Entra con la cuenta PRINCIPAL del vendedor (un colaborador no puede autorizar).
        </p>
        {cuentas.length === 0 ? <p className="text-sm text-neutral-400">Ninguna conectada todavía.</p> : (
          <ul className="divide-y divide-neutral-100">
            {cuentas.map(c => (
              <li key={c.id} className="py-2.5 flex items-center gap-3 text-sm">
                <StatusBadge status={c.estado === 'activa' ? (c.ultimo_error ? 'PARCIAL' : 'OK') : 'INCONSISTENTE'}
                  label={c.estado === 'activa' ? (c.ultimo_error ? 'Con error' : 'Conectada') : 'Desconectada'} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-neutral-900">{c.nickname}</p>
                  <p className="text-xs text-neutral-500 truncate">
                    {c.ultimo_error ?? (c.ultima_sync ? `Actualizada ${hace(c.ultima_sync)}` : 'Sin actualizar todavía')}
                  </p>
                </div>
                {c.estado === 'activa'
                  ? <button onClick={() => desconectar(c)} className="btn-ghost text-xs text-red-600">Desconectar</button>
                  : mlListo && <a href="/api/ml/conectar" className="btn-secondary text-xs px-2.5 py-1">Reconectar</a>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
        <h2 className="font-semibold text-neutral-900">Políticas para la IA</h2>
        <p className="text-xs text-neutral-500">
          Lo que la IA debe saber de tu negocio. Escríbelo como se lo explicarías a un empleado nuevo. La IA no inventa nada fuera de esto.
        </p>
        <textarea value={politicas} onChange={e => { setPoliticas(e.target.value); setOk(false) }} rows={12}
          placeholder={'Ej.:\n- Pagos: pago móvil y transferencia (Banesco, Mercantil, Venezuela) a tasa BCV del día.\n- Envíos: por Zoom o Tealca, cobro a destino; salen de lunes a viernes.\n- Entregas en Caracas: …\n- Factura: sí emitimos, pedir datos por la mensajería de la venta.\n- Horario: lunes a sábado de 9 a 6.'}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono resize-y" />
        <div className="flex items-center justify-end gap-3">
          {ok && <span className="text-xs text-emerald-700">Guardado</span>}
          <button onClick={guardar} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Guardando…' : 'Guardar políticas'}</button>
        </div>
      </section>
    </div>
  )
}

// ── Respuestas rápidas (editor) ────────────────────────────────────────────
function Plantillas({ iniciales, onGuardado }: { iniciales: Plantilla[]; onGuardado: () => void }) {
  const [lista, setLista] = useState<Plantilla[]>(iniciales)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const num = (v: string) => v.trim() === '' ? null : Number(v.replace(',', '.'))
  const cambiar = (i: number, c: Partial<Plantilla>) => { setLista(l => l.map((p, j) => j === i ? { ...p, ...c } : p)); setMsg(null) }

  const guardar = async () => {
    const limpias = lista.map(p => ({ ...p, titulo: p.titulo.trim(), texto: p.texto.trim() })).filter(p => p.titulo && p.texto)
    const malas = limpias.filter(p => problemasDelTexto(p.texto).length)
    if (malas.length) { setMsg({ ok: false, t: `"${malas[0].titulo}": ${problemasDelTexto(malas[0].texto).join(', ')}` }); return }
    setGuardando(true)
    const r = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preguntas_plantillas: JSON.stringify(limpias) }),
    })
    setGuardando(false)
    if (!r.ok) { setMsg({ ok: false, t: 'No se pudo guardar' }); return }
    setLista(limpias); setMsg({ ok: true, t: 'Guardadas' }); onGuardado()
  }

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-neutral-900">Respuestas rápidas</h2>
          <p className="text-xs text-neutral-500">Salen como botones en cada pregunta (un clic y la puedes retocar). La IA también las usa. Con precio, se marca en verde la que corresponde al producto.</p>
        </div>
        <button onClick={() => setLista(l => [...l, { titulo: '', texto: '', precio_desde: null, precio_hasta: null }])}
          className="btn-secondary text-sm whitespace-nowrap">+ Agregar</button>
      </div>
      {lista.length === 0 && <p className="text-sm text-neutral-400">Todavía no hay respuestas rápidas.</p>}
      <div className="space-y-3">
        {lista.map((p, i) => (
          <div key={i} className="border border-neutral-200 rounded-lg p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input value={p.titulo} onChange={e => cambiar(i, { titulo: e.target.value })} placeholder="Nombre corto (ej. Disponible + envío gratis)"
                className="flex-1 min-w-[14rem] border border-neutral-300 rounded-lg px-3 py-1.5 text-sm font-medium" />
              <label className="text-xs text-neutral-500 flex items-center gap-1">desde $
                <input value={p.precio_desde ?? ''} onChange={e => cambiar(i, { precio_desde: num(e.target.value) })} inputMode="decimal"
                  className="w-16 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" placeholder="—" />
              </label>
              <label className="text-xs text-neutral-500 flex items-center gap-1">menos de $
                <input value={p.precio_hasta ?? ''} onChange={e => cambiar(i, { precio_hasta: num(e.target.value) })} inputMode="decimal"
                  className="w-16 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" placeholder="—" />
              </label>
              <button onClick={() => setLista(l => l.filter((_, j) => j !== i))} className="btn-ghost text-xs text-red-600">Quitar</button>
            </div>
            <textarea value={p.texto} onChange={e => cambiar(i, { texto: e.target.value })} rows={2} maxLength={2000}
              placeholder="Texto de la respuesta" className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm resize-y" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-3">
        {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.t}</span>}
        <button onClick={guardar} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Guardando…' : 'Guardar respuestas rápidas'}</button>
      </div>
    </section>
  )
}
