import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { PageHeader } from '@/components/ui'
import InicioAutomatizaciones, { type Herramienta } from '@/components/automatizaciones/InicioAutomatizaciones'

export const metadata = { title: 'Automatizaciones' }

// Inicio del espacio Automatizaciones: lo pendiente ahora + todas las herramientas sobre
// MercadoLibre, agrupadas por momento de la venta. Lo que la empresa no tiene se muestra
// apagado (para saber que existe).
export default async function AutomatizacionesPage() {
  const session = await getServerSession(authOptions)
  const u = session!.user
  const ve = u.country === 'VE'
  const admin = u.role === 'admin'
  const ml = tieneModulo(u, 'preguntas')
  const despachos = ve && tieneModulo(u, 'despachos')
  const reportador = despachos && tieneModulo(u, 'reportador')

  const grupos: { titulo: string; texto: string; items: Herramienta[] }[] = [
    {
      titulo: 'Antes y durante la venta', texto: 'Atender a los compradores de todas tus cuentas en un solo lugar.',
      items: [
        { href: '/preguntas', titulo: 'Preguntas con IA', icono: 'preguntas', activa: ml, aviso: 'preguntas', urgente: true,
          pendiente: 'sin responder',
          texto: 'Las preguntas de todas tus cuentas en una bandeja. La IA propone la respuesta con tu publicación, tu stock y tus respuestas de siempre; tú publicas.' },
        { href: '/mensajes', titulo: 'Mensajes', icono: 'mensajes', activa: ml, aviso: 'mensajes', urgente: true,
          pendiente: 'conversaciones sin leer',
          texto: 'Los mensajes de tus ventas sin leer, de todas las cuentas, con el producto y el estado de la venta. Respondes desde aquí.' },
      ],
    },
    {
      titulo: 'Después de la venta', texto: 'Despachar, avisar la guía y cerrar cada venta con su calificación.',
      items: [
        { href: '/despachos', titulo: 'Despachos', icono: 'despachos', activa: despachos, aviso: 'despachos',
          pendiente: 'impresos, falta cerrar jornada',
          texto: 'Subes las etiquetas de Mercado Envíos (Zoom y Tealca) y salen 4 por hoja con el producto y la nota de cada venta. Manifiesto por transportista.' },
        { href: '/reportador', titulo: 'Reportador', icono: 'reportador', activa: reportador, aviso: 'reportador',
          pendiente: 'guías por avisar',
          texto: 'Le escribe a cada comprador su número de guía al cerrar la jornada: por la API, sin programa, o con el programa de la PC.' },
        ...(admin ? [{ href: '/calificaciones', titulo: 'Calificaciones', icono: 'calificaciones' as const, activa: ml, aviso: 'calificaciones' as const,
          pendiente: 'ventas por calificar',
          texto: 'Las ventas sin calificar cruzadas con el sistema: lo cargado se concretó (positiva), lo que nunca entró no. Calificas en bloque.' }] : []),
      ],
    },
  ]

  return (
    <div>
      <PageHeader title="Automatizaciones" subtitle="Lo que pasa en MercadoLibre, atendido desde aquí: preguntas, mensajes, despachos, guías y calificaciones" />
      <InicioAutomatizaciones grupos={grupos} />
    </div>
  )
}
