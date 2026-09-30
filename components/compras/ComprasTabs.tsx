'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { usePersistedTab } from '@/lib/usePersistedTab'
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus'
import type { PurchaseOrder, ImportOrder, Supplier, UserRole } from '@/lib/types'
import ComprasClient from './ComprasClient'
import ImportsClient from './ImportsClient'
import { PageHeader, Tabs, chipCls } from '@/components/ui'

interface Props {
  initialOrders: PurchaseOrder[]
  initialImports: ImportOrder[]
  localSuppliers: Supplier[]
  importSuppliers: Supplier[]
  userRole: UserRole
  country: 'VE' | 'CO'
}

export default function ComprasTabs({
  initialOrders, initialImports, localSuppliers, importSuppliers, userRole,
}: Props) {
  // Importaciones es la pestaña principal en ambos países → primera y por defecto.
  // Se recuerda entre F5 (el deep-link ?tab=import, más abajo, igual tiene prioridad).
  const [tab, setTab] = usePersistedTab<'local' | 'import' | 'history'>('tab:compras', 'import')
  // Dentro de Historial, qué tipo se ve
  const [histType, setHistType] = useState<'local' | 'import'>('local')
  // Botón unificado "+ Compra": menú abierto + tipo pendiente de crear
  const [createOpen,    setCreateOpen]    = useState(false)
  const [pendingCreate, setPendingCreate] = useState<null | 'local' | 'import'>(null)
  const startCreate = (type: 'local' | 'import') => {
    setCreateOpen(false)
    setTab(type)
    setPendingCreate(type)
  }

  // Fuente única de datos: arranca con lo del servidor y se re-consulta al cambiar
  // de pestaña, así los contadores y la lista de Historial reflejan al instante lo
  // que se finalizó en otra pestaña (antes había que hacer F5).
  const [orders, setOrders]   = useState<PurchaseOrder[]>(initialOrders)
  const [imports, setImports] = useState<ImportOrder[]>(initialImports)

  const refresh = useCallback(async () => {
    try {
      const [o, i] = await Promise.all([
        fetch('/api/purchases', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)),
        fetch('/api/imports',   { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)),
      ])
      if (Array.isArray(o)) setOrders(o)
      if (Array.isArray(i)) setImports(i)
    } catch { /* sin red: conserva lo que hay */ }
  }, [])

  // Re-consultar al cambiar de pestaña (y al montar).
  useEffect(() => { refresh() }, [tab, refresh])
  // Y también al volver a la pestaña del navegador o cada minuto: la pantalla
  // suele quedar abierta y, si no, muestra el estado del momento en que se abrió.
  useRefetchOnFocus(refresh, true, 60_000)

  // Contadores que coinciden con lo que muestra cada pestaña.
  // Activas = no finalizadas/inconsistentes (esas van en Historial). El usuario
  // normal solo ve EN_CAMINO/RECIBIDA/PARCIAL, así que su contador lo refleja.
  const isAdmin = userRole === 'admin'
  const HIST = ['FINALIZADA', 'INCONSISTENTE']
  const isActive = (status: string) =>
    !HIST.includes(status) && (isAdmin || ['EN_CAMINO', 'RECIBIDA', 'PARCIAL'].includes(status))
  const localActive  = orders.filter(o => isActive(o.status)).length
  const importActive = imports.filter(o => isActive(o.status)).length
  const localHist    = orders.filter(o => HIST.includes(o.status)).length
  const importHist   = imports.filter(o => HIST.includes(o.status)).length
  const historyTotal = localHist + importHist

  // deep-link: /compras?tab=import abre la pestaña de importaciones. Con
  // useSearchParams se re-aplica si cambia la URL sin desmontar la pantalla.
  // Ojo: la pestaña se recuerda en sessionStorage, así que sin ?tab= explícito
  // ganaría la última usada — por eso los links del dashboard mandan el tab que
  // corresponde y acá se respetan los dos valores, no solo 'import'.
  const tabParam = useSearchParams().get('tab')
  useEffect(() => {
    if (tabParam === 'import' || tabParam === 'local') setTab(tabParam)
  }, [tabParam])

  const subBtn = (key: 'local' | 'import', label: string) => (
    <button onClick={() => setHistType(key)}
      className={chipCls(histType === key)}>
      {label}
    </button>
  )

  return (
    <div>
      <PageHeader title={isAdmin ? 'Compras' : 'Recepciones'}
        subtitle={isAdmin ? 'Importaciones y compras locales, del pago a la recepción' : 'Mercancía que llega y hay que recibir'}
        actions={isAdmin && (
          <div className="relative">
            <button onClick={() => setCreateOpen(o => !o)} className="btn-primary text-sm whitespace-nowrap">
              + Compra ▾
            </button>
            {createOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setCreateOpen(false)} />
                <div className="absolute right-0 mt-1 w-44 bg-white border border-neutral-200 rounded-lg shadow-lg z-20 overflow-hidden">
                  <button onClick={() => startCreate('import')}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-neutral-50">📦 Importación</button>
                  <button onClick={() => startCreate('local')}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 border-t border-neutral-100">🧾 Compra local</button>
                </div>
              </>
            )}
          </div>
        )} />

      {/* Importaciones primero (lo más común) en VE y CO, luego Locales, luego Historial */}
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[
        { value: 'import',  label: 'Importaciones', count: importActive },
        { value: 'local',   label: 'Locales',       count: localActive },
        { value: 'history', label: 'Historial',     count: historyTotal },
      ]} />

      {tab === 'local' && (
        <ComprasClient initialOrders={orders} initialSuppliers={localSuppliers} userRole={userRole} onChanged={refresh}
          autoCreate={pendingCreate === 'local'} onAutoCreateHandled={() => setPendingCreate(null)} />
      )}
      {tab === 'import' && (
        <ImportsClient initialOrders={imports} suppliers={importSuppliers} userRole={userRole} onChanged={refresh}
          autoCreate={pendingCreate === 'import'} onAutoCreateHandled={() => setPendingCreate(null)} />
      )}
      {tab === 'history' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400">Historial (finalizadas):</span>
            {subBtn('local', `Locales (${localHist})`)}
            {subBtn('import', `Importaciones (${importHist})`)}
          </div>
          {histType === 'local'
            ? <ComprasClient initialOrders={orders} initialSuppliers={localSuppliers} userRole={userRole} onChanged={refresh} historyMode />
            : <ImportsClient initialOrders={imports} suppliers={importSuppliers} userRole={userRole} onChanged={refresh} historyMode />}
        </div>
      )}
    </div>
  )
}
