import { connection } from 'next/server'
import { dbGlobal } from '@/lib/db'
import { currentDate } from '@/lib/tz'
import { COMUNIDAD_TELEGRAM, RADAR_CIFRAS, TELEGRAM_DESPEGUE, fechaLarga, type GrupoDespegue } from '@/lib/despegue'

export const metadata = {
  title: { absolute: 'El Comerciante Digital · MercadoLibre Venezuela' },
  description: 'Herramientas y acompañamiento para vender en MercadoLibre Venezuela: automatizaciones, pagos de MercadoEnvíos, '
    + 'inventario, Radar de Oportunidades y el Programa Despegue.',
}

// Página de inicio pública de elcomerciantedigital.com (21-10-2026; sin login, ver proxy.ts; nginx sirve la raíz con
// esta página). Qué hacemos, la prueba gratis de 15 días (26-10, /registro), el Programa Despegue y cómo contactarnos.
// Sin precios del sistema ni correo: el contacto es por Telegram e Instagram (decisión del dueño).

const INSTAGRAM = 'https://www.instagram.com/comerciantedigital.ve/'
const LOGIN = 'https://app.elcomerciantedigital.com/login'
const REGISTRO = 'https://app.elcomerciantedigital.com/registro'   // prueba gratis de 15 días (26-10)

// Íconos de trazo (24×24).
const I = {
  rayo: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  pago: 'M3 7h18v10H3zM3 10h18M7 15h3',
  caja: 'M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
  radar: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0-1 6-6',
  enviar: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  cohete: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5',
  check: 'M20 6 9 17l-5-5',
  grupo: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  camara: 'M3 7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zm9 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm5.5-9.5h.01',
}
function Icono({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const HACEMOS = [
  { t: 'Automatizaciones', i: I.rayo, d: 'Lo que te quita el día, resuelto en un solo lugar para todas tus cuentas.',
    x: ['Preguntas con respuesta sugerida por IA', 'Mensajes de tus ventas, sin perder ninguno', 'Calificaciones en bloque', 'Guías del día y manifiesto de envíos', 'Avisos por Telegram'] },
  { t: 'Pagos MercadoEnvíos', i: I.pago, nuevo: true, d: 'Los pagos y las guías del portal llegan solos, listos para verificar.',
    x: ['Pagos y comprobantes traídos solos', 'Comprobación con tu estado de cuenta del banco', 'Las guías pasan directo a despachos'] },
  { t: 'Inventario', i: I.caja, d: 'Tu stock y tus ventas al día, sin cuaderno ni Excel.',
    x: ['Stock, ventas y compras', 'Márgenes reales con comisión y envío', 'Publicaciones de ML unidas a tus productos'] },
  { t: 'Radar de Oportunidades', i: I.radar, d: 'Qué se vende en MercadoLibre Venezuela, a qué precio real y qué está creciendo.',
    x: ['Lo más vendido, categoría por categoría', 'Tendencias validadas con Google Trends', 'Competencia y señales de demanda'] },
]

export default async function InicioPage() {
  await connection()
  const { rows: [g] } = await dbGlobal().query<GrupoDespegue>(
    `SELECT id, nombre, cupos, tomados, to_char(inicio, 'YYYY-MM-DD') AS inicio, to_char(aparta_hasta, 'YYYY-MM-DD') AS aparta_hasta
     FROM despegue_grupos WHERE actual ORDER BY id DESC LIMIT 1`).catch(() => ({ rows: [] as GrupoDespegue[] }))
  const hoy = currentDate('America/Caracas')
  const quedan = g ? Math.max(0, g.cupos - g.tomados) : null
  const abierto = !!g && quedan! > 0 && hoy <= g.aparta_hasta
  const anio = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-neutral-50">
      <style>{'html { scroll-behavior: smooth; }'}</style>

      {/* ── Barra ── */}
      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <span className="text-sm font-semibold tracking-tight text-white">El Comerciante <span className="text-lime-400">Digital</span></span>
          <a href={LOGIN} className="rounded-lg border border-white/20 px-3.5 py-1.5 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/5">Entrar</a>
        </div>
      </header>

      {/* ── Portada ── */}
      <section className="relative overflow-hidden bg-neutral-950 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full border border-lime-400/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-[24rem] w-[24rem] rounded-full border border-lime-400/20" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-[14rem] w-[14rem] rounded-full bg-lime-400/10 blur-2xl" />
        <div className="relative mx-auto max-w-5xl px-5 pb-14 pt-24 sm:px-8 sm:pb-20 sm:pt-28">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-400">MercadoLibre Venezuela</p>
          <h1 className="mt-3 max-w-3xl text-[2.1rem] font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Herramientas y acompañamiento para <span className="text-lime-400">vender más en MercadoLibre.</span>
          </h1>
          <p className="mt-5 max-w-2xl leading-relaxed text-neutral-400 lg:text-lg">
            Automatizamos lo que te quita el día (preguntas, mensajes, guías y pagos) y te ayudamos a encontrar qué vender.
            Lo construimos para nuestras propias cuentas y hoy lo usan otros vendedores.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href={REGISTRO} className="inline-flex items-center gap-2 rounded-xl bg-lime-400 px-5 py-3 text-sm font-semibold text-neutral-950 shadow-[0_8px_30px_-8px_rgba(163,230,53,0.6)] transition hover:bg-lime-300">
              <Icono d={I.rayo} className="h-4 w-4" /> Prueba 15 días gratis
            </a>
            <a href="/despegue" className="inline-flex items-center gap-2 rounded-xl border border-lime-400/50 px-5 py-3 text-sm font-semibold text-lime-400 transition hover:border-lime-400 hover:bg-lime-400/10">
              <Icono d={I.cohete} className="h-4 w-4" /> Programa Despegue
            </a>
            <a href={`https://t.me/${TELEGRAM_DESPEGUE}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-lime-400/50 px-5 py-3 text-sm font-semibold text-lime-400 transition hover:border-lime-400 hover:bg-lime-400/10">
              <Icono d={I.enviar} className="h-4 w-4" /> Escríbenos por Telegram
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-400">
            <li className="flex items-center gap-2"><Icono d={I.grupo} className="h-4 w-4 text-lime-400" /><b className="text-white">+10</b> vendedores usando el sistema</li>
            <li className="flex items-center gap-2"><Icono d={I.radar} className="h-4 w-4 text-lime-400" /><b className="text-white">+45.000</b> productos en el Radar</li>
            <li className="flex items-center gap-2"><Icono d={I.check} className="h-4 w-4 text-lime-400" />Lo usamos en nuestras cuentas cada día</li>
          </ul>
        </div>
      </section>

      <main className="mx-auto max-w-5xl space-y-12 px-5 py-10 sm:space-y-14 sm:px-8 sm:py-14">
        {/* ── Destacado: Programa Despegue ── */}
        <section className="relative overflow-hidden rounded-3xl border border-lime-400/50 bg-neutral-950 p-6 text-white shadow-[0_0_70px_-25px_rgba(163,230,53,0.55)] sm:p-9">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full border border-lime-400/20" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-lime-400/10 blur-2xl" />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-lime-400 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-950">
                <Icono d={I.cohete} className="h-3.5 w-3.5" /> {abierto ? 'Inscripciones abiertas' : 'Programa en curso'}
              </p>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Programa Despegue</h2>
              <p className="mt-2 leading-relaxed text-neutral-400">
                8 semanas acompañado para <b className="text-white">empezar desde cero o reactivar tu cuenta</b>: reunión en vivo cada
                semana, sesiones 1 a 1 y grupo de Telegram. <b className="text-lime-400">Bono: Domingo de Radar.</b>
              </p>
              <a href="/despegue" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-lime-400 px-5 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-lime-300">
                Conocer el programa <span aria-hidden="true">→</span>
              </a>
            </div>
            {g && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm">
                <p className="flex justify-between gap-4 text-neutral-300"><span>Empieza</span><b className="text-right text-white">{fechaLarga(g.inicio)}</b></p>
                <div className="mt-4 flex gap-1.5" aria-label={`${g.tomados} de ${g.cupos} cupos tomados`}>
                  {Array.from({ length: g.cupos }, (_, k) => (
                    <span key={k} className={`h-2.5 flex-1 rounded-full ${k < g.tomados ? 'bg-lime-400' : 'bg-white/10'}`} />
                  ))}
                </div>
                <p className="mt-2 text-xs text-neutral-400">
                  {quedan! > 0 ? <>Quedan <b className="text-white">{quedan} de {g.cupos}</b> cupos</> : <b className="text-white">Cupos completos</b>}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── Lo que hacemos ── */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-700">Lo que hacemos</p>
          <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Todo lo que hoy ya funciona.</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 sm:gap-4">
            {HACEMOS.map(h => (
              <li key={h.t} className="rounded-2xl border border-neutral-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lime-100 text-lime-800"><Icono d={h.i} /></span>
                  <p className="font-semibold text-neutral-900">{h.t}</p>
                  {h.nuevo && <span className="rounded-full bg-lime-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-950">Nuevo</span>}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-neutral-500">{h.d}</p>
                <ul className="mt-3 space-y-1.5">
                  {h.x.map(x => (
                    <li key={x} className="flex gap-2 text-sm text-neutral-700">
                      <Icono d={I.check} className="mt-0.5 h-4 w-4 shrink-0 text-lime-600" />{x}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        {/* ── El Radar en números ── */}
        <section className="rounded-3xl bg-neutral-950 p-6 text-white sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-400">Radar de Oportunidades</p>
          <h2 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">El mercado completo, con datos reales.</h2>
          <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            {RADAR_CIFRAS.map(x => (
              <li key={x.d}>
                <p className="text-2xl font-semibold tracking-tight text-lime-400 sm:text-3xl">{x.n}</p>
                <p className="mt-0.5 text-xs leading-snug text-neutral-400">{x.d}</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-neutral-500">Datos actualizados cada mes.</p>
        </section>

        {/* ── Trayectoria ── */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-700">Trayectoria</p>
          <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Paso a paso, con vendedores reales.</h2>
          <ol className="mt-5 grid gap-3 sm:grid-cols-3 sm:gap-4">
            <li className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-lime-700"><Icono d={I.check} className="h-4 w-4" /> Concluido</p>
              <p className="mt-2 font-semibold text-neutral-900">Programa Fundadores</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-500">Los primeros vendedores que usaron el sistema con nosotros y nos ayudaron a mejorarlo.</p>
            </li>
            <li className="rounded-2xl border border-lime-300 bg-lime-50 p-5">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-lime-800">
                <span className="relative flex h-2 w-2" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-lime-500" /></span>
                En curso
              </p>
              <p className="mt-2 font-semibold text-neutral-900">Programa Despegue</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">8 semanas para empezar o reactivar tu cuenta, con el Radar cada domingo.</p>
            </li>
            <li className="rounded-2xl border border-lime-300 bg-lime-50 p-5">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-lime-800">
                <span className="relative flex h-2 w-2" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-lime-500" /></span>
                Abierto
              </p>
              <p className="mt-2 font-semibold text-neutral-900">Prueba gratis de 15 días</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">Crea tu cuenta, conecta MercadoLibre y prueba todo con tus propias ventas.</p>
              <a href={REGISTRO} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-lime-800 underline underline-offset-2">Empezar <span aria-hidden="true">→</span></a>
            </li>
          </ol>
        </section>

        {/* ── Contacto ── */}
        <section id="contacto" className="scroll-mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-700">Contacto</p>
          <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Hablemos.</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-3 sm:gap-4">
            {[
              { t: 'Telegram', s: `@${TELEGRAM_DESPEGUE}`, h: `https://t.me/${TELEGRAM_DESPEGUE}`, i: I.enviar, d: 'Escríbenos directo' },
              { t: 'Comunidad de Vendedores', s: 'Grupo de Telegram', h: COMUNIDAD_TELEGRAM, i: I.grupo, d: 'Novedades y próximas etapas' },
              { t: 'Instagram', s: '@comerciantedigital.ve', h: INSTAGRAM, i: I.camara, d: 'Síguenos' },
            ].map(c => (
              <li key={c.t}>
                <a href={c.h} target="_blank" rel="noreferrer"
                  className="flex h-full items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-lime-400 hover:shadow-sm">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-neutral-950 text-lime-400"><Icono d={c.i} /></span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-neutral-900">{c.t}</span>
                    <span className="block truncate text-sm text-lime-700">{c.s}</span>
                    <span className="block text-xs text-neutral-500">{c.d}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-400">
        © {anio} El Comerciante Digital · <a href={LOGIN} className="hover:text-neutral-700">Entrar</a>
      </footer>
    </div>
  )
}
