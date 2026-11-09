import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sesionPublicaciones } from '@/lib/preguntasSesion'
import { getSessionDb, unauthorized } from '@/lib/session'
import { tiposPermitidos } from '@/lib/colaPermisos'
import { apiError } from '@/lib/apiError'
import { crearLote, precioNuevo, type ParametrosPrecio } from '@/lib/lotesPublicaciones'
import { seleccion } from '@/lib/publicacionesLista'
import { NOMBRE_TIPO } from '@/lib/descripcionTexto'

// Cambios en lote de Publicaciones (mig 152). Los procesa la cola (lib/colaML.ts): arranca al crearlo, hasta 60 por minuto.
// GET → los últimos lotes con su avance.
// 08-11: es la pantalla «Tareas en MercadoLibre»: también las de Promociones, según lo que el usuario puede ver.
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const tipos = tiposPermitidos(session.user)
  if (!tipos.length) return NextResponse.json({ lotes: [] })
  try {
    const { rows } = await db.query(
      `SELECT l.id::int, l.tipo, l.titulo, l.estado, l.total, l.creado_at, l.terminado_at, COALESCE(u.full_name, u.username) AS usuario,
              COUNT(*) FILTER (WHERE i.estado = 'ok')::int AS ok, COUNT(*) FILTER (WHERE i.estado = 'sin_cambio')::int AS sin_cambio,
              COUNT(*) FILTER (WHERE i.estado = 'saltada')::int AS saltadas, COUNT(*) FILTER (WHERE i.estado = 'error')::int AS errores,
              COUNT(*) FILTER (WHERE i.estado IN ('pendiente', 'procesando'))::int AS pendientes
       FROM ml_pub_lotes l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN ml_pub_lote_items i ON i.lote_id = l.id
       WHERE l.tipo = ANY($1::text[]) AND (l.tipo <> 'leer' OR l.creado_at > NOW() - INTERVAL '2 days')
         AND l.creado_at > NOW() - INTERVAL '30 days'
       GROUP BY l.empresa_id, l.id, u.full_name, u.username ORDER BY (l.estado = 'en_curso') DESC, l.creado_at DESC LIMIT 50`, [tipos])
    return NextResponse.json({ lotes: rows })
  } catch (err) { return apiError(err) }
}

const Seleccion = z.object({
  items: z.array(z.string().regex(/^M[A-Z]{2}\d{6,15}$/)).max(3000).optional(),
  filtro: z.object({ q: z.string().max(100).optional(), cuenta: z.number().int().nullable().optional(), estado: z.string().nullable().optional() }).optional(),
})
const Pedido = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('descripcion'), seleccion: Seleccion, parte: z.enum(['encabezado', 'condiciones', 'pie']), plantillaId: z.number().int().nullable(),
             noReconocida: z.enum(['saltar', 'agregar']).optional(), confirmar: z.boolean() }),
  z.object({ tipo: z.literal('precio'), seleccion: Seleccion, modo: z.enum(['porcentaje', 'monto', 'fijo']), valor: z.number().min(-1e9).max(1e10),
             redondeo: z.enum(['no', 'entero', '90']), confirmar: z.boolean() }),
])

// POST → { confirmar: false } devuelve la vista previa (antes → después); { confirmar: true } crea el lote.
export async function POST(req: NextRequest) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const p = Pedido.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
  const d = p.data
  const userId = Number(s.session.user.id) || null
  try {
    const filas = await seleccion(s.db, d.seleccion)
    if (!filas.length) return NextResponse.json({ error: 'No hay publicaciones elegidas' }, { status: 400 })

    if (d.tipo === 'precio') {
      const par: ParametrosPrecio = { modo: d.modo, valor: d.valor, redondeo: d.redondeo }
      const vista = filas.map(f => {
        const nuevo = f.precio != null ? precioNuevo(f.precio, par, f.moneda ?? 'USD') : null
        return { item_id: f.item_id, titulo: f.titulo, cuenta: f.cuenta, moneda: f.moneda, antes: f.precio, despues: nuevo,
                 problema: nuevo == null ? 'Sin precio' : nuevo <= 0 ? 'Quedaría en cero o negativo' : null }
      })
      if (!d.confirmar) return NextResponse.json({ vista })
      const validas = vista.filter(v => !v.problema && v.despues !== v.antes)
      if (!validas.length) return NextResponse.json({ error: 'Ninguna publicación cambia de precio' }, { status: 400 })
      const regla = d.modo === 'porcentaje' ? `${d.valor > 0 ? '+' : ''}${d.valor}%` : d.modo === 'monto' ? `${d.valor > 0 ? '+' : ''}${d.valor}` : `precio ${d.valor}`
      const lote = await crearLote(s.db, 'precio', `Precios ${regla} en ${validas.length} publicaciones`, par,
        validas.map(v => ({ item: v.item_id, datos: { precio_nuevo: v.despues, precio_antes: v.antes } })), userId)
      return NextResponse.json({ lote })
    }

    // Descripción
    const plantilla = d.plantillaId == null ? null
      : (await s.db.query(`SELECT id::int, nombre, conexion_id FROM ml_desc_plantillas WHERE id = $1`, [d.plantillaId])).rows[0]
    if (d.plantillaId != null && !plantilla) return NextResponse.json({ error: 'Ese texto ya no existe' }, { status: 404 })
    const deOtra = plantilla?.conexion_id ? filas.filter(f => f.conexion_id !== plantilla.conexion_id).length : 0
    const { rows: [sep] } = await s.db.query(
      `SELECT COUNT(*)::int AS n FROM ml_item_descripcion WHERE item_id = ANY($1::text[]) AND cuerpo IS NOT NULL`, [filas.map(f => f.item_id)])
    if (!d.confirmar) return NextResponse.json({ total: filas.length, separadas: sep.n, deOtraCuenta: deOtra, ejemplo: filas.slice(0, 5) })
    const nombre = plantilla ? `«${plantilla.nombre}»` : '(quitar)'
    const lote = await crearLote(s.db, 'descripcion', `${NOMBRE_TIPO[d.parte].titulo} ${nombre} en ${filas.length} publicaciones`,
      { parte: d.parte, plantillaId: d.plantillaId }, filas.map(f => ({ item: f.item_id })), userId)
    return NextResponse.json({ lote })
  } catch (err) { return apiError(err) }
}
