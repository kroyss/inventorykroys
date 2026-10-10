'use client'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader, EmptyState } from '@/components/ui'
import type { PagoME } from '@/lib/pagosMEComun'
import { Monto, VERIF, bs, metodoPago } from './PagoME'

type Filtro = 'pendiente' | 'valido' | 'invalido' | 'todos'
interface Resultado { ok: boolean; cuenta: string | null; vistas: number; nuevas: number; error: string | null; at: string }
interface Datos {
  pagos: PagoME[]
  conteo: Partial<Record<'pendiente' | 'valido' | 'invalido', number>>
  vigilante: {
    clave: boolean
    latidos: { perfil: string; visto_at: string; conectado: boolean }[]
    pedido: { id: number; pedido_at: string; vigente: boolean; resultados: Record<string, Resultado> } | null
  }
}

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
              <span className="text-neutral-400">abre Chrome solo al traer: {perfiles.map(l => l.perfil).join(' · ')}</span>
            )}
          </> : <>
          {perfiles.length === 0 && <span className="text-amber-700">ningún perfil se ha conectado todavía</span>}
          {perfiles.map(l => (
            <span key={l.perfil} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${l.conectado ? 'bg-green-500' : 'bg-red-400'}`} />
              {l.perfil} <span className="text-neutral-400">{l.conectado ? 'conectado' : `sin señal desde ${hora(l.visto_at)}`}</span>
            </span>
          ))}
          </>}
          {isAdmin && (
            <button onClick={generarClave} className="ml-auto underline text-neutral-500 hover:text-neutral-800">
              {datos?.vigilante.clave ? 'Generar clave nueva' : 'Generar clave del vigilante'}
            </button>
          )}
        </div>
        {pedido && (
          <div className="text-neutral-500">
            Último pedido {hora(pedido.pedido_at)}:{' '}
            {Object.keys(pedido.resultados).length === 0 && (pedido.vigente ? 'esperando al vigilante…' : 'nadie lo tomó (¿PC apagada?)')}
            {Object.entries(pedido.resultados).map(([perfil, r]) => (
              <span key={perfil} className="mr-3">
                <b>{perfil}</b>{' '}
                {r.ok ? `${r.vistas} órdenes pagadas vistas · ${r.nuevas} nuevas` : <span className="text-red-700">{ERROR_PERFIL[r.error ?? ''] ?? r.error ?? 'error'}</span>}
              </span>
            ))}
          </div>
        )}
        {clave && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-900">
            Clave del vigilante (se muestra solo esta vez; cópiala en la extensión de cada perfil):
            <code className="ml-2 select-all font-mono bg-white px-1.5 py-0.5 rounded border">{clave}</code>
            <button onClick={() => navigator.clipboard.writeText(clave)} className="ml-2 underline">Copiar</button>
          </div>
        )}
      </div>

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
                      {p.sale_status ? <div>{p.sale_status}</div> : <div className="text-neutral-400">no registrada</div>}
                      {p.en_despachos && <div className="text-neutral-500">en Despachos</div>}
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
