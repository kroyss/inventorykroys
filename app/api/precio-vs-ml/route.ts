import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPublicaciones } from '@/lib/preguntasSesion'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { crearLote } from '@/lib/lotesPublicaciones'
import { actualizarCatalogo } from '@/lib/catalogoML'
import { filasPrecioML, porRestaurar, promosActivas, type FilaPrecioML } from '@/lib/precioVsML'

// Publicaciones → «Precio vs sistema» (22-11, lib/precioVsML.ts, módulo precio_vs_ml).
//   GET → cada publicación vinculada: precio de lista en ML contra el precio con exceso del sistema, y las que quedaron
//         sin sus promociones por un cambio de precio hecho aquí (para restaurarlas en Promociones).
//   POST { accion: 'poner', items, con_promos } → cola de ML tipo 'precio' con el precio que calcula el servidor AHORA.
//        Las que están en promoción solo van con con_promos = true (la pantalla avisa que pierden sus promociones).
//   POST { accion: 'actualizar' } → relee de ML el catálogo de las cuentas.
//   POST { accion: 'restaurada', lote_id, item_id } → «Ya la revisé» (sale de la lista por restaurar).

async function sesion() {
  const s = await sesionPublicaciones()
  if ('error' in s) return s
  const u = s.session.user
  if (u.country !== 'VE' || !tieneModulo(u, 'precio_vs_ml') || !tieneModulo(u, 'inventario') || !puede(u, 'ver_productos')) {
    return { error: NextResponse.json({ error: 'Tu empresa no tiene «Precio vs sistema»' }, { status: 403 }) } as const
  }
  return s
}

export interface PrecioVsMLRespuesta {
  filas: FilaPrecioML[]
  restaurar: Awaited<ReturnType<typeof porRestaurar>>
  cola: { id: number; total: number } | null
  conPromociones: boolean
}

export async function GET() {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const u = s.session.user
    const [filas, activas, { rows: [cola] }] = await Promise.all([
      filasPrecioML(s.db, tieneModulo(u, 'precios_categorias')),
      promosActivas(s.db).catch(() => new Map()),
      s.db.query(`SELECT id::int, total::int FROM ml_pub_lotes WHERE tipo = 'precio' AND estado = 'en_curso'
                  AND parametros->>'origen' = 'precio_vs_ml' ORDER BY creado_at DESC LIMIT 1`),
    ])
    const res: PrecioVsMLRespuesta = {
      filas, restaurar: await porRestaurar(s.db, activas), cola: cola ?? null,
      conPromociones: tieneModulo(u, 'promociones') && puede(u, 'promociones'),
    }
    return NextResponse.json(res)
  } catch (err) { return apiError(err) }
}

const Body = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('poner'), items: z.array(z.string().regex(/^MLV\d{6,15}$/)).min(1).max(3000), con_promos: z.boolean() }),
  z.object({ accion: z.literal('actualizar') }),
  z.object({ accion: z.literal('restaurada'), lote_id: z.number().int().positive(), item_id: z.string().regex(/^MLV\d{6,15}$/) }),
])

export async function POST(req: NextRequest) {
  const s = await sesion()
  if ('error' in s) return s.error
  const r = Body.safeParse(await req.json().catch(() => null))
  if (!r.success) return NextResponse.json({ error: r.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  const b = r.data
  try {
    if (b.accion === 'actualizar') {
      const { rows } = await s.db.query(`SELECT id FROM ml_conexiones WHERE estado = 'activa'`)
      for (const c of rows) await actualizarCatalogo(s.db, c.id, true).catch(() => null)
      return NextResponse.json({ ok: true })
    }
    if (b.accion === 'restaurada') {
      await s.db.query(
        `UPDATE ml_pub_lote_items SET datos = datos || '{"restaurada": true}'::jsonb WHERE lote_id = $1 AND item_id = $2`,
        [b.lote_id, b.item_id])
      return NextResponse.json({ ok: true })
    }

    // Poner el precio del sistema: lo que calcula el servidor AHORA (la pantalla puede estar vieja).
    const filas = new Map((await filasPrecioML(s.db, tieneModulo(s.session.user, 'precios_categorias'))).map(f => [f.item_id, f]))
    const validas: FilaPrecioML[] = []
    const saltadas: { item_id: string; motivo: string }[] = []
    for (const id of new Set(b.items)) {
      const f = filas.get(id)
      if (!f || f.precio_sistema == null || f.precio_ml == null) { saltadas.push({ item_id: id, motivo: 'Sin precio del sistema para comparar' }); continue }
      if (f.estado === 'bien') { saltadas.push({ item_id: id, motivo: 'Ya está bien' }); continue }
      if (f.promos.length && !b.con_promos) { saltadas.push({ item_id: id, motivo: 'Está en promoción' }); continue }
      validas.push(f)
    }
    if (!validas.length) return NextResponse.json({ error: 'Ninguna publicación cambia de precio', saltadas }, { status: 400 })
    const conPromo = validas.filter(f => f.promos.length).length
    const lote = await crearLote(s.db, 'precio',
      `Precio del sistema en ${validas.length} publicaci${validas.length === 1 ? 'ón' : 'ones'}${conPromo ? ` (${conPromo} sin sus promociones)` : ''}`,
      { origen: 'precio_vs_ml' },
      validas.map(f => ({ item: f.item_id, conexionId: f.conexion_id,
        datos: { precio_nuevo: Math.round(f.precio_sistema! * 100) / 100, precio_antes: f.precio_ml,
                 promos: f.promos.map(p => ({ id: p.id, tipo: p.tipo, nombre: p.nombre, precio: p.precio })) } })),
      Number(s.session.user.id) || null)
    return NextResponse.json({ lote: { id: lote, total: validas.length }, saltadas })
  } catch (err) { return apiError(err) }
}
