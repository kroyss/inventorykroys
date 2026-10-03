import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { llevaInventario } from '@/lib/modulos'

// Todo el espacio Inventario (Inicio, Ventas, Inventario, Compras, Productos, Reportes,
// Ajustes): la empresa que trabaja "todo desde MercadoLibre" (módulo inventario apagado) no lo
// ve y cae en Automatizaciones. El grupo (inventario) no cambia las direcciones.
export default async function InventarioLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (session?.user && !llevaInventario(session.user)) redirect('/automatizaciones')
  return children
}
