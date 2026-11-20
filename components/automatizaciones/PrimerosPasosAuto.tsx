'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/ui/Link'

// Inicio de Automatizaciones → «Primeros pasos» (20-11, el dueño; idea vista en Mercasist). Lo único necesario es
// conectar MercadoLibre; lo demás es opcional y se dice así (se puede trabajar a mano solo con la cuenta conectada).
// Cada paso se marca solo (/api/automatizaciones/primeros-pasos). «Comprendo, ocultar» la quita para toda la empresa
// y no vuelve a salir; con todo hecho también se va. Los días de prueba NO van aquí: ya los dice el aviso de arriba.
// Textos = docs/ayuda/sistema.md (mantener iguales).
interface Estado {
  oculta: boolean; ml?: boolean
  miIA?: { faltan: number; total: number } | null
  auto?: boolean | null
  telegram?: boolean | null
}
interface Paso { k: string; titulo: string; para: string; href: string; ir: string; hecho: boolean; necesario: boolean; guia: string }
const MANUAL = '/aprendizaje/manual/automatizaciones'

function pasos(e: Estado): Paso[] {
  return [
    { k: 'ml', titulo: 'Conecta tu cuenta de MercadoLibre', necesario: true, hecho: !!e.ml, href: '/conectar', ir: 'Conectar',
      para: 'Sin esto no se traen tus preguntas, mensajes ni ventas.', guia: `${MANUAL}#cuentas` },
    ...(e.miIA ? [{
      k: 'miia', necesario: false, hecho: e.miIA.faltan === 0, href: '/mi-ia', ir: 'Ir a Mi IA', guia: `${MANUAL}#preguntas`,
      titulo: e.miIA.faltan === 0 ? 'Completa Mi IA' : `Completa Mi IA (te faltan ${e.miIA.faltan} de ${e.miIA.total} temas)`,
      para: 'Para que la IA responda como tú: pagos, envíos, garantía, horario.',
    }] : []),
    ...(e.auto != null ? [{
      k: 'auto', titulo: 'Prende las respuestas automáticas', necesario: false, hecho: e.auto, href: '/mi-ia', ir: 'Encender',
      para: 'La IA responde sola, también de noche. Eliges Modo Seguro o Total.', guia: `${MANUAL}#preguntas`,
    }] : []),
    ...(e.telegram != null ? [{
      k: 'telegram', titulo: 'Recibe avisos por Telegram', necesario: false, hecho: e.telegram, href: '/mis-avisos', ir: 'Conectar',
      para: 'Te llegan al celular las preguntas, ventas y reclamos nuevos.', guia: `${MANUAL}#avisos`,
    }] : []),
  ]
}

export default function PrimerosPasosAuto() {
  const [e, setE] = useState<Estado | null>(null)
  const [cerrando, setCerrando] = useState(false)

  useEffect(() => {
    let vivo = true
    fetch('/api/automatizaciones/primeros-pasos', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(j => { if (vivo && j) setE(j) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  if (!e || e.oculta) return null
  const lista = pasos(e)
  const hechos = lista.filter(p => p.hecho).length
  if (hechos === lista.length) return null

  const ocultar = async () => {
    setCerrando(true)
    try { await fetch('/api/automatizaciones/primeros-pasos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ocultar: true }) }) } catch { /* igual se oculta ahora */ }
    setE({ ...e, oculta: true })
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm" aria-label="Primeros pasos">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="font-semibold text-neutral-900">Primeros pasos</h2>
            <span className="flex items-center gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={lista.length} aria-valuenow={hechos} aria-label={`${hechos} de ${lista.length} listos`}>
              {lista.map(p => <span key={p.k} title={p.titulo} className={`h-1.5 w-4 rounded-full ${p.hecho ? 'bg-emerald-500' : 'bg-neutral-200'}`} />)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">Lo único necesario es conectar MercadoLibre; lo demás es opcional y te ahorra tiempo.</p>
        </div>
        {/* Sin MercadoLibre conectado no se oculta: es lo único necesario. */}
        {e.ml && (
          <button type="button" onClick={ocultar} disabled={cerrando} title="Deja de verse en el Inicio para toda tu empresa"
            className="btn-secondary !px-3 !py-1 text-xs">{cerrando ? 'Ocultando…' : 'Comprendo, ocultar'}</button>
        )}
      </div>
      <ol className="mt-2 divide-y divide-neutral-100 border-t border-neutral-100">
        {lista.map((p, i) => (
          <li key={p.k} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:flex-nowrap">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${p.hecho ? 'bg-emerald-500 text-white' : 'border border-neutral-300 text-neutral-500'}`} aria-hidden>
              {p.hecho ? '✓' : i + 1}
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className={`text-sm font-medium ${p.hecho ? 'text-neutral-400 line-through decoration-neutral-300' : 'text-neutral-900'}`}>{p.titulo}</span>
                {!p.hecho && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${p.necesario ? 'bg-lime-100 text-lime-800' : 'bg-neutral-100 text-neutral-500'}`}>
                    {p.necesario ? 'Necesario' : 'Opcional'}
                  </span>
                )}
              </div>
              {!p.hecho && <p className="text-xs text-neutral-500">{p.para}</p>}
            </div>
            {!p.hecho && (
              <div className="ml-9 flex shrink-0 items-center gap-2 sm:ml-0">
                <Link href={p.guia} title="Cómo se hace (manual)" aria-label={`Guía: ${p.titulo}`}
                  className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2V5z" /><path d="M20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2V5z" />
                  </svg>
                </Link>
                <Link href={p.href} className={`${p.necesario ? 'btn-primary' : 'btn-secondary'} whitespace-nowrap !px-3 !py-1.5 text-sm`}>{p.ir} →</Link>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
