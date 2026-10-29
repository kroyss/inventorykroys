'use client'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { PageHeader, EmptyState } from '@/components/ui'
import { type PagoME } from '@/lib/pagosMEComun'
import { Monto, VERIF, bs, metodoPago } from './PagoME'
import PorConfirmar, { usePorConfirmar } from '@/components/ventas/PorConfirmar'

type Filtro = 'pendiente' | 'valido' | 'invalido' | 'todos'
interface Resultado { ok: boolean; cuenta: string | null; vistas: number; nuevas: number; error: string | null; at: string }
interface Datos {
  pagos: PagoME[]
  conteo: Partial<Record<'pendiente' | 'valido' | 'invalido', number>>
  vigilante: {
    clave: boolean
    latidos: { perfil: string; cuenta: string | null; cuenta_portal?: string | null; verificacion?: string | null; visto_at: string; conectado: boolean }[]
    pedido: { id: number; pedido_at: string; vigente: boolean; automatico: boolean; resultados: Record<string, Resultado> } | null
  }
  /** Sin ventas cargadas: las guías van solas a Despachos con las ventas de MercadoLibre. */
  desdeML: boolean
  /** Cuentas de ML (VE) y si ya tienen su Chrome trayendo (29-10). */
  cuentasML?: { nickname: string; estado: string; con_navegador: boolean }[]
}

/** Programa para la PC (tools/vigilante-pagos-me/instalador → public/descargas). */
// Con la versión en el enlace (23-10): Cloudflare guarda los .exe hasta 4 h; así cada versión nueva se baja al momento.
const DESCARGA_PROGRAMA = '/descargas/InstalarPagosME.exe?v=1.3.7'

const hora = (s: string | null) => s ? new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}) : '—'
const FILTROS: { k: Filtro; t: string }[] = [
  { k: 'pendiente', t: 'Sin verificar' }, { k: 'valido', t: 'Verificados' },
  { k: 'invalido', t: 'Inválidos' }, { k: 'todos', t: 'Todos' },
]
const ERROR_PERFIL: Record<string, string> = {
  cuenta_no_conectada: 'tiene abierta en Chrome una cuenta de MercadoEnvíos que NO es de ninguna cuenta de MercadoLibre conectada: no se trajo nada. Entra al portal con la cuenta correcta',
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
  // "+ Agregar otra cuenta de MercadoEnvíos" (29-10): '' = sin cuenta elegida; el nombre = la que falta.
  const [agregar, setAgregar] = useState<string | null>(null)
  // Sin inventario (Fundadores, 19-10): la lista por VENTA, como "Por confirmar"; la tabla queda como Historial.
  const [vista, setVista] = useState<'ventas' | 'historial'>('ventas')
  const pc = usePorConfirmar(!!datos?.desdeML)

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

  // Después de "Traer pagos y guías" (23-10): la pantalla se refresca sola hasta que llega el resultado de ESE pedido,
  // aunque al abrirla no hubiera ningún perfil conectado (antes quedaba mostrando la traída vieja y parecía que no trajo).
  const [pedidoEn, setPedidoEn] = useState<number | null>(null)
  const [demo, setDemo] = useState(false)   // cuenta Demo: la traída termina en segundos, se mira cada 1 s
  const recargarVentas = pc.cargar
  const llego = !!pedidoEn && !!pedido && new Date(pedido.pedido_at).getTime() >= pedidoEn - 60_000
    && Object.keys(pedido.resultados).length > 0 && !trabajando
  const esperandoTraida = !!pedidoEn && !llego
  useEffect(() => {
    if (!esperandoTraida || !pedidoEn) return
    const t = setInterval(() => {
      if (Date.now() - pedidoEn > 5 * 60_000) { setPedidoEn(null); return }   // a los 5 min deja de insistir
      cargar(); recargarVentas()
    }, demo ? 1000 : 5000)
    return () => clearInterval(t)
  }, [esperandoTraida, pedidoEn, cargar, recargarVentas, demo])
  // Cuando llega, trae también las ventas nuevas de MercadoLibre (24-10: un solo botón para todo, como «Traer ME» de
  // Por confirmar; antes el pago llegaba y la venta recién a la hora) y recarga la lista de Ventas.
  useEffect(() => {
    if (!llego) return
    fetch('/api/sales/por-confirmar', { method: 'POST' }).catch(() => null).finally(() => { recargarVentas() })
    const t = setTimeout(() => setPedidoEn(null), 0)
    return () => clearTimeout(t)
  }, [llego, recargarVentas])

  const traer = async () => {
    setBusy('traer'); setError(null); setAviso(null)
    const r = await fetch('/api/pagos-me/traer', { method: 'POST' })
    setBusy(null)
    if (!r.ok) { setError('No se pudo pedir'); return }
    const d = await r.json().catch(() => ({}))
    setDemo(!!d.demo)
    if (!d.demo) setAviso('Pedido enviado: el vigilante lo toma en menos de 1 minuto. Esta pantalla se actualiza sola.')
    setPedidoEn(Date.now())
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
  // Los pasos se ven hasta que hay al menos un perfil de Chrome conectado (23-10: antes desaparecían apenas se
  // conectaba el programa, y si faltaba el Asistente nadie sabía qué faltaba).
  const sinConectar = !!datos && perfiles.length === 0

  const pagos = datos?.pagos ?? []
  const todos = pagos.length > 0 && pagos.every(p => marcados.has(p.id))
  const toggle = (id: number) => setMarcados(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // Mientras carga no se muestra nada a medias (23-10: sin datos se veía unos segundos la vista con inventario).
  if (!datos) return (
    <div className="space-y-4">
      <PageHeader title="Pagos MercadoEnvíos" subtitle="Pagos y guías traídos del portal: verifícalos de corrido contra el banco" />
      <p className="text-sm text-neutral-400">Cargando…</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <PageHeader title="Pagos MercadoEnvíos" subtitle="Pagos y guías traídos del portal: verifícalos de corrido contra el banco"
        actions={
          <button onClick={traer} disabled={busy === 'traer' || trabajando} className="btn-primary text-sm whitespace-nowrap">
            {trabajando ? 'Trayendo…' : 'Traer pagos y guías'}
          </button>
        } />

      {sinConectar && <PrimerosPasos isAdmin={isAdmin} onConectar={conectar} programaListo={!!despertador} />}

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
              {perfiles.length > 0 && (
                <button onClick={() => { setAgregar(''); conectar() }} className="font-medium text-emerald-700 underline">+ Agregar otra cuenta de MercadoEnvíos</button>
              )}
              <a href={DESCARGA_PROGRAMA} className="underline text-neutral-500 hover:text-neutral-800">Descargar programa</a>
              <a href="/extension" target="_blank" className="underline text-neutral-500 hover:text-neutral-800">Extensión de Chrome</a>
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
        {datos?.vigilante.latidos.filter(l => l.verificacion === 'distinta').map(l => (
          <div key={l.perfil} className="mt-2 rounded-lg bg-red-50 border border-red-200 p-2 text-red-800">
            ⚠ Un Chrome de la PC tiene abierta la cuenta de MercadoEnvíos <b>{l.cuenta_portal ?? l.perfil}</b>, que no corresponde a ninguna
            cuenta de MercadoLibre conectada. No se trae nada de ella: entra al portal con la cuenta correcta en ese Chrome.
          </div>
        ))}
        {/* Cuentas de ML sin su Chrome (o desconectadas): no se traen sus pagos ni sus guías (29-10). */}
        {!sinConectar && (datos?.cuentasML ?? []).some(c => c.estado !== 'activa' || !c.con_navegador) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {(datos?.cuentasML ?? []).filter(c => c.estado !== 'activa' || !c.con_navegador).map(c => c.estado !== 'activa' ? (
              <span key={c.nickname} className="text-red-700">
                ⚠ <b>{c.nickname}</b> está desconectada de MercadoLibre: no se traen sus guías.{' '}
                <a href="/cuentas-ml" className="font-medium underline">Conectarla</a>
              </span>
            ) : (
              <span key={c.nickname} className="text-amber-700">
                ○ <b>{c.nickname}</b> no tiene su Chrome conectado: no se traen sus pagos ni guías.{' '}
                {isAdmin && <button onClick={() => { setAgregar(c.nickname); conectar() }} className="font-medium underline">Agregar</button>}
              </span>
            ))}
          </div>
        )}
        {agregar !== null && (
          <AgregarCuenta cuenta={agregar} codigo={codigo} onOtroCodigo={conectar}
            desconectada={!!agregar && (datos?.cuentasML ?? []).some(c => c.nickname === agregar && c.estado !== 'activa')}
            onCerrar={() => { setAgregar(null); setCodigo(null) }} />
        )}
        {codigo && agregar === null && <CodigoConexion codigo={codigo.codigo} vence={codigo.vence_at} onCerrar={() => setCodigo(null)} />}
        {clave && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-900">
            Clave del vigilante (se muestra solo esta vez; cópiala en la extensión de cada perfil):
            <code className="ml-2 select-all font-mono bg-white px-1.5 py-0.5 rounded border">{clave}</code>
            <button onClick={() => navigator.clipboard.writeText(clave)} className="ml-2 underline">Copiar</button>
          </div>
        )}
      </div>

      {/* Sin nada conectado (recién instalado o todo desconectado) no hay traída que mostrar: se ven los pasos. */}
      {pedido && (despertador || perfiles.length > 0) && <EstadoTraida pedido={pedido} perfiles={perfiles.map(l => l.perfil)} nombre={nombre} trabajando={trabajando} desdeML={!!datos?.desdeML}
        pcPrendida={!!despertador?.conectado} />}


      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      {aviso && <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">{aviso}</div>}

      {datos?.desdeML && (
        <div className="flex gap-1 border-b border-neutral-200">
          {([['ventas', 'Ventas'], ['historial', 'Historial de pagos']] as const).map(([k, t]) => (
            <button key={k} onClick={() => setVista(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${vista === k ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>
              {t}
            </button>
          ))}
        </div>
      )}
      {datos?.desdeML && vista === 'ventas' && (
        <PorConfirmar datos={pc.datos} onRecargar={pc.cargar} onConfirmar={() => {}}
          onVerificar={async (id, v) => {
            const r = await fetch('/api/pagos-me/verificar', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: [id], verificacion: v }) }).catch(() => null)
            if (!r?.ok) setError('No se pudo guardar la verificación')
            await Promise.all([pc.cargar(), cargar()])
          }} />
      )}

      {(!datos?.desdeML || vista === 'historial') && <>
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
                      {/* La guía a la vista (19-10): número y PDF, por si hay que consultarla. */}
                      {p.guia && <div className="text-neutral-700">Guía <span className="font-mono">{p.guia}</span></div>}
                      {p.tiene_guia
                        ? <a href={`/api/pagos-me/${p.id}/archivo?tipo=guia`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                            className="underline text-sky-700">📄 Guía</a>
                        : <div className="text-neutral-400">sin guía</div>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {datos?.desdeML ? <>
                        {p.ml_estado === 'cancelled' && <div className="text-red-700 font-medium">cancelada en ML</div>}
                        {p.apartado && <div className="font-medium text-amber-700">{p.apartado === 'espera' ? '⏸ apartado: en espera' : '✕ envío cancelado'}</div>}
                        {p.en_despachos ? <a href="/despachos" onClick={e => e.stopPropagation()} className="text-neutral-700 underline underline-offset-2 hover:text-sky-700">{p.guia_impresa ? '✓ guía ya impresa' : 'en Despachos, sin imprimir'} →</a>
                          : <div className="text-neutral-400">{p.tiene_guia ? 'todavía no en Despachos' : 'sin guía todavía'}</div>}
                      </> : <>
                        {p.sale_status ? <div>{p.sale_status}</div> : <div className="text-neutral-400">no registrada</div>}
                        {p.apartado && <div className="font-medium text-amber-700">{p.apartado === 'espera' ? '⏸ apartado: en espera' : '✕ envío cancelado'}</div>}
                        {p.en_despachos && <a href="/despachos" onClick={e => e.stopPropagation()} className="block text-neutral-500 underline underline-offset-2 hover:text-sky-700">{p.guia_impresa ? '✓ guía ya impresa' : 'en Despachos, sin imprimir'} →</a>}
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

      </>}

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

/** Cómo terminó la última traída, bien a la vista: trayendo / listo (ya puede despachar) / con problemas. */
function EstadoTraida({ pedido, perfiles, nombre, trabajando, desdeML, pcPrendida }: {
  pedido: NonNullable<Datos['vigilante']['pedido']>; perfiles: string[]; nombre: (perfil: string) => string
  trabajando: boolean; desdeML: boolean; pcPrendida: boolean
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
      <b>{nombre(perfil) !== perfil ? nombre(perfil) : (r.cuenta ?? perfil)}</b>{' '}
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
  // La PC responde pero ningún perfil de Chrome tiene el Asistente conectado: no es la luz (23-10).
  if (res.length === 0 && pcPrendida && perfiles.length === 0) return caja('bg-amber-50 border-amber-200 text-amber-900',
    <>⚠️ La PC está prendida, pero ningún perfil de Chrome tiene el Asistente de envíos conectado.</>,
    'Abre Chrome en el perfil de tu cuenta de MercadoLibre, agrega el Asistente y escribe el código (pasos 3 y 4 de arriba). Después toca "Traer pagos y guías".')
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

/** Primera vez: qué es y cómo se conecta. Es LA guía de los Fundadores (23-10): cada paso una sola acción, y los
 *  pasos 1-2 (programa) y 3-4 (Asistente en Chrome) se marcan solos cuando el sistema los ve conectados. Se ve hasta
 *  que hay un perfil de Chrome conectado. Mismo texto que tools/vigilante-pagos-me/guia (PDF). */
function PrimerosPasos({ isAdmin, onConectar, programaListo }: { isAdmin: boolean; onConectar: () => void; programaListo: boolean }) {
  const paso = 'flex gap-3 items-start'
  const num = (listo: boolean, falta = false) => `shrink-0 w-6 h-6 rounded-full text-white text-xs font-semibold flex items-center justify-center ${
    listo ? 'bg-emerald-600' : falta ? 'bg-amber-500 ring-4 ring-amber-200' : 'bg-emerald-600/70'}`
  const sub = 'block text-xs text-neutral-500 mt-0.5'
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4 space-y-3 text-sm text-neutral-700">
      <div>
        <p className="font-semibold text-neutral-900">Tus pagos y guías de MercadoEnvíos, solos</p>
        <p className="text-xs text-neutral-500 mt-0.5">
          Un programa en tu PC lee el portal de MercadoEnvíos con <b>tu</b> sesión y trae los pagos con su comprobante y las
          guías. Tu contraseña nunca sale de tu PC. Si se va la luz no se pierde nada: al prenderla trae lo que faltaba.
        </p>
      </div>
      {isAdmin ? (<>
        {/* Paso 0 (23-10, pedido del dueño): lo que tiene que haber antes, para que todo fluya. */}
        <div className="rounded-lg bg-white/70 px-3 py-2 text-xs text-neutral-600 ring-1 ring-inset ring-emerald-200">
          <b className="text-neutral-800">Antes de empezar:</b> una <b>PC con Windows</b> (la misma donde imprimes las guías) con{' '}
          <b>Google Chrome</b>, y en Chrome <b>la sesión de MercadoEnvíos iniciada</b> con tu cuenta de MercadoLibre (un perfil de
          Chrome por cada cuenta). Ser administrador de tu empresa aquí.
        </div>
        <ol className="space-y-2.5">
          <li className={paso}><span className={num(programaListo)}>{programaListo ? '✓' : '1'}</span>
            <span><a href={DESCARGA_PROGRAMA} className="font-medium text-emerald-700 underline">Descarga el programa</a> en la PC donde imprimes las guías e instálalo (Siguiente → Instalar).
              <span className={sub}>
                Si Windows muestra «Windows protegió su PC», toca <b>Más información</b> → <b>Ejecutar de todas formas</b>. Sale porque el
                programa es nuevo y no tiene firma comprada; es el nuestro.
              </span></span></li>
          <li className={paso}><span className={num(programaListo)}>{programaListo ? '✓' : '2'}</span>
            <span>Cuando el programa pida el código: toca <button onClick={onConectar} className="font-medium text-emerald-700 underline">Genera tu código</button> → <b>Copiar</b> y pégalo ahí.
              Al terminar deja marcadas las dos casillas y toca <b>Finalizar</b>.
              {programaListo && <span className="block text-xs font-medium text-emerald-700 mt-0.5">✓ El programa ya está conectado.</span>}</span></li>
          <li className={paso}><span className={num(false, programaListo)}>3</span>
            <span><b>Agrega el Asistente de envíos a Chrome:</b> al finalizar la instalación se abre solo en la tienda de Chrome → <b>Añadir a Chrome</b> → <b>Añadir extensión</b>.
              <span className={sub}><b>Asegúrate de que esa ventana de Chrome sea la del perfil donde tienes iniciada la sesión de MercadoEnvíos.</b> Si se
                abrió en otro perfil, no se abrió o quieres agregarlo a mano: en el perfil correcto entra a{' '}
                <a href="/extension" target="_blank" className="font-medium text-emerald-700 underline">app.elcomerciantedigital.com/extension</a>. No hace falta «Iniciar sesión en Chrome».</span></span></li>
          <li className={paso}><span className={num(false, programaListo)}>4</span>
            <span><b>Conecta el Asistente:</b> toca la <b>pieza de rompecabezas</b> (arriba a la derecha de Chrome) → 📌 fija «Asistente de envíos» →
              ábrelo, <b>pega el mismo código</b> y toca <b>Conectar</b>. Debe decir <b>«Conectado al sistema»</b>.
              <span className={sub}>¿Otra cuenta de MercadoLibre en otro perfil de Chrome? Repite los pasos 3 y 4 ahí. Si el código venció, genera otro: lo ya conectado sigue funcionando.</span>
              {programaListo && <span className="block text-xs font-medium text-amber-700 mt-0.5">Falta este paso: ningún perfil de Chrome tiene el Asistente conectado todavía.</span>}</span></li>
          <li className={paso}><span className={num(false)}>5</span>
            <span>Listo: toca <b>Traer pagos y guías</b> y espera el aviso verde <b>✅ Listo</b>. Chrome se abre solo, trabaja y se cierra: no lo toques.</span></li>
        </ol>
      </>) : (
        <p className="text-xs">Pídele a un administrador de tu empresa que conecte la PC.</p>
      )}
    </div>
  )
}

/** Segunda (o tercera…) cuenta de MercadoEnvíos (29-10): cada cuenta va en su propio perfil de Chrome con el Asistente.
 *  El programa de la PC encuentra solo el perfil nuevo: no se reinstala nada. El código ya viene generado. */
function AgregarCuenta({ cuenta, codigo, desconectada, onOtroCodigo, onCerrar }: {
  cuenta: string; codigo: { codigo: string; vence_at: string } | null; desconectada: boolean
  onOtroCodigo: () => void; onCerrar: () => void
}) {
  const nombre = cuenta || 'la otra cuenta'
  const paso = 'flex gap-3 items-start'
  const num = 'shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center'
  const sub = 'block text-xs text-neutral-500 mt-0.5'
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 space-y-3 text-sm text-neutral-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-neutral-900">Agregar {cuenta ? <b>{cuenta}</b> : 'otra cuenta de MercadoEnvíos'}</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            Cada cuenta va en <b>su propio perfil de Chrome</b>, con su sesión de MercadoEnvíos. El programa de la PC encuentra solo el
            perfil nuevo: no hay que reinstalar nada.
          </p>
        </div>
        <button onClick={onCerrar} className="text-emerald-700 text-xs shrink-0">Cerrar ✕</button>
      </div>
      <ol className="space-y-2.5">
        <li className={paso}><span className={num}>1</span>
          <span>La cuenta tiene que estar conectada en <a href="/cuentas-ml" className="font-medium text-emerald-700 underline">Cuentas ML</a>.
            {desconectada
              ? <span className="block text-xs font-medium text-red-700 mt-0.5">⚠ {cuenta} está desconectada: conéctala primero, si no sus guías no entran.</span>
              : <span className={sub}>Si no aparece ahí, conéctala primero.</span>}</span></li>
        <li className={paso}><span className={num}>2</span>
          <span>En la PC de las guías, abre Chrome y crea <b>otro perfil</b>: toca tu foto (arriba a la derecha) → <b>Agregar</b> →{' '}
            <b>Continuar sin cuenta</b> → ponle de nombre {cuenta ? <b>{cuenta}</b> : 'el de la cuenta'}.
            <span className={sub}>Se abre una ventana nueva: ese es el perfil de {nombre}. Los pasos 3 y 4 van en esa ventana.</span></span></li>
        <li className={paso}><span className={num}>3</span>
          <span>En esa ventana, entra a <b>MercadoEnvíos con la cuenta de {nombre}</b> y deja la sesión iniciada. Después agrega el
            Asistente desde <a href="/extension" target="_blank" className="font-medium text-emerald-700 underline">app.elcomerciantedigital.com/extension</a>{' '}
            → <b>Añadir a Chrome</b>.</span></li>
        <li className={paso}><span className={num}>4</span>
          <span>Toca la <b>pieza de rompecabezas</b> (arriba a la derecha) → abre <b>Asistente de envíos</b> → pega este código → <b>Conectar</b>.
            Debe decir <b>«Conectado al sistema»</b>.
            {codigo ? (
              <span className="mt-1.5 flex flex-wrap items-center gap-3">
                <code className="select-all rounded bg-white px-2 py-1 font-mono text-xl font-semibold tracking-widest ring-1 ring-emerald-200">{codigo.codigo}</code>
                <button onClick={() => navigator.clipboard.writeText(codigo.codigo)} className="btn-secondary text-xs">Copiar</button>
                <span className="text-xs text-neutral-500">
                  Vale hasta las {new Date(codigo.vence_at).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit' })}.{' '}
                  <button onClick={onOtroCodigo} className="underline">Otro código</button>
                </span>
              </span>
            ) : <span className={sub}>Generando el código…</span>}</span></li>
        <li className={paso}><span className={num}>5</span>
          <span>Listo: toca <b>Traer pagos y guías</b>. Se abre un Chrome por cuenta, trae lo suyo y se cierra. Arriba, {nombre} pasa a
            «conectado».
            <span className={sub}>No cierres sesión de MercadoEnvíos en ningún perfil. Si se vence, al traer queda abierta esa ventana para
              que vuelvas a entrar.</span></span></li>
      </ol>
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
        Escríbelo en el programa al instalarlo y en el Asistente de envíos de cada cuenta de Chrome. Vale hasta las {hasta}{hasta.endsWith('.') ? '' : '.'}
        Las PCs que ya estaban conectadas siguen funcionando.
      </p>
      <button onClick={onCerrar} className="text-emerald-700 text-xs">Cerrar ✕</button>
    </div>
  )
}
