'use client'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { PageHeader, EmptyState } from '@/components/ui'
import { DIAS_SEMANA, proximoAuto, type HorarioME, type PagoME } from '@/lib/pagosMEComun'
import { Monto, VERIF, bs, metodoPago } from './PagoME'

type Filtro = 'pendiente' | 'valido' | 'invalido' | 'todos'
interface Resultado { ok: boolean; cuenta: string | null; vistas: number; nuevas: number; error: string | null; at: string }
interface Datos {
  pagos: PagoME[]
  conteo: Partial<Record<'pendiente' | 'valido' | 'invalido', number>>
  vigilante: {
    clave: boolean
    latidos: { perfil: string; cuenta: string | null; visto_at: string; conectado: boolean }[]
    pedido: { id: number; pedido_at: string; vigente: boolean; automatico: boolean; resultados: Record<string, Resultado> } | null
  }
  horario: HorarioME
  ahora: { dia: number; hm: string }
  /** Sin ventas cargadas: las guías van solas a Despachos con las ventas de MercadoLibre. */
  desdeML: boolean
}

/** Programa para la PC (tools/vigilante-pagos-me/instalador → public/descargas). */
const DESCARGA_PROGRAMA = '/descargas/InstalarPagosME.exe'

const hora = (s: string | null) => s ? new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}) : '—'
const FILTROS: { k: Filtro; t: string }[] = [
  { k: 'pendiente', t: 'Sin verificar' }, { k: 'valido', t: 'Verificados' },
  { k: 'invalido', t: 'Inválidos' }, { k: 'todos', t: 'Todos' },
]
const ERROR_PERFIL: Record<string, string> = {
  sin_sesion: 'no tiene la sesión de MercadoEnvíos iniciada: en la PC quedó abierta esa ventana; inicia sesión ahí y vuelve a traer',
}

export default function PagosMEClient({ isAdmin }: { isAdmin: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>('pendiente')
  const [datos, setDatos] = useState<Datos | null>(null)
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ver, setVer] = useState<PagoME | null>(null)
  const [clave, setClave] = useState<string | null>(null)
  const [codigo, setCodigo] = useState<{ codigo: string; vence_at: string } | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/pagos-me?estado=${filtro}`)
    if (r.ok) setDatos(await r.json())
  }, [filtro])
  useEffect(() => {
    let vivo = true
    fetch(`/api/pagos-me?estado=${filtro}`).then(r => (r.ok ? r.json() : null)).then(d => { if (vivo && d) setDatos(d) }).catch(() => {})
    return () => { vivo = false }
  }, [filtro])

  // Mientras el vigilante trabaja (pedido vigente sin el resultado de todos los perfiles), se refresca solo.
  const pedido = datos?.vigilante.pedido
  // Con despertador (despertador.ps1) Chrome está cerrado: la señal es la de la PC, y los perfiles
  // solo se abren al traer. Sin despertador, cada perfil (Chrome abierto) manda su propia señal.
  const despertador = datos?.vigilante.latidos.find(l => l.perfil === 'DESPERTADOR')
  const perfiles = (datos?.vigilante.latidos ?? []).filter(l => l.perfil !== 'DESPERTADOR')
  const trabajando = !!pedido?.vigente && (despertador
    ? despertador.conectado && perfiles.some(l => !pedido.resultados[l.perfil])
    : perfiles.filter(l => l.conectado).some(l => !pedido.resultados[l.perfil]))
  useEffect(() => {
    if (!trabajando) return
    const t = setInterval(cargar, 8000)
    return () => clearInterval(t)
  }, [trabajando, cargar])

  const traer = async () => {
    setBusy('traer'); setError(null); setAviso(null)
    const r = await fetch('/api/pagos-me/traer', { method: 'POST' })
    setBusy(null)
    if (!r.ok) { setError('No se pudo pedir'); return }
    setAviso('Pedido enviado: el vigilante lo toma en menos de 1 minuto. Esta pantalla se actualiza sola.')
    cargar()
  }

  const marcar = async (verificacion: 'valido' | 'invalido' | 'pendiente', ids = [...marcados]) => {
    if (ids.length === 0) return
    setBusy(verificacion); setError(null); setAviso(null)
    const r = await fetch('/api/pagos-me/verificar', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, verificacion }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    setAviso(verificacion === 'valido'
      ? `${d.marcados} pago(s) verificados${d.ventas_verificadas ? ` · ${d.ventas_verificadas} venta(s) pasaron a Pago verificado` : ''}.`
      : verificacion === 'invalido' ? `${d.marcados} pago(s) marcados inválidos.` : `${d.marcados} pago(s) volvieron a Sin verificar.`)
    setMarcados(new Set())
    cargar()
  }

  const generarClave = async () => {
    if (datos?.vigilante.clave && !confirm('Se genera una clave nueva y la anterior deja de funcionar. ¿Seguir?')) return
    const r = await fetch('/api/pagos-me/clave', { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    if (r.ok) { setClave(d.clave); cargar() } else setError(d.error ?? 'Error')
  }

  const conectar = async () => {
    setError(null)
    const r = await fetch('/api/pagos-me/conexion', { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    if (r.ok) setCodigo(d); else setError(d.error ?? 'Error')
  }
  const desconectar = async () => {
    if (!confirm('Se desconectan TODAS las PCs: dejan de traer pagos hasta que las conectes de nuevo con un código. ¿Seguir?')) return
    const r = await fetch('/api/pagos-me/conexion', { method: 'DELETE' })
    if (r.ok) { setAviso('PCs desconectadas.'); setCodigo(null); cargar() } else setError('No se pudo desconectar')
  }
  // Nombre a mostrar de cada perfil: la cuenta de MercadoEnvíos (si ya la dijo) o el nombre técnico.
  const nombre = (perfil: string) => datos?.vigilante.latidos.find(l => l.perfil === perfil)?.cuenta ?? perfil
  const sinConectar = !!datos && !datos.vigilante.clave && datos.vigilante.latidos.length === 0

  const pagos = datos?.pagos ?? []
  const todos = pagos.length > 0 && pagos.every(p => marcados.has(p.id))
  const toggle = (id: number) => setMarcados(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="space-y-4">
      <PageHeader title="Pagos MercadoEnvíos" subtitle="Pagos y guías traídos del portal: verifícalos de corrido contra el banco"
        actions={
          <button onClick={traer} disabled={busy === 'traer' || trabajando} className="btn-primary text-sm whitespace-nowrap">
            {trabajando ? 'Trayendo…' : 'Traer pagos y guías'}
          </button>
        } />

      {sinConectar && <PrimerosPasos isAdmin={isAdmin} onConectar={conectar} />}

      {/* Vigilante */}
      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-600 space-y-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-medium text-neutral-800">Vigilante:</span>
          {despertador ? <>
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${despertador.conectado ? 'bg-green-500' : 'bg-red-400'}`} />
              {despertador.conectado ? 'PC en espera' : `PC sin señal desde ${hora(despertador.visto_at)} (¿apagada?)`}
            </span>
            {perfiles.length > 0 && (
              <span className="text-neutral-400">abre Chrome solo al traer: {perfiles.map(l => l.cuenta ?? l.perfil).join(' · ')}</span>
            )}
          </> : <>
          {perfiles.length === 0 && <span className="text-amber-700">ningún perfil se ha conectado todavía</span>}
          {perfiles.map(l => (
            <span key={l.perfil} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${l.conectado ? 'bg-green-500' : 'bg-red-400'}`} />
              {l.cuenta ?? l.perfil} <span className="text-neutral-400">{l.conectado ? 'conectado' : `sin señal desde ${hora(l.visto_at)}`}</span>
            </span>
          ))}
          </>}
          {isAdmin && (
            <span className="ml-auto flex flex-wrap items-center gap-3">
              <a href={DESCARGA_PROGRAMA} className="underline text-neutral-500 hover:text-neutral-800">Descargar programa</a>
              <button onClick={conectar} className="underline text-neutral-500 hover:text-neutral-800">Conectar una PC</button>
              {!datos?.desdeML && (
                <button onClick={generarClave} className="underline text-neutral-400 hover:text-neutral-800" title="Para la instalación a mano (avanzado)">
                  {datos?.vigilante.clave ? 'Clave larga' : 'Generar clave'}
                </button>
              )}
              {datos?.vigilante.clave && (
                <button onClick={desconectar} className="underline text-neutral-400 hover:text-red-700">Desconectar PCs</button>
              )}
            </span>
          )}
        </div>
        {codigo && <CodigoConexion codigo={codigo.codigo} vence={codigo.vence_at} onCerrar={() => setCodigo(null)} />}
        {clave && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-900">
            Clave del vigilante (se muestra solo esta vez; cópiala en la extensión de cada perfil):
            <code className="ml-2 select-all font-mono bg-white px-1.5 py-0.5 rounded border">{clave}</code>
            <button onClick={() => navigator.clipboard.writeText(clave)} className="ml-2 underline">Copiar</button>
          </div>
        )}
      </div>

      {pedido && <EstadoTraida pedido={pedido} perfiles={perfiles.map(l => l.perfil)} nombre={nombre} trabajando={trabajando} desdeML={!!datos?.desdeML} />}

      {datos && <TraerAutomatico horario={datos.horario} ahora={datos.ahora} isAdmin={isAdmin} onGuardado={cargar} />}

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      {aviso && <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">{aviso}</div>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map(f => (
            <button key={f.k} onClick={() => { setFiltro(f.k); setMarcados(new Set()) }}
              className={`px-3 py-1 rounded-full text-sm border ${filtro === f.k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-700'}`}>
              {f.t}{f.k !== 'todos' && datos?.conteo[f.k] ? <span className="ml-1 opacity-60">{datos.conteo[f.k]}</span> : null}
            </button>
          ))}
        </div>
        {marcados.size > 0 && (
          <div className="flex flex-wrap gap-2">
            {filtro !== 'valido' && (
              <button onClick={() => marcar('valido')} disabled={!!busy} className="btn-primary text-sm">✓ Verificar ({marcados.size})</button>
            )}
            {filtro !== 'invalido' && (
              <button onClick={() => marcar('invalido')} disabled={!!busy} className="btn-secondary text-sm text-red-700">✗ Inválido</button>
            )}
            {filtro !== 'pendiente' && (
              <button onClick={() => marcar('pendiente')} disabled={!!busy} className="btn-secondary text-sm">Volver a sin verificar</button>
            )}
          </div>
        )}
      </div>

      {datos && pagos.length === 0 ? (
        <EmptyState message={filtro === 'pendiente'
          ? 'No hay pagos por verificar. Toca "Traer pagos y guías" para buscar los nuevos en MercadoEnvíos.'
          : 'Sin pagos'} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" checked={todos} onChange={() => setMarcados(todos ? new Set() : new Set(pagos.map(p => p.id)))} />
                </th>
                <th className="px-3 py-2 text-left">Venta</th>
                <th className="px-3 py-2 text-left">Pago</th>
                <th className="px-3 py-2 text-left">Referencia</th>
                <th className="px-3 py-2 text-right">Pagado</th>
                <th className="px-3 py-2 text-left">vs. orden</th>
                <th className="px-3 py-2 text-left">Envío</th>
                <th className="px-3 py-2 text-left">En el sistema</th>
                <th className="px-3 py-2 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map(p => {
                const v = VERIF[p.verificacion]
                const especial = p.envio_metodo && !/gratis/i.test(p.envio_metodo)
                return (
                  <tr key={p.id} onClick={() => toggle(p.id)}
                    className={`border-t border-neutral-100 align-top cursor-pointer ${marcados.has(p.id) ? 'bg-emerald-50/70' : 'hover:bg-neutral-50'}`}>
                    <td className="px-3 py-2 text-center"><input type="checkbox" checked={marcados.has(p.id)} readOnly /></td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs">{p.venta}</div>
                      <div className="text-[11px] text-neutral-400">{p.cuenta ?? ''} · {hora(p.fecha_orden)}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{metodoPago(p.metodo_pago)}</div>
                      <div className="text-neutral-500">{p.banco_emisor ?? '?'} → {p.banco_receptor ?? '?'}</div>
                      {p.fecha_pago && <div className="text-neutral-400">{p.fecha_pago}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{p.referencia ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{bs(p.monto_pagado)}</td>
                    <td className="px-3 py-2"><Monto p={p} /></td>
                    <td className="px-3 py-2 text-xs">
                      <div className={especial ? 'text-amber-700 font-medium' : ''}>{p.envio_metodo ?? '—'}</div>
                      <div className="text-neutral-500">{[p.envio_opcion, p.carrier].filter(Boolean).join(' · ')}</div>
                      {!p.tiene_guia && <div className="text-neutral-400">sin guía</div>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {datos?.desdeML ? <>
                        {p.ml_estado === 'cancelled' && <div className="text-red-700 font-medium">cancelada en ML</div>}
                        {p.en_despachos ? <div className="text-neutral-700">en Despachos</div>
                          : <div className="text-neutral-400">{p.tiene_guia ? 'todavía no en Despachos' : 'sin guía todavía'}</div>}
                      </> : <>
                        {p.sale_status ? <div>{p.sale_status}</div> : <div className="text-neutral-400">no registrada</div>}
                        {p.en_despachos && <div className="text-neutral-500">en Despachos</div>}
                      </>}
                    </td>
                    <td className="px-3 py-2 text-xs" onClick={e => e.stopPropagation()}>
                      <span className={`inline-block px-2 py-0.5 rounded-full ${v.c}`}>{v.t}</span>
                      {p.verificado_por && <div className="text-neutral-400 mt-0.5">{p.verificado_por}</div>}
                      {p.tiene_comprobante && (
                        <button onClick={() => setVer(p)} className="mt-1 block underline text-sky-700">🖼 Comprobante</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Comprobante en grande */}
      {ver && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setVer(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-auto p-3 space-y-2" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono">{ver.venta}</span>
              <button onClick={() => setVer(null)} className="text-neutral-500">Cerrar ✕</button>
            </div>
            <div className="text-xs text-neutral-600">
              {metodoPago(ver.metodo_pago)} · {ver.banco_emisor ?? '?'} → {ver.banco_receptor ?? '?'} · Ref {ver.referencia ?? '—'} · <b>{bs(ver.monto_pagado)}</b> · <Monto p={ver} />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/pagos-me/${ver.id}/archivo?tipo=comprobante`} alt="Comprobante de pago" className="w-full rounded border" />
            {ver.verificacion !== 'valido' && (
              <div className="flex gap-2">
                <button onClick={() => { marcar('valido', [ver.id]); setVer(null) }} className="btn-primary text-sm flex-1">✓ Verificar</button>
                <button onClick={() => { marcar('invalido', [ver.id]); setVer(null) }} className="btn-secondary text-sm text-red-700">✗ Inválido</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Pagos ME → Configuración: a qué horas y qué días el despertador trae solo (además del botón). */
/** Cómo terminó la última traída, bien a la vista: trayendo / listo (ya puede despachar) / con problemas. */
function EstadoTraida({ pedido, perfiles, nombre, trabajando, desdeML }: {
  pedido: NonNullable<Datos['vigilante']['pedido']>; perfiles: string[]; nombre: (perfil: string) => string
  trabajando: boolean; desdeML: boolean
}) {
  const res = Object.entries(pedido.resultados)
  const faltan = perfiles.filter(p => !pedido.resultados[p])
  const fallas = res.filter(([, r]) => !r.ok)
  const nuevas = res.reduce((s, [, r]) => s + (r.ok ? r.nuevas : 0), 0)
  const dia = (s: string) => new Date(s).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' })
  const cuando = `${dia(pedido.pedido_at) === dia(new Date().toISOString()) ? 'hoy' : dia(pedido.pedido_at)} ${
    new Date(pedido.pedido_at).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit' })}`
  const detalle = res.map(([perfil, r]) => (
    <span key={perfil} className="mr-3 whitespace-nowrap">
      <b>{r.cuenta ?? nombre(perfil)}</b>{' '}
      {r.ok ? `${r.nuevas} nuevas (${r.vistas} revisadas)` : <span className="text-red-700">{ERROR_PERFIL[r.error ?? ''] ?? r.error ?? 'error'}</span>}
    </span>
  ))
  const caja = (c: string, titulo: ReactNode, cuerpo?: ReactNode) => (
    <div className={`rounded-xl border px-4 py-3 text-sm space-y-1 ${c}`}>
      <div className="font-medium">{titulo}</div>
      {cuerpo && <div className="text-xs opacity-90">{cuerpo}</div>}
    </div>
  )
  const origen = pedido.automatico ? 'automática' : 'pedida a mano'

  if (trabajando) return caja('bg-sky-50 border-sky-200 text-sky-900',
    <>⏳ Trayendo pagos y guías ({origen}, {cuando})… no apagues la PC.</>,
    <>{detalle}{faltan.map(p => <span key={p} className="mr-3 whitespace-nowrap"><b>{nombre(p)}</b> trabajando…</span>)}</>)
  if (res.length === 0) return caja('bg-amber-50 border-amber-200 text-amber-900',
    <>⚠️ La traída {origen} de {cuando} no se hizo: la PC no respondió (¿apagada o sin luz?).</>,
    'No se pierde nada: cuando la prendas, dale a "Traer pagos y guías" y trae todo lo que faltaba.')
  if (fallas.length || faltan.length) return caja('bg-red-50 border-red-200 text-red-900',
    <>❌ La traída de {cuando} quedó incompleta: revisa antes de despachar.</>,
    <>{detalle}{faltan.map(p => <span key={p} className="mr-3 whitespace-nowrap"><b>{nombre(p)}</b> no respondió</span>)}</>)
  return caja('bg-green-50 border-green-200 text-green-900',
    <>✅ Listo: traída {origen} de {cuando} completa · {nuevas === 0 ? 'no había pagos nuevos' : `${nuevas} pago${nuevas === 1 ? '' : 's'} nuevo${nuevas === 1 ? '' : 's'}`}.{desdeML ? ' Las guías ya están en Despachos: verifica los pagos y despacha.' : ' Ya está todo al día: puedes cargar las ventas y despachar.'}</>,
    detalle)
}

function TraerAutomatico({ horario, ahora, isAdmin, onGuardado }: {
  horario: HorarioME; ahora: { dia: number; hm: string }; isAdmin: boolean; onGuardado: () => void
}) {
  const [editando, setEditando] = useState<HorarioME | null>(null)
  const [nueva, setNueva] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prox = proximoAuto(horario, ahora.dia, ahora.hm)
  const dias = (d: number[]) => d.length === 7 ? 'todos los días'
    : d.length === 6 && !d.includes(7) ? 'lun a sáb'
    : d.length === 5 && !d.includes(6) && !d.includes(7) ? 'lun a vie'
    : d.map(x => DIAS_SEMANA[x - 1]).join(', ')
  const h12 = (hm: string) => { const [h, m] = hm.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}` }

  const guardar = async () => {
    if (!editando) return
    setGuardando(true); setError(null)
    const r = await fetch('/api/pagos-me/horario', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editando) })
    const d = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo guardar'); return }
    setEditando(null); onGuardado()
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-600 space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-neutral-800">Traer automático:</span>
        {horario.activo && horario.horas.length && horario.dias.length ? <>
          <span>{horario.horas.map(h12).join(' · ')} · {dias(horario.dias)}</span>
          {prox && <span className="text-neutral-400">próximo: {prox.hoy ? 'hoy' : DIAS_SEMANA[prox.dia - 1]} {h12(prox.hora)}</span>}
        </> : <span className="text-amber-700">apagado (solo con el botón)</span>}
        {isAdmin && !editando && (
          <button onClick={() => { setEditando({ ...horario, activo: horario.activo }); setError(null) }} className="ml-auto underline text-neutral-500 hover:text-neutral-800">Configurar</button>
        )}
      </div>

      {editando && (
        <div className="border-t border-neutral-100 pt-3 space-y-3">
          <label className="flex items-center gap-2 text-sm text-neutral-800">
            <input type="checkbox" checked={editando.activo} onChange={e => setEditando({ ...editando, activo: e.target.checked })} />
            Traer solo a estas horas (hora de Venezuela; la PC tiene que estar prendida)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-neutral-500 w-12">Horas</span>
            {editando.horas.map(h => (
              <span key={h} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-sm text-neutral-800">
                {h12(h)}
                <button onClick={() => setEditando({ ...editando, horas: editando.horas.filter(x => x !== h) })}
                  className="text-neutral-400 hover:text-red-600" aria-label={`Quitar ${h}`}>✕</button>
              </span>
            ))}
            <input type="time" value={nueva} onChange={e => setNueva(e.target.value)} className="border border-neutral-300 rounded-lg px-2 py-1 text-sm" />
            <button disabled={!nueva || editando.horas.includes(nueva)}
              onClick={() => { setEditando({ ...editando, horas: [...editando.horas, nueva].sort() }); setNueva('') }}
              className="btn-ghost text-xs px-2 py-1 disabled:opacity-40">+ Agregar hora</button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-neutral-500 w-12">Días</span>
            {DIAS_SEMANA.map((n, i) => {
              const d = i + 1, on = editando.dias.includes(d)
              return (
                <button key={d} onClick={() => setEditando({ ...editando, dias: on ? editando.dias.filter(x => x !== d) : [...editando.dias, d].sort() })}
                  className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-500'}`}>{n}</button>
              )
            })}
          </div>
          <p className="text-neutral-400">Si a esa hora la PC estaba apagada, trae apenas prende. Si alguien trajo con el botón poco antes, no se repite.</p>
          <div className="flex items-center gap-2">
            {error && <span className="text-red-600">{error}</span>}
            <button onClick={() => setEditando(null)} className="ml-auto btn-ghost text-xs px-2.5 py-1">Cancelar</button>
            <button onClick={guardar} disabled={guardando} className="btn-primary text-xs px-3 py-1">{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Primera vez: qué es y cómo se conecta, en tres pasos. */
function PrimerosPasos({ isAdmin, onConectar }: { isAdmin: boolean; onConectar: () => void }) {
  const paso = 'flex gap-3 items-start'
  const num = 'shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center'
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4 space-y-3 text-sm text-neutral-700">
      <div>
        <p className="font-semibold text-neutral-900">Tus pagos y guías de MercadoEnvíos, solos</p>
        <p className="text-xs text-neutral-500 mt-0.5">
          Un programa en tu PC lee el portal de MercadoEnvíos con <b>tu</b> sesión y trae los pagos con su comprobante y las
          guías. Tu contraseña nunca sale de tu PC. Si se va la luz no se pierde nada: al prenderla trae lo que faltaba.
        </p>
      </div>
      {isAdmin ? (
        <ol className="space-y-2">
          <li className={paso}><span className={num}>1</span>
            <span><a href={DESCARGA_PROGRAMA} className="font-medium text-emerald-700 underline">Descarga el programa</a> en la PC donde imprimes las guías e instálalo (Siguiente → Instalar).</span></li>
          <li className={paso}><span className={num}>2</span>
            <span><button onClick={onConectar} className="font-medium text-emerald-700 underline">Genera tu código</button> y escríbelo cuando el programa lo pida, y en la extensión de Chrome de cada cuenta.</span></li>
          <li className={paso}><span className={num}>3</span>
            <span>Listo: toca <b>Traer pagos y guías</b> y espera el aviso verde.</span></li>
        </ol>
      ) : (
        <p className="text-xs">Pídele a un administrador de tu empresa que conecte la PC.</p>
      )}
    </div>
  )
}

/** El código para conectar la PC: grande, para copiarlo o dictarlo. */
function CodigoConexion({ codigo, vence, onCerrar }: { codigo: string; vence: string; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const hasta = new Date(vence).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit' })
  return (
    <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-900 flex flex-wrap items-center gap-3">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-emerald-700">Código de conexión</div>
        <code className="select-all font-mono text-2xl font-semibold tracking-widest">{codigo}</code>
      </div>
      <button onClick={() => { navigator.clipboard.writeText(codigo); setCopiado(true) }} className="btn-secondary text-xs">
        {copiado ? 'Copiado ✓' : 'Copiar'}
      </button>
      <p className="text-xs text-emerald-800 flex-1 min-w-[200px]">
        Escríbelo en el programa al instalarlo y en la extensión de cada cuenta de Chrome. Vale hasta las {hasta}.
        Las PCs que ya estaban conectadas siguen funcionando.
      </p>
      <button onClick={onCerrar} className="text-emerald-700 text-xs">Cerrar ✕</button>
    </div>
  )
}
