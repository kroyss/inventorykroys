import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { sinCuentasML } from '@/lib/preguntasSesion'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import PublicacionesClient from '@/components/publicaciones/PublicacionesClient'
import PublicacionesMLTabs, { pestanasML } from '@/components/productos/PublicacionesMLTabs'
import { EncabezadoInfo } from '@/components/ui/Info'

export const metadata = { title: 'Publicaciones' }

// Inventario → Publicaciones (menú propio desde 08-11): pestañas Editar · Vincular · Stock · Promociones.
// Esta dirección es la pestaña Mis publicaciones (antes Editar) (módulo `publicaciones`, mig. 151); quien no la tiene va a la primera que sí ve.
export default async function PublicacionesPage() {
  const session = await getServerSession(authOptions)
  const u = session!.user
  if (!tieneModulo(u, 'preguntas') || !tieneModulo(u, 'publicaciones') || !puede(u, 'editar_publicaciones')) {
    redirect(pestanasML(u)[0]?.href ?? '/productos')
  }
  if (await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={puede(u, 'ml_cuentas')} titulo="Publicaciones" gancho="Edita tus publicaciones de MercadoLibre sin entrar a ML."
      beneficios={['Precio, stock, fotos, características y descripción en una sola pantalla.',
        'Antes de guardar ves qué cambia: antes → después.',
        'Cada cambio queda anotado.']} />
  }
  return (
    <div>
      <PublicacionesMLTabs user={u} actual="editar" />
      {/* 18-11 (el dueño): ⓘ en cada sección. */}
      <EncabezadoInfo info={<><li>Las etiquetas de cada fila salen solo si algo pide atención: <b className="font-medium text-neutral-800">Stock distinto</b> (Igualar pone en ML lo que hay), <b className="font-medium text-neutral-800">Sin vincular</b>, <b className="font-medium text-neutral-800">Sin peso</b>, <b className="font-medium text-neutral-800">En promo</b>. Los filtros de arriba muestran solo esas.</li><li>Toca una publicación para cambiar precio, stock, fotos, características, variantes o descripción.</li><li>Lo que guardas va directo a MercadoLibre. Los cambios en lote van por la cola: el avance sale abajo a la derecha.</li></>} title="Mis publicaciones" subtitle="Todas tus publicaciones de MercadoLibre; lo que pide atención lo dice en su fila" />
      <PublicacionesClient />
    </div>
  )
}
