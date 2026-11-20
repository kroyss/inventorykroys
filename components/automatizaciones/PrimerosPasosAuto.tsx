'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/ui/Link'

// Inicio de Automatizaciones → «Primeros pasos» (20-11, el dueño; idea vista en Mercasist). Compacta como la de
// Inventario (el dueño): un paso a la vista («Paso 2 de 4»), ‹ › y los puntos pasan de uno en uno. Lo único necesario es
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
  const [ver, setVer] = useState<number | null>(null)   // paso a la vista (null = el primero pendiente)

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
  // Se abre en el primer paso pendiente; ‹ › avanzan o retroceden de a uno (así se salta un opcional sin ocultar todo).
  const primero = lista.findIndex(p => !p.hecho)
  const idx = Math.min(ver ?? primero, lista.length - 1)
  const p = lista[idx]

  const ocultar = async () => {
    setCerrando(true)
    try { await fetch('/api/automatizaciones/primeros-pasos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ocultar: true }) }) } catch { /* igual se oculta ahora */ }
    setE({ ...e, oculta: true })
  }
  const flecha = 'flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm" aria-label="Primeros pasos">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            <span className="font-medium text-neutral-700">Primeros pasos · Paso {idx + 1} de {lista.length}</span>
            <span className="flex items-center gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={lista.length} aria-valuenow={hechos} aria-label={`${hechos} de ${lista.length} listos`}>
              {lista.map((x, i) => (
                <button key={x.k} type="button" onClick={() => setVer(i)} title={x.titulo} aria-label={`Paso ${i + 1}: ${x.titulo}`}
                  className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-6 bg-neutral-900' : x.hecho ? 'w-4 bg-emerald-500' : 'w-4 bg-neutral-200 hover:bg-neutral-300'}`} />
              ))}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className={`font-semibold ${p.hecho ? 'text-neutral-500' : 'text-neutral-900'}`}>{p.hecho ? '✓ ' : ''}{p.titulo}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${p.hecho ? 'bg-emerald-50 text-emerald-700' : p.necesario ? 'bg-lime-100 text-lime-800' : 'bg-neutral-100 text-neutral-500'}`}>
              {p.hecho ? 'Listo' : p.necesario ? 'Necesario' : 'Opcional'}
            </span>
          </div>
          <p className="mt-0.5 text-sm leading-relaxed text-neutral-600">{p.para}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          {!p.hecho && <Link href={p.href} className={`${p.necesario ? 'btn-primary' : 'btn-secondary'} whitespace-nowrap px-4 text-sm`}>{p.ir} →</Link>}
          <div className="flex items-center gap-2 text-xs">
            <button type="button" onClick={() => setVer(idx - 1)} disabled={idx === 0} className={flecha} aria-label="Paso anterior">‹</button>
            <button type="button" onClick={() => setVer(idx + 1)} disabled={idx === lista.length - 1} className={flecha} aria-label="Paso siguiente">›</button>
            <Link href={p.guia} title="Cómo se hace (manual)" aria-label={`Guía: ${p.titulo}`}
              className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2V5z" /><path d="M20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2V5z" />
              </svg>
            </Link>
            {/* Sin MercadoLibre conectado no se oculta: es lo único necesario. */}
            {e.ml && (
              <button type="button" onClick={ocultar} disabled={cerrando} title="Deja de verse en el Inicio para toda tu empresa"
                className="text-neutral-400 hover:text-neutral-700">{cerrando ? 'Ocultando…' : 'Comprendo, ocultar'}</button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
