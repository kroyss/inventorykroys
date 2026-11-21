'use client'
import { useEffect, useState } from 'react'
import { Ventana } from '@/components/ui/Ventana'

/** Oferta «Prueba Inventario 15 días gratis» (21-11, mig. 193): franja con ✕ (cerrada por la semana) y la ventana para
 *  activarla en 2 clics: «Probar gratis» → leer qué incluye y qué pasa al final → «Activar prueba». Al activarla va a
 *  Inicio de Inventario, donde lo espera «Primeros pasos». */
export default function AvisoInventarioOferta({ llave, hasta, incluye, dias, diasDatos, monto, planHasta }: {
  llave: string; hasta: string; incluye: string[]; dias: number; diasDatos: number; monto: string | null; planHasta: string | null
}) {
  const [ver, setVer] = useState(false)
  const [abierta, setAbierta] = useState(false)
  const [activando, setActivando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- se lee del navegador después de montar
  useEffect(() => { try { setVer(!localStorage.getItem(llave)) } catch { setVer(true) } }, [llave])
  if (!ver) return null

  const cerrar = () => { try { localStorage.setItem(llave, '1') } catch { /* sin almacenamiento */ } setVer(false); window.dispatchEvent(new Event('aviso-cerrado')) }
  const activar = async () => {
    setActivando(true); setError(null)
    const r = await fetch('/api/mi-plan/inventario', { method: 'POST' }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (!r?.ok) { setActivando(false); setError(d.error ?? 'No se pudo activar. Intenta de nuevo.'); return }
    window.location.href = '/dashboard'
  }

  return (
    <div className="relative border-b border-sky-200 bg-sky-50 text-sky-950 text-center text-sm py-2 pl-4 pr-10">
      <span className="mr-1.5 rounded-full bg-sky-600 px-1.5 py-px align-[1px] text-[10px] font-bold uppercase tracking-wide text-white">Nuevo</span>
      <b className="font-semibold">Prueba Inventario {dias} días gratis</b>
      <span className="hidden sm:inline">: tu stock, tus ventas, tus compras y la ganancia real de cada venta</span>.{' '}
      <button type="button" onClick={() => setAbierta(true)}
        className="ml-1 inline-block whitespace-nowrap rounded-full bg-sky-700 px-3 py-0.5 text-xs font-semibold text-white hover:bg-sky-800">
        Probar gratis
      </button>
      <button type="button" aria-label="Cerrar aviso" title="Cerrar por esta semana" onClick={cerrar}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-sky-700 hover:bg-sky-100">✕</button>

      {abierta && <div className="text-left">
        <Ventana titulo={`Prueba Inventario ${dias} días gratis`} onCerrar={() => { if (!activando) setAbierta(false) }}>
          <div className="space-y-3 text-left text-sm text-neutral-700">
            <p>Todo lo que ya usas sigue igual (Preguntas, Mensajes, Despachos, Pagos ME). Se suma:</p>
            <ul className="space-y-1.5">
              {incluye.map(t => (
                <li key={t} className="flex gap-2"><span aria-hidden className="mt-0.5 text-emerald-600">✓</span><span>{t}</span></li>
              ))}
            </ul>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 space-y-1.5">
              <p><b className="font-semibold text-neutral-900">Gratis hasta el {hasta}.</b> No se cobra nada ni te pedimos datos de pago.</p>
              <p>
                Si quieres seguir, pasas a <b className="font-semibold">Completo</b> desde Mi plan pagando solo la diferencia por los días que le
                quedan a tu plan{planHasta ? <> (hasta el {planHasta})</> : null}, contados desde que termina la prueba
                {monto ? <>: hoy serían <b className="font-semibold text-neutral-900">{monto}</b></> : null}.
              </p>
              <p>Si no, se apaga solo y tus datos se guardan {diasDatos} días.</p>
            </div>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-800">{error}</p>}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setAbierta(false)} disabled={activando}
                className="rounded-lg border border-neutral-300 px-4 py-2.5 font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">Ahora no</button>
              <button type="button" onClick={activar} disabled={activando}
                className="rounded-lg bg-sky-700 px-4 py-2.5 font-semibold text-white hover:bg-sky-800 disabled:opacity-60">
                {activando ? 'Activando…' : 'Activar prueba gratis'}
              </button>
            </div>
          </div>
        </Ventana>
      </div>}
    </div>
  )
}
