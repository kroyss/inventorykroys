import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { dbDeSesion } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import type { FotoPromociones } from '@/lib/promocionesML'
import PromocionesClient, { type CampanaVista, type FilaPromo } from '@/components/productos/PromocionesClient'

export const metadata = { title: 'Promociones' }

// Promociones de MercadoLibre, Fase 1: solo lectura (migración 094, lib/promocionesML.ts). La foto de ML
// se guarda por cuenta; aquí se cruza con el PESO del portal de MercadoEnvíos (me_productos) o, si no
// está, con el del producto vinculado (product_ml_codes → products.weight_kg).
export default async function PromocionesPage() {
  const session = await getServerSession(authOptions)
  if (!session || !puede(session.user, 'ver_productos')) redirect('/dashboard')
  if (session.user.country !== 'VE' || !tieneModulo(session.user, 'promociones') || !puede(session.user, 'promociones')) redirect('/productos')

  const db = dbDeSesion(session)
  const [{ rows: fotos }, { rows: portal }, { rows: vinculados }] = await Promise.all([
    db.query(`SELECT c.conexion_id, x.nickname, c.datos, c.error, c.actualizado_at
              FROM ml_promociones_cache c JOIN ml_conexiones x ON x.id = c.conexion_id
              WHERE x.estado = 'activa' ORDER BY x.id`),
    db.query(`SELECT publicacion, peso_kg::float AS peso, actualizado_at FROM me_productos`),
    db.query(`SELECT 'MLV' || m.ml_code AS publicacion, p.code, p.weight_kg::float AS peso
              FROM product_ml_codes m JOIN products p ON p.id = m.product_id
              WHERE m.is_active AND p.is_active`),
  ])
  const pesoPortal = new Map(portal.map(r => [r.publicacion as string, r.peso as number | null]))
  const producto = new Map(vinculados.map(r => [r.publicacion as string, r as { code: string; peso: number | null }]))
  const pesosAl = portal.reduce<string | null>((m, r) => (!m || r.actualizado_at > m ? r.actualizado_at : m), null)

  const campanas = new Map<string, CampanaVista>()
  const filas: FilaPromo[] = []
  for (const f of fotos) {
    const foto = f.datos as FotoPromociones
    const nombres = new Map(foto.campanas.map(c => [c.id, c.nombre]))
    for (const c of foto.campanas) {
      const k = `${c.id}`
      const v = campanas.get(k) ?? { ...c, cuentas: [], adentro: 0, candidatas: 0 }
      if (!v.cuentas.includes(f.nickname)) v.cuentas.push(f.nickname)
      campanas.set(k, v)
    }
    for (const it of foto.items) {
      const pp = pesoPortal.get(it.id)
      const prod = producto.get(it.id)
      const peso = pp != null && pp > 0 ? pp : prod?.peso != null && prod.peso > 0 ? prod.peso : null
      for (const p of it.promos) {
        const v = campanas.get(p.campana)
        if (v && p.estado === 'started') v.adentro++
        if (v && p.estado === 'candidate') v.candidatas++
      }
      filas.push({
        id: it.id, cuenta: f.nickname, titulo: it.titulo, precio: it.precio, producto: prod?.code ?? null,
        peso, pesoFuente: pp != null && pp > 0 ? 'portal' : peso != null ? 'producto' : null,
        promos: it.promos.map(p => ({ ...p, nombre: nombres.get(p.campana) ?? p.campana })),
      })
    }
  }

  return (
    <PromocionesClient
      filas={filas}
      campanas={[...campanas.values()]}
      cuentas={fotos.map(f => ({ nombre: f.nickname as string, actualizado_at: f.actualizado_at as string, error: f.error as string | null }))}
      pesosAl={pesosAl}
      conPagosME={tieneModulo(session.user, 'pagos_me')}
    />
  )
}
