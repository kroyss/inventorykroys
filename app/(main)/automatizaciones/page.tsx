import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { PageHeader } from '@/components/ui'

export const metadata = { title: 'Automatizaciones' }

interface Tarjeta { href?: string; titulo: string; texto: string; activa: boolean; pronto?: boolean; icono: keyof typeof ICONOS }

// Íconos de trazo (24x24)
const ICONOS = {
  despachos: <><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>,
  reportador: <><path d="M4 5h16v11H8l-4 4V5z" /><path d="M8 9h8M8 12h5" /></>,
  ia: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></>,
}

// Inicio del espacio Automatizaciones: las herramientas sobre MercadoLibre que tiene la
// empresa. Lo que no tiene se muestra apagado (para saber que existe).
export default async function AutomatizacionesPage() {
  const session = await getServerSession(authOptions)
  const u = session!.user
  const ve = u.country === 'VE'
  const tarjetas: Tarjeta[] = [
    { href: '/despachos', titulo: 'Despachos', icono: 'despachos', activa: ve && tieneModulo(u, 'despachos'),
      texto: 'Sube las etiquetas de Mercado Envíos (Zoom y Tealca) y salen 4 por hoja con el producto y la nota de cada venta. Manifiesto por transportista.' },
    { href: '/reportador', titulo: 'Reportador', icono: 'reportador', activa: ve && tieneModulo(u, 'despachos') && tieneModulo(u, 'reportador'),
      texto: 'Le escribe a cada comprador su número de guía por la mensajería de MercadoLibre, desde un programa en tu computadora.' },
    { href: '/preguntas', titulo: 'Preguntas con IA', icono: 'ia', activa: tieneModulo(u, 'preguntas'),
      texto: 'Todas las preguntas de tus cuentas en una bandeja, con respuesta sugerida por IA a partir de tu publicación, tu stock y tus respuestas de siempre.' },
  ]
  return (
    <div className="space-y-5">
      <PageHeader title="Automatizaciones" subtitle="Herramientas que trabajan con tus ventas de MercadoLibre" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tarjetas.map(t => {
          const cuerpo = (
            <div className={`group h-full flex flex-col bg-white rounded-xl border shadow-sm p-5 ${
              t.activa ? 'border-neutral-200 hover:border-neutral-400 hover:shadow transition-all' : 'border-neutral-200 border-dashed bg-neutral-50/60'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className={`w-10 h-10 rounded-lg flex items-center justify-center ${t.activa ? 'bg-neutral-900 text-lime-400' : 'bg-neutral-100 text-neutral-400'}`}>
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8}
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONOS[t.icono]}</svg>
                </span>
                {t.pronto && <span className="text-[11px] font-medium bg-lime-100 text-lime-800 rounded-full px-2 py-0.5">Pronto</span>}
                {!t.activa && !t.pronto && <span className="text-[11px] font-medium bg-neutral-100 text-neutral-500 rounded-full px-2 py-0.5">No incluido</span>}
              </div>
              <h2 className={`mt-4 text-base font-semibold ${t.activa ? 'text-neutral-900' : 'text-neutral-500'}`}>{t.titulo}</h2>
              <p className={`mt-1 text-sm flex-1 ${t.activa ? 'text-neutral-600' : 'text-neutral-400'}`}>{t.texto}</p>
              {t.activa && <span className="mt-4 text-sm font-medium text-neutral-900 group-hover:underline">Abrir →</span>}
            </div>
          )
          return t.activa && t.href
            ? <Link key={t.titulo} href={t.href}>{cuerpo}</Link>
            : <div key={t.titulo}>{cuerpo}</div>
        })}
      </div>
    </div>
  )
}
