'use client'
import { useEffect, useState } from 'react'

// Embudo de la página pública de Fundadores (migración 061): personas que entraron, empezaron el
// formulario y se postularon, por ronda, por origen y por día. Persona = navegador.
interface Fila { personas: number; empezaron: number }
interface Datos {
  porDia: (Fila & { dia: string; enviaron: number; movil: number })[]
  porOrigen: (Fila & { origen: string; campana: string | null; postulaciones: number })[]
  porTanda: (Fila & { numero: number; desde: string | null; hasta: string | null; postulaciones: number })[]
}

const ORIGEN: Record<string, string> = {
  meta: 'Anuncio (Meta)', instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp',
  telegram: 'Telegram', google: 'Google', directo: 'Directo / link copiado',
}
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : '—')
const ddmm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '?')

export default function VisitasFundadores() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [abierto, setAbierto] = useState(true)
  useEffect(() => {
    let vivo = true
    const cargar = () => fetch('/api/plataforma/fundadores/visitas').then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo && d) setDatos(d) }).catch(() => {})
    cargar()
    const t = setInterval(cargar, 60_000)
    return () => { vivo = false; clearInterval(t) }
  }, [])
  if (!datos) return null
  const total = datos.porOrigen.reduce((a, o) => a + o.personas, 0)

  return (
    <section className="rounded-xl border border-neutral-200 bg-white">
      <button onClick={() => setAbierto(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="font-semibold text-neutral-900">Visitas a la página</span>
        <span className="text-xs text-neutral-500">{total} persona{total === 1 ? '' : 's'} desde que se mide · {abierto ? 'ocultar' : 'ver'}</span>
      </button>
      {abierto && (
        <div className="border-t border-neutral-100 p-4 space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            {datos.porTanda.map(t => (
              <div key={t.numero} className="rounded-lg bg-neutral-50 p-3">
                <div className="text-xs text-neutral-500">Ronda {t.numero} · postulaciones {ddmm(t.desde)} al {ddmm(t.hasta)}</div>
                <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                  <span><b className="num text-lg">{t.personas}</b> entraron</span>
                  <span className="text-neutral-400">→</span>
                  <span><b className="num">{t.empezaron}</b> empezaron <span className="text-neutral-400">({pct(t.empezaron, t.personas)})</span></span>
                  <span className="text-neutral-400">→</span>
                  <span><b className="num text-lime-700">{t.postulaciones}</b> se postularon <span className="text-neutral-400">({pct(t.postulaciones, t.personas)})</span></span>
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="py-1.5 text-left font-medium">De dónde llegaron</th>
                  <th className="py-1.5 text-right font-medium">Personas</th>
                  <th className="py-1.5 text-right font-medium">Empezaron</th>
                  <th className="py-1.5 text-right font-medium">Se postularon</th>
                  <th className="py-1.5 text-right font-medium">Conversión</th>
                </tr>
              </thead>
              <tbody>
                {datos.porOrigen.map(o => (
                  <tr key={o.origen} className="border-t border-neutral-100">
                    <td className="py-1.5">{ORIGEN[o.origen] ?? o.origen}{o.campana && <span className="ml-1 text-xs text-neutral-400">· {o.campana}</span>}</td>
                    <td className="py-1.5 text-right num">{o.personas}</td>
                    <td className="py-1.5 text-right num">{o.empezaron}</td>
                    <td className="py-1.5 text-right num font-medium">{o.postulaciones}</td>
                    <td className="py-1.5 text-right num text-neutral-500">{pct(o.postulaciones, o.personas)}</td>
                  </tr>
                ))}
                {!datos.porOrigen.length && <tr><td colSpan={5} className="py-3 text-center text-neutral-400">Todavía no hay visitas medidas.</td></tr>}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-neutral-400">El origen es el de la primera visita de cada persona. Instagram y Facebook abiertos desde su app cuentan como esa app.</p>
          </div>

          {datos.porDia.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-neutral-500">
                  <tr>
                    <th className="py-1.5 text-left font-medium">Día</th>
                    <th className="py-1.5 text-right font-medium">Personas</th>
                    <th className="py-1.5 text-right font-medium">Desde el celular</th>
                    <th className="py-1.5 text-right font-medium">Empezaron</th>
                    <th className="py-1.5 text-right font-medium">Enviaron</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.porDia.map(d => (
                    <tr key={d.dia} className="border-t border-neutral-100">
                      <td className="py-1.5">{ddmm(d.dia)}</td>
                      <td className="py-1.5 text-right num">{d.personas}</td>
                      <td className="py-1.5 text-right num text-neutral-500">{pct(d.movil, d.personas)}</td>
                      <td className="py-1.5 text-right num">{d.empezaron}</td>
                      <td className="py-1.5 text-right num font-medium">{d.enviaron}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
