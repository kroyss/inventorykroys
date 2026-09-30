import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { PageHeader } from '@/components/ui'

export const metadata = { title: 'Automatizaciones' }

interface Tarjeta { href?: string; titulo: string; texto: string; activa: boolean; pronto?: boolean }

// Inicio del espacio Automatizaciones: las herramientas sobre MercadoLibre que tiene la
// empresa. Lo que no tiene se muestra apagado (para saber que existe).
export default async function AutomatizacionesPage() {
  const session = await getServerSession(authOptions)
  const u = session!.user
  const ve = u.country === 'VE'
  const tarjetas: Tarjeta[] = [
    { href: '/despachos', titulo: 'Despachos', activa: ve && tieneModulo(u, 'despachos'),
      texto: 'Sube las etiquetas de Mercado Envíos (Zoom y Tealca) y salen 4 por hoja con el producto y la nota de cada venta. Manifiesto por transportista.' },
    { href: '/reportador', titulo: 'Reportador', activa: ve && tieneModulo(u, 'despachos') && tieneModulo(u, 'reportador'),
      texto: 'Le escribe a cada comprador su número de guía por la mensajería de MercadoLibre, desde un programa en tu computadora.' },
    { titulo: 'Preguntas con IA', activa: false, pronto: true,
      texto: 'Central de preguntas de tus publicaciones con respuestas sugeridas por IA, usando tu stock y tus precios.' },
  ]
  return (
    <div className="space-y-5">
      <PageHeader title="Automatizaciones" subtitle="Herramientas que trabajan con tus ventas de MercadoLibre." />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tarjetas.map(t => {
          const cuerpo = (
            <div className={`h-full bg-white rounded-xl border shadow-sm p-5 space-y-2 ${t.activa ? 'border-neutral-200 hover:border-neutral-400 transition-colors' : 'border-neutral-100 opacity-60'}`}>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-900">{t.titulo}</h2>
                {t.pronto && <span className="text-[10px] font-semibold uppercase tracking-wide bg-neutral-100 text-neutral-500 rounded px-1.5 py-0.5">Pronto</span>}
                {!t.activa && !t.pronto && <span className="text-[10px] font-semibold uppercase tracking-wide bg-neutral-100 text-neutral-500 rounded px-1.5 py-0.5">No incluido</span>}
              </div>
              <p className="text-sm text-neutral-600">{t.texto}</p>
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
