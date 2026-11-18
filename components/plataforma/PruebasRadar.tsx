'use client'
import { useEffect, useState } from 'react'

// Plataforma → Programas y promos → Prueba Radar (18-11, el dueño, mig 186): las cuentas nuevas que probaron el Radar
// (10 búsquedas en 7 días), cuántas búsquedas usaron, si siguen, terminaron o pagaron, y su contacto para escribirles.
// El ojo abre el Radar como lo ve esa persona (solo lectura: no le gasta búsquedas ni guarda nada).

interface Prueba {
  user_id: number; username: string; nombre: string; desde: string; hasta: string; busquedas: number; repetida: boolean
  ultima_at: string; organizacion_id: number | null; organizacion: string | null; origen: string | null; estado: string | null
  registro: { whatsapp?: string | null; telegram?: string | null; correo?: string | null } | null; pago: boolean | null
}
const MAX = 10
const fecha = (s: string) => new Date(s).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', timeZone: 'America/Caracas' })

function Estado({ p }: { p: Prueba }) {
  const [t, c] = p.pago ? ['Pagó', 'bg-lime-50 text-lime-800 border-lime-200']
    : p.repetida ? ['Sin prueba (cuenta repetida)', 'bg-red-50 text-red-700 border-red-200']
    : new Date(p.hasta) > new Date() && p.busquedas < MAX ? ['En prueba', 'bg-sky-50 text-sky-800 border-sky-200']
    : ['Terminó sin pagar', 'bg-amber-50 text-amber-800 border-amber-200']
  return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${c}`}>{t}</span>
}

export default function PruebasRadar() {
  const [d, setD] = useState<Prueba[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    fetch('/api/plataforma/radar-pruebas', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject())
      .then(x => setD(x.pruebas ?? [])).catch(() => setError(true))
  }, [])

  if (error) return <p className="text-sm text-red-700">No se pudo cargar la lista. Recarga la página.</p>
  if (!d) return <p className="text-sm text-neutral-500">Cargando…</p>
  const enPrueba = d.filter(p => !p.pago && !p.repetida && new Date(p.hasta) > new Date() && p.busquedas < MAX).length
  const pagaron = d.filter(p => p.pago).length
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">
        Cuentas nuevas (desde el 18-11) que entraron al Radar: vista de prueba con {MAX} búsquedas en 7 días, solo la primera
        página. Al terminar quedan en solo lectura con la pantalla de pago. El ojo te muestra su Radar tal como lo ven.
      </p>
      <div className="grid grid-cols-3 gap-2 text-center">
        {([['Probaron', d.length], ['En prueba ahora', enPrueba], ['Pagaron', pagaron]] as const).map(([t, v]) => (
          <div key={t} className="rounded-lg bg-white border border-neutral-200 px-2 py-2">
            <p className="text-lg font-semibold tabular-nums text-neutral-900">{v}</p>
            <p className="text-[11px] text-neutral-500">{t}</p>
          </div>
        ))}
      </div>
      {!d.length ? (
        <p className="rounded-xl border border-dashed border-neutral-200 py-10 text-center text-sm text-neutral-400">
          Todavía nadie probó el Radar. Aparecen aquí apenas entra la primera cuenta nueva.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white text-sm">
          {d.map(p => {
            const contacto = [p.registro?.whatsapp && `WhatsApp ${p.registro.whatsapp}`, p.registro?.telegram && `@${String(p.registro.telegram).replace(/^@/, '')}`, p.registro?.correo]
              .filter(Boolean).join(' · ')
            return (
              <li key={p.user_id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <b className="truncate">{p.organizacion ?? p.nombre}</b>
                    <span className="text-xs text-neutral-500">{p.username} · {p.origen === 'radar' ? 'desde el Radar' : 'desde el Sistema'}</span>
                    <Estado p={p} />
                  </p>
                  <p className="text-xs text-neutral-600">
                    <span className="num font-medium">{p.busquedas} de {MAX}</span> búsquedas · del {fecha(p.desde)} al {fecha(p.hasta)}
                    {contacto && <span className="text-neutral-500"> · {contacto}</span>}
                  </p>
                </div>
                <a href={`/api/radar/ver?u=${p.user_id}`} target="_blank" rel="noopener" title="Ver su Radar como lo ve esta persona (solo lectura)"
                  className="shrink-0 rounded-md border border-neutral-200 p-1.5 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900" aria-label={`Ver el Radar de ${p.nombre}`}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
