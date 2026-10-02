import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { dbDeSesion } from '@/lib/session'
import { PageHeader } from '@/components/ui'
import InicioAutomatizaciones, { type Herramienta } from '@/components/automatizaciones/InicioAutomatizaciones'

export const metadata = { title: 'Automatizaciones' }

// Inicio del espacio Automatizaciones: lo pendiente ahora + todas las herramientas sobre
// MercadoLibre, agrupadas por momento de la venta. Lo que la empresa no tiene se muestra
// apagado (para saber que existe), salvo los módulos en pruebas, que ni aparecen.
export default async function AutomatizacionesPage() {
  const session = await getServerSession(authOptions)
  const u = session!.user
  const ve = u.country === 'VE'
  const ml = tieneModulo(u, 'preguntas')
  const despachos = ve && tieneModulo(u, 'despachos')
  const reportador = despachos && tieneModulo(u, 'reportador')
  const stock = ml && tieneModulo(u, 'stock_ml')     // en pruebas: si no lo tiene, no aparece

  // Primer paso de una empresa nueva: sin cuentas de MercadoLibre conectadas casi nada funciona.
  const sinCuentas = ml && (await dbDeSesion(session!).query(
    `SELECT 1 FROM ml_conexiones WHERE estado = 'activa' LIMIT 1`)).rowCount === 0

  const grupos: { titulo: string; texto: string; items: Herramienta[] }[] = [
    {
      titulo: 'Antes y durante la venta', texto: 'Atender a los compradores de todas tus cuentas en un solo lugar.',
      items: [
        { href: '/preguntas', titulo: 'Preguntas con IA', icono: 'preguntas', activa: ml, aviso: 'preguntas', urgente: true,
          pendiente: 'sin responder',
          texto: 'Las preguntas de todas tus cuentas en una bandeja. La IA propone la respuesta con tu publicación, tu stock y tus respuestas de siempre; tú publicas.' },
        ...(!stock ? [] : [{ href: '/stock-ml', titulo: 'Stock en ML', icono: 'stock', activa: stock, aviso: 'stock',
          pendiente: 'productos para revisar',
          texto: 'Tu stock real contra lo publicado en cada cuenta: qué reponer (pocas unidades activas o pausadas) y qué está publicado de más.' } satisfies Herramienta]),
        { href: '/alertas-stock', titulo: 'Alertas de stock', icono: 'stock', activa: ml, aviso: 'alertas',
          pendiente: 'agotadas o por agotarse',
          texto: 'Las publicaciones (y cada variante) que se agotaron o están por agotarse en tus cuentas. Se revisa sola cada hora.' },
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
          texto: 'Le escribe a cada comprador su número de guía después de cerrar la jornada: por la API, sin programa, o con el programa de la PC.' },
        { href: '/calificaciones', titulo: 'Calificaciones', icono: 'calificaciones', activa: ml, aviso: 'calificaciones',
          pendiente: 'ventas por calificar',
          texto: 'Las ventas sin calificar cruzadas con el sistema: lo cargado se concretó (positiva), lo que nunca entró no. Calificas en bloque.' },
      ],
    },
  ]

  return (
    <div>
      <PageHeader title="Automatizaciones" subtitle="Lo que pasa en MercadoLibre, atendido desde aquí: preguntas, mensajes, despachos, guías y calificaciones" />
      <InicioAutomatizaciones grupos={grupos} sinCuentas={sinCuentas} esAdmin={u.role === 'admin'} />
    </div>
  )
}
