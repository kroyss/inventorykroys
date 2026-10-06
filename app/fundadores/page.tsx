import { connection } from 'next/server'
import { dbGlobal } from '@/lib/db'
import { currentDate } from '@/lib/tz'
import {
  RONDA_ACTUAL, TZ_FUNDADORES, diaResultados, diasInscripcion, fechaTanda, proximaInscripcion, tandaInscribiendo,
  type Tanda,
} from '@/lib/fundadores'
import FormularioFundadores from '@/components/fundadores/FormularioFundadores'

export const metadata = {
  title: 'Programa Fundadores',
  description: '15 cupos para vendedores de MercadoLibre Venezuela con movimiento real: un mes gratis, configuración y adiestramiento sin costo.',
}

// Lo que reciben los Fundadores además del mes gratis.
// Íconos de trazo (24×24): conversación, engranaje, birrete.
const BENEFICIOS = [
  { t: 'Atención personalizada', s: '1 a 1, por Telegram',
    d: 'M7 8h10M7 12h6m-9 8 3-3h11a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12z' },
  { t: 'Configuración', s: 'gratis, contigo',
    d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z' },
  { t: 'Adiestramiento', s: 'gratis, para ti',
    d: 'M22 9 12 4 2 9l10 5 10-5zM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5' },
]

const INCLUYE = [
  { t: 'Preguntas con IA', d: 'Las preguntas de todas tus cuentas en una bandeja, con la respuesta sugerida.' },
  { t: 'Mensajes de tus ventas', d: 'Los mensajes sin leer de todas tus cuentas, con notas para no olvidar ningún detalle.' },
  { t: 'Guías y despachos', d: 'Imprimes todas las guías del día de una vez, cada una identificada con tus productos para no confundir paquetes, y sacas el manifiesto de envíos para ZOOM o Tealca.' },
  { t: 'Reporte de guías', d: 'Cada comprador recibe su número de guía sin que lo escribas a mano.' },
  { t: 'Calificaciones', d: 'Calificas a tus compradores en bloque, no venta por venta.' },
  { t: 'Inventario (opcional)', d: 'Si quieres, también llevas tu stock y tus ventas al día, sin cuaderno ni Excel.' },
]

// Seleccionados de cada ronda, como se anunciaron en el grupo de Telegram (el @ es el que cada uno
// usa en Telegram, que no siempre coincide con el del formulario). Se muestran desde el día de resultados.
// Los seleccionados escriben ellos a la cuenta oficial (no se les escribe en frío: Telegram lo limita).
const TELEGRAM_OFICIAL = 'elcomerciantedigital'
const SELECCIONADOS: Record<number, { telegram: string; nombre: string }[]> = {
  1: [
    { telegram: 'repuestoschevypartes', nombre: 'Cristhian' },
    { telegram: 'Ruben', nombre: 'Rubenpico' },
    { telegram: 'Luisha21', nombre: 'Luisarnal' },
    { telegram: 'Businessbqto', nombre: 'Miguel' },
    { telegram: 'bacutone', nombre: 'Gerardo' },
  ],
}

// Página pública del Programa Fundadores (sin login; ver proxy.ts). Muestra las 2 tandas
// (5 + 10 = 15 pioneros; los cupos salen de fundadores_tandas) y el formulario. Lo de la base se lee en cada visita.
// ?vista=previa: muestra el formulario aunque la inscripción esté cerrada, sin poder enviarlo
// (para revisar cómo quedan las preguntas).
export default async function FundadoresPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const previa = (await searchParams).vista === 'previa'
  await connection()
  const { rows: tandas } = await dbGlobal().query<Tanda>(
    `SELECT t.numero, t.cupos, t.abierta, to_char(t.inscribe_desde, 'YYYY-MM-DD') AS inscribe_desde,
              to_char(t.inscribe_hasta, 'YYYY-MM-DD') AS inscribe_hasta,
            (SELECT COUNT(*)::int FROM fundadores_solicitudes s WHERE s.tanda = t.numero AND s.estado = 'aprobado') AS tomados
     FROM fundadores_tandas t WHERE t.ronda = $1 ORDER BY t.numero`, [RONDA_ACTUAL])
  const total = tandas.reduce((a, t) => a + t.cupos, 0)
  const tomados = tandas.reduce((a, t) => a + Math.min(t.tomados, t.cupos), 0)
  // "en dos rondas de 5" si son iguales; "en dos rondas (5 y 10)" si no.
  const cupos = tandas.map(t => t.cupos)
  const rondas = `${tandas.length === 2 ? 'dos' : tandas.length} rondas`
  const reparto = cupos.every(c => c === cupos[0]) ? `${rondas} de ${cupos[0]}` : `${rondas} (${cupos.join(' y ')})`
  const anio = new Date().getFullYear()
  const hoy = currentDate(TZ_FUNDADORES)
  const abiertaHoy = tandaInscribiendo(tandas, hoy)
  const proxima = proximaInscripcion(tandas, hoy)
  const destacada = (abiertaHoy ?? proxima)?.numero      // la que inscribe hoy o, si no, la próxima en abrir
  // La última ronda con resultados ya anunciados y lista de seleccionados.
  const anunciada = [...tandas].reverse().find(t => SELECCIONADOS[t.numero] && (diaResultados(t) ?? '9999') <= hoy)
  const siguiente = anunciada && tandas.find(t => t.numero === anunciada.numero + 1)

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Portada */}
      <section className="relative overflow-hidden bg-neutral-950 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 w-[34rem] h-[34rem] rounded-full border border-lime-400/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 w-[24rem] h-[24rem] rounded-full border border-lime-400/20" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 w-[14rem] h-[14rem] rounded-full bg-lime-400/10 blur-2xl" />

        <div className="relative max-w-5xl mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-14 sm:pb-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-400">
              Programa Fundadores <span className="text-neutral-500">·</span> El Comerciante Digital
            </p>
            <h1 className="mt-3 text-4xl sm:text-5xl font-semibold leading-[1.1] tracking-tight">
              Sé uno de los <span className="text-lime-400">{total} primeros.</span>
            </h1>
            <p className="mt-4 text-neutral-400 leading-relaxed">
              Abrimos el sistema con el que manejamos nuestras propias cuentas de MercadoLibre a{' '}
              {total} vendedores con movimiento real, en {reparto}, con <b className="text-white">un mes gratis</b> para
              usarlo de verdad. Cada ronda tiene <b className="text-white">días fijos para postularse</b> y la selección
              se anuncia al día siguiente del cierre. Después decides si te quedas.
            </p>
            {/* Beneficios: sin caja (las cajas son de las tandas), ícono + título + bajada */}
            <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Solo para Fundadores</p>
            <ul className="mt-3 grid gap-4 sm:grid-cols-3 sm:gap-6">
              {BENEFICIOS.map(x => (
                <li key={x.t} className="flex items-center gap-3">
                  <span className="grid place-items-center w-10 h-10 shrink-0 rounded-full bg-lime-400 text-neutral-950" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={x.d} />
                    </svg>
                  </span>
                  <span className="leading-tight">
                    <span className="block text-sm font-semibold text-white">{x.t}</span>
                    <span className="block text-xs text-neutral-400 mt-0.5">{x.s}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Tandas */}
          <div className="mt-10 grid gap-3 sm:grid-cols-2 max-w-2xl">
            {tandas.map(t => {
              const llena = t.tomados >= t.cupos
              const actual = t.numero === destacada
              const cerro = !!t.inscribe_desde && (t.inscribe_hasta ?? t.inscribe_desde) < hoy
              const estado = llena ? 'Completa'
                : t.numero === abiertaHoy?.numero ? 'Postulaciones abiertas'
                : !t.abierta ? 'Cerrada'
                : cerro ? 'Postulaciones cerradas'
                : 'Próxima'
              const dias = diasInscripcion(t)
              const res = diaResultados(t)
              return (
                <div key={t.numero} className={`rounded-xl border p-4 ${actual ? 'border-lime-400/50 bg-lime-400/[0.07]' : 'border-white/10 bg-white/[0.03]'}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold">Ronda {t.numero}</span>
                    <span className={`text-xs font-medium ${actual ? 'text-lime-400' : 'text-neutral-500'}`}>{estado}</span>
                  </div>
                  {dias && (
                    <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
                      Postulaciones: <span className="text-neutral-200">{dias}</span>
                      {res && <><br />Seleccionados: <span className="text-neutral-200">{fechaTanda(res)}</span></>}
                    </p>
                  )}
                  <div className="mt-3 flex gap-1.5" aria-label={`${t.tomados} de ${t.cupos} cupos tomados`}>
                    {Array.from({ length: t.cupos }, (_, i) => (
                      <span key={i} className={`h-2.5 flex-1 rounded-full ${i < t.tomados ? 'bg-lime-400' : 'bg-white/10'}`} />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">{t.cupos} cupos · {Math.min(t.tomados, t.cupos)} tomados</p>
                </div>
              )
            })}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <a href="#solicitud" className="inline-flex items-center gap-2 bg-lime-400 text-neutral-950 px-5 py-3 rounded-lg text-sm font-semibold hover:bg-lime-300 transition-colors">
              {abiertaHoy ? 'Postúlate' : 'Ver el formulario'} <span aria-hidden="true">↓</span>
            </a>
            <span className="text-xs text-neutral-500">{tomados} de {total} pioneros confirmados</span>
          </div>
        </div>
      </section>

      {/* Seleccionados de la última ronda anunciada: qué tienen que hacer y qué pasa con el resto */}
      {anunciada && (
        <section className="bg-lime-50 border-b border-lime-200">
          <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 grid gap-6 lg:grid-cols-[1fr_1.15fr] items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lime-800">Resultados · Ronda {anunciada.numero}</p>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-900">🎉 ¡Ya están los seleccionados!</h2>
              <p className="mt-2 text-sm text-neutral-600">Gracias a todos los que se postularon. La respuesta fue increíble.</p>
              <ul className="mt-4 space-y-1.5">
                {SELECCIONADOS[anunciada.numero].map(x => (
                  <li key={x.telegram} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-lime-600 shrink-0" />
                    <span className="font-semibold text-neutral-900">@{x.telegram}</span>
                    <span className="text-neutral-500">({x.nombre})</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl bg-white border border-lime-300 p-4">
                <p className="text-sm font-semibold text-neutral-900">👉 ¿Quedaste seleccionado?</p>
                <p className="mt-1 text-sm text-neutral-600">
                  Escríbenos por privado a{' '}
                  <a href={`https://t.me/${TELEGRAM_OFICIAL}`} target="_blank" rel="noreferrer" className="font-semibold text-lime-800 underline underline-offset-2">@{TELEGRAM_OFICIAL}</a>{' '}
                  para darte tu acceso.
                </p>
                <a href={`https://t.me/${TELEGRAM_OFICIAL}`} target="_blank" rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 bg-neutral-950 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-neutral-800 transition-colors">
                  Escribir por Telegram <span aria-hidden="true">→</span>
                </a>
              </div>
              {siguiente && (
                <div className="rounded-xl bg-white border border-neutral-200 p-4 text-sm text-neutral-600 space-y-2">
                  <p>
                    <b className="text-neutral-900">¿Te postulaste y no quedaste esta vez?</b> Tu postulación <b className="text-neutral-900">sigue participando en la Ronda {siguiente.numero}</b>:
                    no tienes que volver a postularte. La Ronda {siguiente.numero} tiene <b className="text-neutral-900">{siguiente.cupos} cupos</b>
                    {diaResultados(siguiente) && <> y se anuncia el <b className="text-neutral-900">{fechaTanda(diaResultados(siguiente)!)}</b></>}.
                  </p>
                  {diasInscripcion(siguiente) && (
                    <p><b className="text-neutral-900">¿Aún no te postulas?</b> Hazlo el <b className="text-neutral-900">{diasInscripcion(siguiente)}</b> en el formulario de abajo 🚀</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-12 grid gap-10 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-neutral-900">Qué vas a probar</h2>
            <ul className="mt-4 space-y-4">
              {INCLUYE.map(x => (
                <li key={x.t} className="flex gap-3">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-lime-500 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-neutral-900">{x.t}</span>
                    <span className="block text-sm text-neutral-500">{x.d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-neutral-900">Cómo funciona</h2>
            <ol className="mt-3 space-y-2 text-sm text-neutral-600 list-decimal pl-4">
              <li>Te postulas una sola vez, en los días de postulación (2 minutos). Si no quedas en la ronda 1, tu postulación sigue en pie para la ronda 2.</li>
              <li>Revisamos los perfiles: buscamos vendedores con movimiento real, para que el sistema te sirva de verdad.</li>
              <li>Al día siguiente del cierre de las postulaciones anunciamos la selección aquí y en nuestro grupo de Telegram. Si quedas, nos escribes a @elcomerciantedigital, configuramos el sistema contigo y te enseñamos a usarlo.</li>
              <li>Un mes gratis. Después decides si te quedas.</li>
            </ol>
          </section>
        </div>

        <FormularioFundadores
          abierta={!!abiertaHoy}
          previa={previa && !abiertaHoy}
          proxima={proxima ? diasInscripcion(proxima) : null}
          resultados={abiertaHoy ? fechaTanda(diaResultados(abiertaHoy)) : null} />
      </main>

      <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-400">
        © {anio} El Comerciante Digital · Todos los derechos reservados
      </footer>
    </div>
  )
}
