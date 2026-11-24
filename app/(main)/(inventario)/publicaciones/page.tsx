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
export default async function PublicacionesPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
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
      <EncabezadoInfo info={<><li>Cada fila dice si está <b className="font-medium text-neutral-800">Activa</b> o <b className="font-medium text-neutral-800">Pausada</b>; tócalo para pausarla o activarla. Elige varias para pausarlas o activarlas juntas.</li><li>Las etiquetas salen solo si algo pide atención: <b className="font-medium text-neutral-800">Stock distinto</b> (dice la diferencia y abre Stock vs inventario con ese producto), <b className="font-medium text-neutral-800">Sin vincular</b>, <b className="font-medium text-neutral-800">Sin peso</b>, <b className="font-medium text-neutral-800">En promo</b> (las campañas al pasar el cursor; abre Promociones con esa publicación), <b className="font-medium text-neutral-800">Muchas visitas, pocas ventas</b> (mucha gente la mira y casi nadie compra: revisa precio, fotos o título). Los filtros de arriba muestran solo esas.</li><li><b className="font-medium text-neutral-800">Para activar</b>: lo que tiene inventario y está pausado, en 0 (o alguna variante en 0) o recién llegado; cada fila dice «Inventario N». Ponle stock con «disp. ✎» y actívala.</li><li>Debajo del título, <b className="font-medium text-neutral-800">N visitas/mes</b>: las visitas de los últimos 30 días (se traen de ML una vez al día).</li><li>Toca <b className="font-medium text-neutral-800">«N disp. ✎»</b> o <b className="font-medium text-neutral-800">«N variantes»</b> para cambiar el stock ahí mismo, una variante a la vez si tiene varias.</li><li>Toca una publicación para cambiar precio, stock, fotos, características, variantes o descripción.</li><li>Lo que guardas va directo a MercadoLibre. Los cambios en lote van por la cola: el avance sale abajo a la derecha.</li></>} title="Mis publicaciones" subtitle="Todas tus publicaciones de MercadoLibre; lo que pide atención lo dice en su fila" />
      <PublicacionesClient avisoInicial={(await searchParams).aviso === 'activar' ? 'activar' : ''} />
    </div>
  )
}
