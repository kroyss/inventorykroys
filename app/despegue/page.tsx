import { connection } from 'next/server'
import { dbGlobal } from '@/lib/db'
import { currentDate } from '@/lib/tz'
import {
  COMUNIDAD_TELEGRAM, PRECIO, PRECIO_DESPUES, SEMANAS, TELEGRAM_DESPEGUE, fechaCorta, fechaLarga, type GrupoDespegue,
} from '@/lib/despegue'
import { BotonCupo, MedirVista, VideoSerie } from '@/components/despegue/DespegueCliente'

export const metadata = {
  title: 'Programa Despegue',
  description: 'De 0 ventas y reputación gris a 11 ventas, reputación verde y MercadoEnvíos gratis activo, en 35 días. '
    + '8 semanas de acompañamiento para vender en MercadoLibre Venezuela, empieces de cero o ya tengas cuenta. Solo 8 cupos.',
}

// Íconos de trazo (24×24).
const INCLUYE = [
  { t: 'Reunión en vivo cada semana', s: '60 min por Meet',
    d: 'El tema de la semana y revisión de cuentas en vivo: aprendes también de los casos de los demás.',
    i: 'M15 10l4.6-2.3A1 1 0 0 1 21 8.6v6.8a1 1 0 0 1-1.4.9L15 14M5 18h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z' },
  { t: 'Domingo de Radar', s: '24 horas de acceso completo',
    d: 'Cada domingo del programa, nuestro Radar de MercadoLibre abierto para ti: qué se vende, a qué precio y con cuánta competencia.',
    i: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0-1 6-6' },
  { t: '3 sesiones solo para ti', s: '45 min cada una, 1 a 1',
    d: 'Diagnóstico de tu cuenta al inicio, revisión a mitad del programa y tu plan de cierre.',
    i: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1' },
  { t: 'Grupo de Telegram', s: 'con los demás del programa',
    d: 'Para tus dudas de la semana y para compartir avances con gente que está en lo mismo que tú.',
    i: 'M7 8h10M7 12h6m-9 8 3-3h11a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12z' },
  { t: 'Tareas semanales', s: 'claras y cortas',
    d: 'Lo que tienes que hacer en tu cuenta cada semana para avanzar, sin perderte.',
    i: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9' },
]

const PARA_TI = [
  'Quieres empezar a vender en MercadoLibre y no sabes por dónde.',
  'Tienes una cuenta con publicaciones pero vendes poco, o está parada, y quieres saber qué corregir.',
  'Quieres hacerlo con método, no a prueba y error.',
]

// El Radar en números (21-10, de su base: 44.565 productos antes de la corrida de noviembre, 320 categorías,
// 2.514 búsquedas en tendencia, 1.143 con interés en Google Trends; la actividad se mide en todo el catálogo).
const RADAR = [
  { n: '+45.000', d: 'productos de MercadoLibre Venezuela' },
  { n: '+320', d: 'categorías' },
  { n: '+2.500', d: 'búsquedas en tendencia: las que más crecen y las más populares' },
  { n: '+1.100', d: 'tendencias validadas con Google Trends' },
  { n: '+45.000', d: 'productos con su actividad medida: si suben o se apagan' },
]

// Página pública del Programa Despegue (sin login; ver proxy.ts). El grupo y sus cupos salen de despegue_grupos
// (migración 112) y se leen en cada visita: el dueño sube "tomados" en Plataforma cuando alguien paga.
export default async function DespeguePage() {
  await connection()
  const { rows: [g] } = await dbGlobal().query<GrupoDespegue>(
    `SELECT id, nombre, cupos, tomados, to_char(inicio, 'YYYY-MM-DD') AS inicio, to_char(aparta_hasta, 'YYYY-MM-DD') AS aparta_hasta
     FROM despegue_grupos WHERE actual ORDER BY id DESC LIMIT 1`)
  const hoy = currentDate('America/Caracas')
  const cupos = g?.cupos ?? 8
  const tomados = Math.min(g?.tomados ?? 0, cupos)
  const quedan = cupos - tomados
  const completo = quedan <= 0
  const cerrado = !g || hoy > g.aparta_hasta
  const abierto = !completo && !cerrado
  const inicio = g?.inicio ?? SEMANAS[0].fecha
  const anio = new Date().getFullYear()

  const oscuro = true
  const cuposBarra = () => (
    <div>
      <div className="flex gap-1.5" aria-label={`${tomados} de ${cupos} cupos tomados`}>
        {Array.from({ length: cupos }, (_, i) => (
          <span key={i} className={`h-2.5 flex-1 rounded-full ${i < tomados ? 'bg-lime-400' : oscuro ? 'bg-white/10' : 'bg-neutral-200'}`} />
        ))}
      </div>
      <p className={`mt-2 text-xs ${oscuro ? 'text-neutral-400' : 'text-neutral-500'}`}>
        {completo ? <b className={oscuro ? 'text-white' : 'text-neutral-900'}>Cupos completos</b>
          : <>Quedan <b className={oscuro ? 'text-white' : 'text-neutral-900'}>{quedan} de {cupos}</b> cupos</>}
      </p>
    </div>
  )

  // Con cupos y en plazo: apartar. Lleno o cerrado: lista de espera (igual por Telegram).
  const accion = (grande = false, className = '') => abierto
    ? <BotonCupo grande={grande} className={className} />
    : <BotonCupo grande={grande} className={className} texto="Anotarme para el próximo grupo" />

  return (
    <div className="min-h-screen bg-neutral-50 pb-24 sm:pb-0">
      <MedirVista />
      <style>{'html { scroll-behavior: smooth; }'}</style>

      {/* ── Portada ── */}
      <section className="relative overflow-hidden bg-neutral-950 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full border border-lime-400/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-[24rem] w-[24rem] rounded-full border border-lime-400/20" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-[14rem] w-[14rem] rounded-full bg-lime-400/10 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-32 h-[22rem] w-[22rem] rounded-full bg-lime-400/[0.06] blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-5 pb-14 pt-10 sm:px-8 sm:pb-20 sm:pt-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-400">
            🚀 Programa Despegue <span className="text-neutral-500">·</span> El Comerciante Digital
          </p>
          <div className="mt-4 grid items-center gap-10 lg:grid-cols-[1.25fr_1fr]">
            <div>
              {/* Corto a propósito (21-10): se lee de un vistazo; el detalle (gris → verde, envío gratis) va en "Esto lo hice yo". */}
              <h1 className="text-[2.25rem] font-semibold leading-[1.08] tracking-tight sm:text-6xl">
                De <span className="text-neutral-500">0</span> a <span className="text-lime-400">11 ventas</span> y reputación verde{' '}
                <span className="whitespace-nowrap">en <span className="text-lime-400">35 días</span>.</span>
              </h1>
              <p className="mt-5 leading-relaxed text-neutral-400 lg:text-lg">
                Lo hice con una cuenta desde cero, y lo grabé todo. En <b className="text-white">8 semanas</b> te enseño a hacer lo
                mismo con <b className="text-white">tu cuenta</b>, <b className="text-white">empieces de cero o ya tengas una</b>, acompañado de principio a fin.
              </p>
              <p className="mt-5 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-lime-400/30 bg-lime-400/[0.07] px-4 py-1.5 text-sm">
                <span className="font-semibold text-lime-400">Empieza el {fechaLarga(inicio)}</span>
                <span className="text-neutral-500">·</span>
                <span className="text-neutral-300">solo {cupos} cupos</span>
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                {accion(true)}
                <a href="#video" className="text-sm font-medium text-neutral-300 underline-offset-4 hover:text-white hover:underline">
                  Ver la prueba en video ↓
                </a>
              </div>
              <div className="mt-6 max-w-sm">{cuposBarra()}</div>
            </div>

            {/* Lo que te llevas (21-10, en lugar del cuadro día 1 → día 35, que repetía el título): el Domingo de Radar con
                sus cifras + el resto en una línea. Cifras redondeadas hacia abajo: revisarlas con cada corrida mensual del Radar. */}
            <div className="relative overflow-hidden rounded-2xl border border-lime-400/25 bg-white/[0.03] p-5 backdrop-blur sm:p-6">
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full border border-lime-400/15" />
              <p className="relative text-[11px] font-semibold uppercase tracking-[0.18em] text-lime-400">🎯 Domingo de Radar</p>
              <p className="relative mt-1 text-sm text-neutral-300">Cada domingo, <b className="text-white">24 h de acceso completo</b> para elegir qué vender con datos.</p>
              <ul className="relative mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
                {RADAR.map((x, k) => (
                  <li key={x.d} className={k === RADAR.length - 1 ? 'col-span-2 border-t border-white/10 pt-4' : ''}>
                    <p className="text-2xl font-semibold tracking-tight text-lime-400 sm:text-3xl">{x.n}</p>
                    <p className="mt-0.5 text-xs leading-snug text-neutral-400">{x.d}</p>
                  </li>
                ))}
              </ul>
              <p className="relative mt-5 border-t border-white/10 pt-4 text-xs leading-relaxed text-neutral-400">
                <span className="text-white">+</span> reunión semanal de 60 min · 3 sesiones 1 a 1 de 45 min · grupo de Telegram
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── La prueba ── */}
      <section id="video" className="scroll-mt-4 bg-neutral-900 text-white">
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-400">Esto lo hice yo</p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">No te lo cuento: te lo muestro.</h2>
            <p className="mt-4 leading-relaxed text-neutral-400">
              Abrí una cuenta desde cero, sin ventas y con reputación gris. A los <b className="text-white">7 días</b> tuve la primera
              venta. A los <b className="text-white">35 días</b> ya tenía <b className="text-white">11 ventas</b>, reputación verde y
              MercadoEnvíos con envío gratis activo. Lo grabé todo, episodio por episodio.
            </p>
            <p className="mt-3 leading-relaxed text-neutral-400">
              En Despegue te enseño a hacer lo mismo, <b className="text-white">paso a paso y con tu cuenta</b>.
            </p>
          </div>
          <VideoSerie />
        </div>
      </section>

      <main className="mx-auto max-w-5xl space-y-16 px-5 py-14 sm:px-8 sm:py-20">
        {/* ── Para quién ── */}
        <section className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-lime-200 bg-lime-50 p-6">
            <h2 className="text-lg font-semibold text-neutral-900">Es para ti si…</h2>
            <ul className="mt-4 space-y-3">
              {PARA_TI.map(x => (
                <li key={x} className="flex gap-3 text-sm text-neutral-700">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-lime-500 text-[11px] font-bold text-white">✓</span>
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-neutral-900">No es para ti si…</h2>
            <p className="mt-4 flex gap-3 text-sm text-neutral-600">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neutral-200 text-[11px] font-bold text-neutral-600">✕</span>
              Buscas ganar dinero sin trabajar en tu cuenta. Cada semana hay tareas.
            </p>
          </div>
        </section>

        {/* ── Qué incluye ── */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-700">Qué incluye</p>
          <h2 className="mt-2 text-2xl font-semibold text-neutral-900 sm:text-3xl">Acompañado, no solo con un curso.</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INCLUYE.map((x, k) => (
              <li key={x.t} className={`rounded-2xl border p-5 ${k === 1 ? 'border-neutral-900 bg-neutral-950 text-white sm:col-span-2 lg:col-span-1' : 'border-neutral-200 bg-white'}`}>
                <span className={`grid h-10 w-10 place-items-center rounded-full ${k === 1 ? 'bg-lime-400 text-neutral-950' : 'bg-lime-100 text-lime-800'}`} aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={x.i} /></svg>
                </span>
                <p className={`mt-4 font-semibold ${k === 1 ? 'text-white' : 'text-neutral-900'}`}>{x.t}</p>
                <p className={`text-xs font-medium ${k === 1 ? 'text-lime-400' : 'text-lime-700'}`}>{x.s}</p>
                <p className={`mt-2 text-sm leading-relaxed ${k === 1 ? 'text-neutral-400' : 'text-neutral-500'}`}>{x.d}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Las 8 semanas ── */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-700">El camino</p>
          <h2 className="mt-2 text-2xl font-semibold text-neutral-900 sm:text-3xl">Las 8 semanas</h2>
          <p className="mt-2 text-sm text-neutral-600">
            <b className="text-neutral-900">¿Empiezas de cero?</b> Construyes cada etapa desde el principio.{' '}
            <b className="text-neutral-900">¿Ya tienes cuenta?</b> En cada etapa revisamos lo que tienes y corregimos lo que te frena.
          </p>
          <p className="mt-1 text-sm text-neutral-500">Cada domingo: Radar abierto todo el día y la tarea de la semana. La reunión, en la semana.</p>
          <ol className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {SEMANAS.map(s => (
              <li key={s.fecha} className={`flex items-center gap-4 border-b border-neutral-100 px-4 py-3.5 last:border-b-0 sm:px-5 ${s.n == null ? 'bg-neutral-50' : ''}`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                  s.n == null ? 'bg-white text-base ring-1 ring-neutral-200' : s.n === 1 ? 'bg-lime-400 text-neutral-950' : 'bg-neutral-900 text-white'}`}>
                  {s.n ?? '🎄'}
                </span>
                <span className={`min-w-0 flex-1 text-sm ${s.n == null ? 'italic text-neutral-500' : 'font-medium text-neutral-900'}`}>
                  {s.n === 1 ? <>Inicio: bienvenida · {s.tema}</> : s.tema}
                  {s.n == null && <span className="block text-xs not-italic text-neutral-400">Sin reunión · el grupo sigue activo</span>}
                </span>
                <span className="shrink-0 text-xs font-medium tabular-nums text-neutral-500">{fechaCorta(s.fecha)}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Inversión ── */}
        <section id="cupo" className="scroll-mt-4">
          <div className="relative overflow-hidden rounded-3xl bg-neutral-950 p-6 text-white sm:p-10">
            <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-lime-400/10 blur-3xl" />
            <div className="relative grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-400">Inversión · primer grupo</p>
                <p className="mt-3 flex items-baseline gap-3">
                  <span className="text-5xl font-semibold tracking-tight sm:text-6xl">${PRECIO}</span>
                  <span className="text-lg text-neutral-500 line-through">${PRECIO_DESPUES}</span>
                </p>
                <p className="mt-2 text-neutral-400">Precio de lanzamiento para este primer grupo: después será <b className="text-white">${PRECIO_DESPUES}</b>.</p>
                <p className="mt-1 text-neutral-400"><b className="text-white">Pago único</b>: las 8 semanas completas.</p>
                <p className="mt-4 text-sm font-medium text-lime-300">El cupo se aparta con el pago.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <ul className="space-y-2.5 text-sm text-neutral-300">
                  <li className="flex justify-between gap-4"><span>Apartas tu cupo hasta</span><b className="text-right text-white">{g ? fechaLarga(g.aparta_hasta) : '—'}</b></li>
                  <li className="flex justify-between gap-4"><span>Inicio</span><b className="text-right text-white">{fechaLarga(inicio)}</b></li>
                </ul>
                <p className="mt-2 text-xs text-neutral-500">o hasta que se llenen los {cupos} cupos.</p>
                <div className="mt-5">{cuposBarra()}</div>
                <div className="mt-5">{accion(true, 'w-full')}</div>
                <p className="mt-3 text-center text-xs text-neutral-500">
                  {abierto ? <>Te responde <b className="text-neutral-300">@{TELEGRAM_DESPEGUE}</b> con los datos de pago.</>
                    : completo ? 'Este grupo ya se llenó: escríbenos y te avisamos del próximo.'
                    : 'Las inscripciones de este grupo cerraron: escríbenos y te avisamos del próximo.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <p className="mx-auto max-w-2xl text-center text-xs leading-relaxed text-neutral-400">
          No prometemos una cantidad de ventas: eso depende de tu producto, tu capital y tu trabajo. Lo que sí te damos es el
          método que a nosotros nos funcionó y acompañamiento real durante 8 semanas.
        </p>
      </main>

      <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-400">
        <a href={COMUNIDAD_TELEGRAM} target="_blank" rel="noreferrer" className="font-medium text-neutral-500 hover:text-neutral-800">Comunidad de Vendedores en Telegram</a>
        <span className="mx-2">·</span>© {anio} El Comerciante Digital
      </footer>

      {/* En celular, el botón siempre a mano (la mayoría entra desde el teléfono). */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-neutral-950/95 px-4 py-3 backdrop-blur sm:hidden">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-xs leading-tight text-neutral-400">
            {abierto ? <><b className="block text-sm text-white">Quedan {quedan} cupos</b>Empieza el {fechaCorta(inicio)}</>
              : <><b className="block text-sm text-white">{completo ? 'Cupos completos' : 'Inscripción cerrada'}</b>Próximo grupo</>}
          </p>
          <BotonCupo texto={abierto ? 'Apartar mi cupo' : 'Anotarme'} />
        </div>
      </div>
    </div>
  )
}
