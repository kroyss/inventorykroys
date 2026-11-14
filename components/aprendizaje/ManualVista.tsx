'use client'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from '@/components/ui/Link'
import { PageHeader } from '@/components/ui'
import { Ventana } from '@/components/ui/Ventana'
import { matchFuzzy } from '@/lib/search'
import type { Capitulo } from '@/lib/manual'

// Vista de un manual de Aprendizaje (14-11): índice fijo a la izquierda (chips arriba en el celular), buscador, cada
// capítulo con su captura (se abre grande) y sus temas. El texto viene del manual del asistente (lib/manual.ts).

/** Markdown mínimo del manual: **negrita**, `código`, listas numeradas y con guion, párrafos. */
function enLinea(t: string): ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith('**') ? <b key={i} className="font-semibold text-neutral-900">{p.slice(2, -2)}</b>
      : p.startsWith('`') ? <code key={i} className="rounded bg-neutral-100 px-1 text-[0.9em]">{p.slice(1, -1)}</code>
      : <Fragment key={i}>{p}</Fragment>)
}
function Texto({ texto }: { texto: string }) {
  const bloques: ReactNode[] = []
  let parrafo: string[] = []
  let lista: { tipo: 'ol' | 'ul'; items: string[] } | null = null
  const cerrarParrafo = () => { if (parrafo.length) bloques.push(<p key={bloques.length}>{enLinea(parrafo.join(' '))}</p>); parrafo = [] }
  const cerrarLista = () => {
    if (!lista) return
    const L = lista.tipo
    bloques.push(L === 'ol'
      ? <ol key={bloques.length} className="list-decimal space-y-1 pl-5">{lista.items.map((x, i) => <li key={i}>{enLinea(x)}</li>)}</ol>
      : <ul key={bloques.length} className="list-disc space-y-1 pl-5">{lista.items.map((x, i) => <li key={i}>{enLinea(x)}</li>)}</ul>)
    lista = null
  }
  for (const l of texto.split('\n')) {
    const num = l.match(/^\s*\d+\.\s+(.*)$/), guion = l.match(/^\s*[-·]\s+(.*)$/)
    if (num || guion) {
      cerrarParrafo()
      const tipo = num ? 'ol' : 'ul'
      if (lista && lista.tipo !== tipo) cerrarLista()
      lista ??= { tipo, items: [] }
      lista.items.push((num ?? guion)![1])
    } else if (lista && /^\s{2,}\S/.test(l)) {
      lista.items[lista.items.length - 1] += ' ' + l.trim()
    } else if (l.trim()) {
      cerrarLista(); parrafo.push(l.trim())
    } else { cerrarParrafo(); cerrarLista() }
  }
  cerrarParrafo(); cerrarLista()
  return <div className="space-y-2">{bloques}</div>
}

export default function ManualVista({ titulo, capitulos, capturas, base, reabrirGuia }: {
  titulo: string; capitulos: Capitulo[]; capturas: Record<string, number>; base: string; reabrirGuia: boolean
}) {
  const router = useRouter()
  const [buscar, setBuscar] = useState('')
  const [grande, setGrande] = useState<string | null>(null)
  const [abriendo, setAbriendo] = useState(false)

  const filtrados = useMemo(() => {
    const q = buscar.trim()
    if (!q) return capitulos
    return capitulos.map(c => ({ ...c, temas: c.temas.filter(t => matchFuzzy(q, t.titulo, t.texto)) })).filter(c => c.temas.length)
  }, [capitulos, buscar])

  const verGuia = async () => {
    setAbriendo(true)
    try { await fetch('/api/inventario/primeros-pasos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ocultar: false }) }) } catch { /* igual va al Inicio */ }
    router.push('/dashboard')
  }

  return (
    <div className="space-y-5">
      <PageHeader title={titulo} subtitle={<><Link href="/aprendizaje" className="text-sky-700 hover:underline">Aprendizaje</Link> · Manuales · cómo funciona cada pantalla</>}
        actions={reabrirGuia && (
          <button type="button" onClick={verGuia} disabled={abriendo} className="btn-secondary text-sm">
            {abriendo ? 'Abriendo…' : 'Ver la guía de Primeros pasos'}
          </button>
        )} />

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Índice del manual" className="mb-4 lg:mb-0">
          <div className="lg:sticky lg:top-20 space-y-3">
            <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar en el manual…"
              className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
            <ul className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-col lg:gap-0.5 lg:overflow-visible">
              {filtrados.map(c => (
                <li key={c.id} className="shrink-0">
                  <a href={`#${c.id}`} className="block whitespace-nowrap rounded-lg border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-50 lg:border-0 lg:bg-transparent lg:px-2 lg:py-1.5">
                    {c.titulo}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="min-w-0 space-y-8">
          {!filtrados.length && <p className="rounded-xl border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">Nada coincide con «{buscar}». Prueba con otra palabra o pregunta en Ayuda.</p>}
          {filtrados.map(c => (
            <section key={c.id} id={c.id} className="scroll-mt-20 space-y-3">
              <h2 className="text-lg font-semibold text-neutral-900">{c.titulo}</h2>
              {capturas[c.id] && !buscar.trim() && (
                <button type="button" onClick={() => setGrande(c.id)} className="block w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 shadow-sm transition hover:shadow-md" title="Ver grande">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${base}/${c.id}.png?v=${capturas[c.id]}`} alt={`Pantalla de ${c.titulo}`} loading="lazy" decoding="async" className="max-h-80 w-full object-cover object-top" />
                </button>
              )}
              <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white shadow-sm">
                {c.temas.map(t => (
                  <article key={t.titulo} className="px-4 py-3 text-sm leading-relaxed text-neutral-700">
                    <h3 className="mb-1 font-semibold text-neutral-900">{t.titulo}</h3>
                    <Texto texto={t.texto} />
                  </article>
                ))}
              </div>
            </section>
          ))}
          <p className="text-xs text-neutral-400">¿No encuentras algo? Toca Ayuda (abajo a la derecha) y pregúntalo con tus palabras.</p>
        </div>
      </div>

      {grande && (
        <Ventana titulo={capitulos.find(c => c.id === grande)?.titulo ?? ''} onCerrar={() => setGrande(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${base}/${grande}.png?v=${capturas[grande]}`} alt="" className="w-full rounded-lg" />
        </Ventana>
      )}
    </div>
  )
}
