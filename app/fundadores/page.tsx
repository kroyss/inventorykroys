import { connection } from 'next/server'
import { dbGlobal } from '@/lib/db'
import { marca } from '@/lib/marca'
import { RONDA_ACTUAL, fechaTanda } from '@/lib/fundadores'
import FormularioFundadores from '@/components/fundadores/FormularioFundadores'

export const metadata = {
  title: 'Programa Fundadores',
  description: '10 cupos para vendedores de MercadoLibre Venezuela con movimiento real: un mes gratis, configuración y adiestramiento sin costo.',
}

interface Tanda { numero: number; cupos: number; abierta: boolean; inicia: string | null; tomados: number }

// Lo que reciben los Fundadores además del mes gratis.
const BENEFICIOS = [
  { t: 'Atención personalizada', d: 'Hablas directo con nosotros por Telegram, no con un bot ni con un ticket.' },
  { t: 'Configuración gratis', d: 'Conectamos tus cuentas de MercadoLibre y dejamos el sistema listo contigo.' },
  { t: 'Adiestramiento gratis', d: 'Te enseñamos a usarlo, a ti y a quien te ayude con las ventas.' },
]

const INCLUYE = [
  { t: 'Preguntas con IA', d: 'Las preguntas de todas tus cuentas en una bandeja, con la respuesta sugerida.' },
  { t: 'Mensajes de tus ventas', d: 'Los mensajes sin leer de todas tus cuentas, con notas para no olvidar ningún detalle.' },
  { t: 'Guías y despachos', d: 'Imprimes todas las guías del día de una vez, cada una identificada con tus productos para no confundir paquetes, y sacas el manifiesto de envíos para ZOOM o Tealca.' },
  { t: 'Reporte de guías', d: 'Cada comprador recibe su número de guía sin que lo escribas a mano.' },
  { t: 'Calificaciones', d: 'Calificas a tus compradores en bloque, no venta por venta.' },
  { t: 'Ventas e inventario', d: 'Tu stock y tus ventas al día, sin cuaderno ni Excel.' },
]

// Página pública del Programa Fundadores (sin login; ver proxy.ts). Muestra las 2 tandas
// (5 + 5 = 10 pioneros) y el formulario. Lo de la base se lee en cada visita.
export default async function FundadoresPage() {
  await connection()
  const m = marca()
  const { rows: tandas } = await dbGlobal().query<Tanda>(
    `SELECT t.numero, t.cupos, t.abierta, to_char(t.inicia, 'YYYY-MM-DD') AS inicia,
            (SELECT COUNT(*)::int FROM fundadores_solicitudes s WHERE s.tanda = t.numero AND s.estado = 'aprobado') AS tomados
     FROM fundadores_tandas t WHERE t.ronda = $1 ORDER BY t.numero`, [RONDA_ACTUAL])
  const total = tandas.reduce((a, t) => a + t.cupos, 0)
  const tomados = tandas.reduce((a, t) => a + Math.min(t.tomados, t.cupos), 0)
  const anio = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Portada */}
      <section className="relative overflow-hidden bg-neutral-950 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 w-[34rem] h-[34rem] rounded-full border border-lime-400/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 w-[24rem] h-[24rem] rounded-full border border-lime-400/20" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 w-[14rem] h-[14rem] rounded-full bg-lime-400/10 blur-2xl" />

        <div className="relative max-w-5xl mx-auto px-5 sm:px-8 pt-8 pb-14 sm:pb-20">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.logo} alt="" className={`h-10 w-10 ${m.logoRedondo ? 'rounded-xl' : ''}`} />
            <span className="text-base font-semibold tracking-tight">{m.nombre}</span>
          </div>

          <div className="mt-12 sm:mt-16 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-400">Programa Fundadores</p>
            <h1 className="mt-3 text-4xl sm:text-5xl font-semibold leading-[1.1] tracking-tight">
              Sé uno de los <span className="text-lime-400">10 primeros.</span>
            </h1>
            <p className="mt-4 text-neutral-400 leading-relaxed">
              Abrimos el sistema con el que manejamos nuestras propias cuentas de MercadoLibre a
              10 vendedores con movimiento real, en dos tandas de 5, con <b className="text-white">un mes gratis</b> para
              usarlo de verdad. Como Fundador tienes <b className="text-white">atención personalizada</b> y la{' '}
              <b className="text-white">configuración y el adiestramiento gratis</b>. Después decides si te quedas.
            </p>
          </div>

          {/* Tandas */}
          <div className="mt-10 grid gap-3 sm:grid-cols-2 max-w-2xl">
            {tandas.map(t => {
              const llena = t.tomados >= t.cupos
              // La que se está llenando es la primera abierta con cupo (las aprobaciones van en orden).
              const actual = t.numero === tandas.find(x => x.abierta && x.tomados < x.cupos)?.numero
              const estado = llena ? 'Completa' : actual ? 'Cupos disponibles' : t.abierta ? 'Próxima' : 'Cerrada'
              const fecha = fechaTanda(t.inicia)
              return (
                <div key={t.numero} className={`rounded-xl border p-4 ${actual ? 'border-lime-400/50 bg-lime-400/[0.07]' : 'border-white/10 bg-white/[0.03]'}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold">Tanda {t.numero}</span>
                    <span className={`text-xs font-medium ${actual ? 'text-lime-400' : 'text-neutral-500'}`}>{estado}</span>
                  </div>
                  {fecha && <p className="mt-0.5 text-xs text-neutral-400">Arranca el <span className="text-neutral-200">{fecha}</span></p>}
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
              Quiero mi cupo <span aria-hidden="true">↓</span>
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
          <section className="rounded-xl border border-lime-300 bg-lime-50/60 p-5">
            <h2 className="text-sm font-semibold text-neutral-900">Solo para Fundadores</h2>
            <ul className="mt-3 space-y-3">
              {BENEFICIOS.map(x => (
                <li key={x.t} className="flex gap-2.5">
                  <span className="mt-0.5 text-lime-700 font-semibold" aria-hidden="true">✓</span>
                  <span>
                    <span className="block text-sm font-semibold text-neutral-900">{x.t}</span>
                    <span className="block text-sm text-neutral-600">{x.d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-neutral-900">Cómo funciona</h2>
            <ol className="mt-3 space-y-2 text-sm text-neutral-600 list-decimal pl-4">
              <li>Llenas la solicitud (2 minutos).</li>
              <li>Revisamos los perfiles: buscamos vendedores con movimiento real, para que el sistema te sirva de verdad.</li>
              <li>Si quedas seleccionado, te escribimos por Telegram, configuramos el sistema contigo y te enseñamos a usarlo.</li>
              <li>Un mes gratis. Después decides si te quedas.</li>
            </ol>
          </section>
        </div>

        <FormularioFundadores />
      </main>

      <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-400">
        © {anio} El Comerciante Digital · Todos los derechos reservados
      </footer>
    </div>
  )
}
