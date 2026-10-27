import { TELEGRAM_DESPEGUE } from '@/lib/despegue'
import {
  CUENTA_EXTRA, CUENTAS_INCLUIDAS, DESCUENTO_ANUAL, DESCUENTO_TRIMESTRAL, ESCALONES, PLANES, PRECIO_DESDE, RECARGA_IA,
} from '@/lib/planes'

export const metadata = {
  title: 'Planes y precios',
  description: `Herramientas para vender en MercadoLibre Venezuela desde $${PRECIO_DESDE}/mes: preguntas con IA, mensajes, guías ZOOM y TEALCA, `
    + 'pagos de MercadoEnvíos e inventario. Precio fijo en bolívares a tasa BCV, sin porcentaje de tus ventas. Prueba 15 días gratis.',
}

// Página pública de planes (27-10-2026; sin login, ver proxy.ts "precios$"). Los montos salen de lib/planes.ts.
// Mismo estilo que /inicio y /despegue. Vive en app.elcomerciantedigital.com (el dominio raíz solo deja pasar páginas
// puntuales en nginx): el inicio la enlaza con la dirección completa, como a /registro.

const REGISTRO = '/registro'
const INICIO = 'https://elcomerciantedigital.com'

const I = {
  rayo: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  check: 'M20 6 9 17l-5-5',
  enviar: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
}
function Icono({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const PREGUNTAS = [
  { p: '¿Cómo se cuentan las ventas?',
    r: 'Son las órdenes del mes de todas tus cuentas de MercadoLibre, sin las canceladas. Una compra de varios productos cuenta como una.' },
  { p: '¿Qué pasa si un mes vendo más?',
    r: 'Nada se bloquea. Si pasas dos meses seguidos por encima de tu escalón, pasas al siguiente; si bajas dos meses seguidos, también bajas.' },
  { p: '¿Qué son los créditos de IA?',
    r: `Cada respuesta que te propone la IA usa un crédito. Las respuestas rápidas y las parecidas no gastan. Si se te acaban, recargas ${RECARGA_IA.creditos} por $${RECARGA_IA.precio} y no vencen.` },
  { p: '¿Cómo pago?',
    r: 'En bolívares a tasa BCV del día. Sin permanencia: si un mes no sigues, no pagas el siguiente.' },
  { p: '¿Qué incluye la prueba gratis?',
    r: '15 días con preguntas, mensajes, calificaciones, guías y Pagos MercadoEnvíos, con tus propias ventas. Los días arrancan cuando conectas MercadoLibre.' },
]

export default function PreciosPage() {
  const anio = new Date().getFullYear()
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* ── Portada ── */}
      <section className="relative overflow-hidden bg-neutral-950 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full border border-lime-400/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-[24rem] w-[24rem] rounded-full border border-lime-400/20" />
        <div className="relative mx-auto max-w-5xl px-5 pb-12 pt-6 sm:px-8 sm:pb-16">
          <div className="flex items-center justify-between">
            <a href={INICIO} className="text-sm font-semibold tracking-tight text-white">El Comerciante <span className="text-lime-400">Digital</span></a>
            <a href="/login" className="rounded-lg border border-white/20 px-3.5 py-1.5 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/5">Entrar</a>
          </div>
          <p className="mt-12 text-xs font-semibold uppercase tracking-[0.2em] text-lime-400">Planes y precios</p>
          <h1 className="mt-3 max-w-3xl text-[2rem] font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Precio fijo, <span className="text-lime-400">sin porcentaje de tus ventas.</span>
          </h1>
          <p className="mt-4 max-w-2xl leading-relaxed text-neutral-400 lg:text-lg">
            Eliges el plan según las herramientas que usas, y el precio según cuánto vendes. En bolívares a tasa BCV del día.
          </p>
          <a href={REGISTRO} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-lime-400 px-5 py-3 text-sm font-semibold text-neutral-950 shadow-[0_8px_30px_-8px_rgba(163,230,53,0.6)] transition hover:bg-lime-300">
            <Icono d={I.rayo} className="h-4 w-4" /> Prueba 15 días gratis
          </a>
        </div>
      </section>

      <main className="mx-auto max-w-5xl space-y-12 px-5 py-10 sm:space-y-14 sm:px-8 sm:py-14">
        {/* ── Planes ── */}
        <section>
          <ul className="grid gap-4 lg:grid-cols-3">
            {PLANES.map(p => (
              <li key={p.id} className={`relative flex flex-col rounded-2xl border bg-white p-5 sm:p-6 ${p.destacado ? 'border-lime-400 shadow-[0_0_50px_-20px_rgba(163,230,53,0.7)]' : 'border-neutral-200'}`}>
                {p.destacado && (
                  <span className="absolute -top-3 left-5 rounded-full bg-lime-400 px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-950">Recomendado</span>
                )}
                <p className="text-lg font-semibold text-neutral-900">{p.nombre}</p>
                <p className="mt-1 text-sm text-neutral-500">{p.resumen}</p>
                <p className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-xs text-neutral-500">desde</span>
                  <span className="text-3xl font-semibold tracking-tight text-neutral-900">${ESCALONES[0].precios[p.id]}</span>
                  <span className="text-sm text-neutral-500">/mes</span>
                </p>
                {p.base && <p className="mt-4 text-sm font-medium text-neutral-900">{p.base}</p>}
                <ul className={`${p.base ? 'mt-2' : 'mt-4'} flex-1 space-y-2`}>
                  {p.incluye.map(x => (
                    <li key={x} className="flex gap-2 text-sm text-neutral-700">
                      <Icono d={I.check} className="mt-0.5 h-4 w-4 shrink-0 text-lime-600" />{x}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-neutral-100 pt-3 text-sm text-neutral-600">
                  <b className="text-neutral-900">{p.creditos} créditos de IA</b> al mes
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Precio según ventas ── */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-700">Precio según tus ventas</p>
          <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Pagas según cuánto vendes.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600">Ventas al mes de todas tus cuentas, sin las canceladas. Precio en dólares, pagadero en bolívares a tasa BCV.</p>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Ventas al mes</th>
                  {PLANES.map(p => <th key={p.id} className={`px-4 py-3 text-right font-medium ${p.destacado ? 'text-lime-800' : ''}`}>{p.nombre}</th>)}
                </tr>
              </thead>
              <tbody>
                {ESCALONES.map(e => (
                  <tr key={e.ventas} className="border-t border-neutral-100">
                    <td className="px-4 py-3 text-neutral-900">{e.ventas}{e.nombre && <span className="ml-2 rounded-full bg-lime-100 px-2 py-0.5 text-[11px] font-semibold text-lime-800">{e.nombre}</span>}</td>
                    {PLANES.map(p => (
                      <td key={p.id} className={`px-4 py-3 text-right font-semibold tabular-nums ${p.destacado ? 'bg-lime-50/60 text-neutral-900' : 'text-neutral-800'}`}>${e.precios[p.id]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Incluido y extras ── */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
            <p className="font-semibold text-neutral-900">Incluido en todos los planes</p>
            <ul className="mt-3 space-y-2">
              {[`${CUENTAS_INCLUIDAS} cuentas de MercadoLibre`, 'Usuarios ilimitados para tu equipo', 'Prueba gratis de 15 días', 'Sin permanencia'].map(x => (
                <li key={x} className="flex gap-2 text-sm text-neutral-700"><Icono d={I.check} className="mt-0.5 h-4 w-4 shrink-0 text-lime-600" />{x}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
            <p className="font-semibold text-neutral-900">Extras</p>
            <ul className="mt-3 space-y-2 text-sm text-neutral-700">
              <li className="flex justify-between gap-4"><span>Cuenta de MercadoLibre adicional</span><b className="whitespace-nowrap text-neutral-900">+${CUENTA_EXTRA}/mes</b></li>
              <li className="flex justify-between gap-4"><span>Recarga de {RECARGA_IA.creditos} créditos de IA (no vencen)</span><b className="whitespace-nowrap text-neutral-900">${RECARGA_IA.precio}</b></li>
              <li className="flex justify-between gap-4"><span>Pago trimestral</span><b className="whitespace-nowrap text-lime-700">−{DESCUENTO_TRIMESTRAL}%</b></li>
              <li className="flex justify-between gap-4"><span>Pago anual</span><b className="whitespace-nowrap text-lime-700">−{DESCUENTO_ANUAL}%</b></li>
            </ul>
          </div>
        </section>

        {/* ── Preguntas ── */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-700">Preguntas frecuentes</p>
          <ul className="mt-4 divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {PREGUNTAS.map(x => (
              <li key={x.p} className="p-5">
                <p className="font-medium text-neutral-900">{x.p}</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">{x.r}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Cierre ── */}
        <section className="rounded-3xl bg-neutral-950 p-6 text-white sm:p-9">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pruébalo con tus propias ventas.</h2>
          <p className="mt-2 text-neutral-400">15 días gratis. Al terminar, eliges tu plan.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={REGISTRO} className="inline-flex items-center gap-2 rounded-xl bg-lime-400 px-5 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-lime-300">
              <Icono d={I.rayo} className="h-4 w-4" /> Empezar mi prueba gratis
            </a>
            <a href={`https://t.me/${TELEGRAM_DESPEGUE}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-lime-400/50 px-5 py-3 text-sm font-semibold text-lime-400 transition hover:border-lime-400 hover:bg-lime-400/10">
              <Icono d={I.enviar} className="h-4 w-4" /> Tengo dudas
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-400">
        © {anio} El Comerciante Digital · <a href={INICIO} className="hover:text-neutral-700">Inicio</a> · <a href="/login" className="hover:text-neutral-700">Entrar</a>
      </footer>
    </div>
  )
}
