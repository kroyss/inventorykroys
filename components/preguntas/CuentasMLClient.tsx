'use client'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader, StatusBadge, Cargando } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'

interface Cuenta { id: number; nickname: string; estado: string; ultima_sync: string | null; ultimo_error: string | null }

function hace(fecha: string) {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`
}

/** Automatizaciones → Cuentas de MercadoLibre: las cuentas que usan TODAS las herramientas (antes vivía
 *  en Preguntas → Cuentas y políticas). Conectar, link para otra PC, estado y desconectar. Aquí vuelve
 *  el OAuth (api/ml/callback → ?conectada= / ?ml_error=). */
export default function CuentasMLClient() {
  const confirm = useConfirm()
  const [datos, setDatos] = useState<{ cuentas: Cuenta[]; mlListo: boolean; esAdmin: boolean } | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/ml/conexiones', { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setAviso({ tipo: 'error', texto: d.error ?? 'No se pudo cargar' }); return }
    setDatos(d)
  }, [])

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const ok = p.get('conectada'), err = p.get('ml_error')
    if (ok || err) {
      window.history.replaceState(null, '', '/cuentas-ml')
      setAviso(ok ? { tipo: 'ok', texto: `✓ Cuenta ${ok} conectada. Ya está trayendo sus preguntas y mensajes.` } : { tipo: 'error', texto: err! })
      // Trae lo de la cuenta nueva en segundo plano (como hacía Preguntas al volver).
      if (ok) fetch('/api/preguntas/sincronizar', { method: 'POST' }).then(() => cargar()).catch(() => {})
    }
    cargar()
  }, [cargar])

  const desconectar = async (c: Cuenta) => {
    if (!await confirm({ title: `Desconectar ${c.nickname}`, message: 'Se dejan de traer sus preguntas, mensajes y ventas, y no se podrá responder desde aquí. Lo ya guardado se conserva.', confirmText: 'Desconectar', danger: true })) return
    await fetch(`/api/ml/conexiones/${c.id}`, { method: 'DELETE' })
    cargar()
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Cuentas de MercadoLibre" subtitle="Las cuentas con las que trabajan Preguntas, Mensajes, Calificaciones, Stock, Despachos y el Reportador"
        actions={datos?.esAdmin && (datos.mlListo
          ? <a href="/conectar" className="btn-primary text-sm">Conectar cuenta</a>
          : <span className="text-xs text-amber-700">Falta configurar la app de ML</span>)} />
      {aviso && (
        <div className={`px-4 py-2 rounded text-sm border ${aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{aviso.texto}</div>
      )}
      {!datos ? <Cargando filas={3} /> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="bg-white rounded-xl border border-neutral-200 shadow-sm">
            {datos.cuentas.length === 0 ? (
              <p className="p-6 text-sm text-neutral-500 text-center">Ninguna conectada todavía. Si estás en prueba, tus días gratis empiezan cuando conectes la primera.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {datos.cuentas.map(c => (
                  <li key={c.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                    <StatusBadge status={c.estado === 'activa' ? (c.ultimo_error ? 'PARCIAL' : 'OK') : 'INCONSISTENTE'}
                      label={c.estado === 'activa' ? (c.ultimo_error ? 'Con error' : 'Conectada') : 'Desconectada'} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutral-900">{c.nickname}</p>
                      <p className="text-xs text-neutral-500 truncate">
                        {c.ultimo_error ?? (c.ultima_sync ? `Actualizada ${hace(c.ultima_sync)}` : 'Sin actualizar todavía')}
                      </p>
                    </div>
                    {datos.esAdmin && (c.estado === 'activa'
                      ? <button onClick={() => desconectar(c)} className="btn-ghost text-xs text-red-600">Desconectar</button>
                      : datos.mlListo && <a href="/conectar" className="btn-secondary text-xs px-2.5 py-1">Reconectar</a>)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="space-y-3">
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-2 text-sm text-neutral-600">
              <p className="font-semibold text-neutral-900">Cómo conectar</p>
              <p>Abre <b>mercadolibre.com.ve</b> en este navegador con la cuenta <b>PRINCIPAL</b> (un colaborador no puede autorizar) y toca <b>Conectar cuenta</b>.</p>
              <p>Para otra cuenta: cierra sesión en MercadoLibre, entra con la otra y vuelve a conectar.</p>
              <p className="text-xs text-neutral-500">El sistema nunca publica nada sin que tú lo revises. Puedes desconectar una cuenta cuando quieras.</p>
            </div>
            {datos.esAdmin && datos.mlListo && <LinkConectar />}
          </aside>
        </div>
      )}
    </div>
  )
}

/** Link corto para conectar desde otra PC (app/conectar): se copia y se abre allá. */
export function LinkConectar() {
  const [copiado, setCopiado] = useState(false)
  const [url, setUrl] = useState('/conectar')
  useEffect(() => { setUrl(`${window.location.origin}/conectar`) }, [])
  const copiar = async () => {
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sin portapapeles */ }
  }
  return (
    <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3 space-y-1.5">
      <p className="text-xs text-neutral-600">
        <b>¿La cuenta de MercadoLibre está abierta en otra PC?</b> Copia este link y ábrelo allá: entra al sistema con tu
        usuario y conecta la cuenta de ML que esté abierta en ESE navegador.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate text-xs bg-white border border-neutral-200 rounded px-2 py-1">{url}</code>
        <button type="button" onClick={copiar} className="btn-secondary text-xs px-2 py-1 whitespace-nowrap">{copiado ? '✓ Copiado' : 'Copiar'}</button>
      </div>
    </div>
  )
}
