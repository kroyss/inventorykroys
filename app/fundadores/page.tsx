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
              Abrimos el sistema con el que manejamos nuestras propias cuentas de MercadoLibre a
              {total} vendedores con movimiento real, en {reparto}, con <b className="text-white">un mes gratis</b> para
              usarlo de verdad. Cada ronda tiene <b className="text-white">días fijos para postularse</b> y la selección
              se anuncia al día siguiente. Después decides si te quedas.
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
              {abiertaHoy ? 'Postúlate' : 'Ver la postulación'} <span aria-hidden="true">↓</span>
            </a>
            <span className="text-xs text-neutral-500">{tomados} de {total} pioneros confirmados</span>
          </div>
        </div>
      </section>

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
              <li>En los días de postulación de la ronda envías tu postulación (2 minutos).</li>
              <li>Revisamos los perfiles: buscamos vendedores con movimiento real, para que el sistema te sirva de verdad.</li>
              <li>Al día siguiente anunciamos la selección. Si quedas, te escribimos por Telegram, configuramos el sistema contigo y te enseñamos a usarlo.</li>
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
