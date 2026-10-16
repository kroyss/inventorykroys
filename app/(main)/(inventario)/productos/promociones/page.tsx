import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { dbDeSesion } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import type { FotoPromociones } from '@/lib/promocionesML'
import PromocionesClient, { type CampanaVista, type FilaPromo, type AccionHecha } from '@/components/productos/PromocionesClient'

export const metadata = { title: 'Promociones' }

// Promociones de MercadoLibre (migraciones 094 y 097, lib/promocionesML.ts). La foto de ML se guarda por
// cuenta; aquí se cruza con el PESO del portal de MercadoEnvíos (me_productos) o el del producto vinculado,
// y con el COSTO del producto (para el margen neto al precio de la promoción).
export default async function PromocionesPage() {
  const session = await getServerSession(authOptions)
  if (!session || !puede(session.user, 'ver_productos')) redirect('/dashboard')
  if (session.user.country !== 'VE' || !tieneModulo(session.user, 'promociones') || !puede(session.user, 'promociones')) redirect('/productos')

  const db = dbDeSesion(session)
  const [{ rows: fotos }, { rows: portal }, { rows: vinculados }, { rows: acciones }] = await Promise.all([
    db.query(`SELECT c.conexion_id, x.nickname, c.datos, c.error, c.actualizado_at
              FROM ml_promociones_cache c JOIN ml_conexiones x ON x.id = c.conexion_id
              WHERE x.estado = 'activa' ORDER BY x.id`),
    db.query(`SELECT publicacion, peso_kg::float AS peso, actualizado_at FROM me_productos`),
    db.query(`SELECT 'MLV' || m.ml_code AS publicacion, p.code, p.weight_kg::float AS peso, m.unidades,
                     COALESCE(pp.total_cost, 0)::float AS costo
              FROM product_ml_codes m JOIN products p ON p.id = m.product_id
              LEFT JOIN product_pricing pp ON pp.product_id = p.id
              WHERE m.is_active AND p.is_active`),
    db.query(`SELECT a.id::int, a.conexion_id, a.accion, a.campana_id, a.campana_tipo, a.campana_nombre, a.item_id,
                     a.precio::float, a.precio_antes::float, a.resultado, a.detalle, a.creado_at,
                     COALESCE(u.full_name, u.username) AS usuario
              FROM ml_promociones_acciones a LEFT JOIN users u ON u.id = a.usuario_id
              WHERE a.creado_at > NOW() - INTERVAL '60 days' ORDER BY a.creado_at DESC LIMIT 300`),
  ])
  const pesoPortal = new Map(portal.map(r => [r.publicacion as string, r.peso as number | null]))
  const producto = new Map(vinculados.map(r => [r.publicacion as string, r as { code: string; peso: number | null; costo: number; unidades: number }]))
  const pesosAl = portal.reduce<string | null>((m, r) => (!m || r.actualizado_at > m ? r.actualizado_at : m), null)

  // Agregadas a campañas que todavía no empiezan: ML no las lista, salen del registro de acciones.
  const campanaPorId = new Map<string, { nombre: string; estado: string; inicio: string | null }>()
  for (const f of fotos) for (const c of (f.datos as FotoPromociones).campanas) campanaPorId.set(c.id, c)
  const programadas = new Map<string, { campana: string; nombre: string; precio: number; inicio: string | null }[]>()
  for (const a of [...acciones].reverse()) {
    if (a.resultado !== 'ok' || !a.item_id || !a.campana_id) continue
    const k = `${a.conexion_id}|${a.item_id}`
    const lista = (programadas.get(k) ?? []).filter(x => x.campana !== a.campana_id)
    const c = campanaPorId.get(a.campana_id)
    if (a.accion === 'agregar' && c && c.estado !== 'started') {
      lista.push({ campana: a.campana_id, nombre: c.nombre, precio: a.precio, inicio: c.inicio })
    }
    programadas.set(k, lista)
  }

  const campanas = new Map<string, CampanaVista>()
  const filas: FilaPromo[] = []
  for (const f of fotos) {
    const foto = f.datos as FotoPromociones
    const nombres = new Map(foto.campanas.map(c => [c.id, c.nombre]))
    for (const c of foto.campanas) {
      const k = `${f.conexion_id}|${c.id}`
      if (!campanas.has(k)) campanas.set(k, { ...c, conexionId: f.conexion_id, cuentas: [f.nickname], adentro: 0, candidatas: 0 })
    }
    for (const it of foto.items) {
      const pp = pesoPortal.get(it.id)
      const prod = producto.get(it.id)
      // El peso del portal es el de la publicación (un combo trae el suyo). El del producto es de 1 unidad:
      // solo sirve para publicaciones de 1 unidad; un combo sin peso del portal queda "sin peso".
      const pesoProducto = prod?.peso != null && prod.peso > 0 && (prod.unidades ?? 1) === 1 ? prod.peso : null
      const peso = pp != null && pp > 0 ? pp : pesoProducto
      for (const p of it.promos) {
        const v = campanas.get(`${f.conexion_id}|${p.campana}`)
        if (v && p.estado === 'started') v.adentro++
        if (v && p.estado === 'candidate') v.candidatas++
      }
      filas.push({
        id: it.id, conexionId: f.conexion_id, cuenta: f.nickname, titulo: it.titulo, precio: it.precio,
        producto: prod?.code ?? null, costo: prod?.costo && prod.costo > 0 ? prod.costo : null,
        peso, pesoFuente: pp != null && pp > 0 ? 'portal' : peso != null ? 'producto' : null,
        promos: it.promos.map(p => ({ ...p, nombre: nombres.get(p.campana) ?? p.campana })),
        programadas: (programadas.get(`${f.conexion_id}|${it.id}`) ?? []).map(x => ({ nombre: x.nombre, precio: x.precio, inicio: x.inicio })),
      })
    }
  }

  return (
    <PromocionesClient
      filas={filas}
      campanas={[...campanas.values()]}
      cuentas={fotos.map(f => ({ id: f.conexion_id as number, nombre: f.nickname as string, actualizado_at: f.actualizado_at as string, error: f.error as string | null }))}
      pesosAl={pesosAl}
      conPagosME={tieneModulo(session.user, 'pagos_me')}
      historial={acciones.slice(0, 60) as AccionHecha[]}
    />
  )
}
