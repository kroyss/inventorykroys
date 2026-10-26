import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { registrarUso } from '@/lib/usoAcciones'
import { actualizarCatalogo } from '@/lib/catalogoML'
import { aplicarCambio, type Resultado } from '@/lib/stockML'
import { filasStockML, leerReserva } from '@/lib/stockConML'
import { filasImportar } from '@/lib/importarML'

// Stock en ML, Fase 1 (26-10; lib/stockConML.ts, pantalla Inventario → «Stock en ML»).
//   GET → cada producto vinculado con sus publicaciones, lo que muestran en ML y lo que deberían mostrar
//   POST { accion: 'igualar', pubs: [{ item_id, variante_id }] } → cada una a lo que calcula el servidor AHORA
//        (no lo que mandó la pantalla, que puede estar vieja) y reactiva las pausadas que corresponde
//   POST { accion: 'unidades', codigo_id, unidades } · { accion: 'sincronizar', codigo_id, sin_sincronizar }
//   POST { accion: 'actualizar' } → relee de ML el catálogo de todas las cuentas
//   POST { accion: 'asignar', product_id, asignaciones: [{ item_id, variante_id, cantidad }] } → producto EN RESERVA:
//        lo que decide la persona, sin pasar el disponible (en unidades del producto)
//   POST { accion: 'reserva', unidades } → la reserva de seguridad de la empresa (permiso inventario_config)

async function sesion(accion: boolean) {
  const s = await sesionPreguntas(accion ? 'reponer_stock' : undefined)
  if ('error' in s) return s
  if (!tieneModulo(s.session.user, 'inventario') || !puede(s.session.user, 'ver_inventario')) {
    return { error: NextResponse.json({ error: 'No tienes acceso al inventario' }, { status: 403 }) } as const
  }
  return s
}

export async function GET() {
  const s = await sesion(false)
  if ('error' in s) return s.error
  try {
    const [filas, reserva, catalogo] = await Promise.all([filasStockML(s.db, s.session.user.country), leerReserva(s.db), filasImportar(s.db)])
    // Activas y con unidades en ML pero sin producto: se venden sin que el inventario se entere (aviso → Vincular).
    const sinVincular = catalogo.filter(f => f.estado !== 'vinculada' && f.estado_ml === 'active' && f.disponible > 0).length
    return NextResponse.json({ filas, reserva, sinVincular, puedeCambiar: puede(s.session.user, 'reponer_stock'),
                               puedeReserva: puede(s.session.user, 'inventario_config') })
  } catch (err) {
    return apiError(err)
  }
}

const Body = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('igualar'), pubs: z.array(z.object({
    item_id: z.string().regex(/^[A-Z]{3}\d+$/), variante_id: z.string().regex(/^\d+$/).nullable(),
  })).min(1).max(20) }),
  z.object({ accion: z.literal('unidades'), codigo_id: z.number().int().positive(), unidades: z.number().int().min(1).max(100) }),
  z.object({ accion: z.literal('sincronizar'), codigo_id: z.number().int().positive(), sin_sincronizar: z.boolean() }),
  z.object({ accion: z.literal('actualizar') }),
  z.object({ accion: z.literal('asignar'), product_id: z.number().int().positive(), asignaciones: z.array(z.object({
    item_id: z.string().regex(/^[A-Z]{3}\d+$/), variante_id: z.string().regex(/^\d+$/).nullable(),
    cantidad: z.number().int().min(0).max(99999),
  })).min(1).max(20) }),
  z.object({ accion: z.literal('reserva'), unidades: z.number().int().min(0).max(100) }),
])

export async function POST(req: NextRequest) {
  const s = await sesion(true)
  if ('error' in s) return s.error
  const r = Body.safeParse(await req.json().catch(() => null))
  if (!r.success) return NextResponse.json({ error: r.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  const b = r.data
  try {
    if (b.accion === 'unidades' || b.accion === 'sincronizar') {
      const { rowCount } = b.accion === 'unidades'
        ? await s.db.query(`UPDATE product_ml_codes SET unidades = $2, combo_revisado = TRUE, updated_at = NOW() WHERE id = $1`, [b.codigo_id, b.unidades])
        : await s.db.query(`UPDATE product_ml_codes SET sin_sincronizar = $2, updated_at = NOW() WHERE id = $1`, [b.codigo_id, b.sin_sincronizar])
      if (!rowCount) return NextResponse.json({ error: 'Vínculo no encontrado' }, { status: 404 })
      return NextResponse.json({ ok: true })
    }
    if (b.accion === 'reserva') {
      if (!puede(s.session.user, 'inventario_config')) return NextResponse.json({ error: 'No tienes permiso para cambiar la reserva' }, { status: 403 })
      await s.db.query(
        `INSERT INTO app_settings (key, value) VALUES ('stock_ml_reserva', $1)
         ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value`, [String(b.unidades)])
      return NextResponse.json({ ok: true })
    }
    if (b.accion === 'asignar') {
      const f = (await filasStockML(s.db, s.session.user.country)).find(x => x.product_id === b.product_id)
      if (!f) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
      const pubs = new Map(f.pubs.map(p => [`${p.item_id}:${p.variante_id ?? ''}`, p]))
      // Las publicaciones que no se mencionan quedan como están en ML: también cuentan contra el disponible.
      const pedidas = new Map(b.asignaciones.map(a => [`${a.item_id}:${a.variante_id ?? ''}`, a.cantidad]))
      if ([...pedidas.keys()].some(k => !pubs.get(k) || pubs.get(k)!.sin_sincronizar || pubs.get(k)!.entera_con_variantes || pubs.get(k)!.estado == null)) {
        return NextResponse.json({ error: 'Alguna publicación no se puede asignar desde aquí' }, { status: 400 })
      }
      const total = f.pubs.filter(p => p.estado != null && p.ml_disponible != null && !p.sin_sincronizar)
        .reduce((sum, p) => sum + (pedidas.get(`${p.item_id}:${p.variante_id ?? ''}`) ?? p.ml_disponible ?? 0) * p.unidades, 0)
      if (total > f.disponible) {
        return NextResponse.json({ error: `Entre todas las publicaciones serían ${total} y hay ${f.disponible} disponibles` }, { status: 400 })
      }
      const resultados: Resultado[] = []
      for (const [k, cantidad] of pedidas) {
        const p = pubs.get(k)!
        const reactivar = p.estado === 'paused' && cantidad > 0 && p.envio !== 'destino'
        resultados.push(cantidad === p.ml_disponible && !reactivar
          ? { item_id: p.item_id, variante_id: p.variante_id, ok: true, estado: p.estado ?? undefined, disponible: cantidad }
          : await aplicarCambio(s.db, { item_id: p.item_id, variante_id: p.variante_id, cantidad },
              { reactivar, origen: 'stock_ml_mano', usuarioId: Number(s.session.user.id) }))
      }
      const hechos = resultados.filter(x => x.ok).length
      if (hechos) await registrarUso(s.db, 'stock', hechos)
      return NextResponse.json({ resultados })
    }
    if (b.accion === 'actualizar') {
      const { rows } = await s.db.query(`SELECT id FROM ml_conexiones WHERE estado = 'activa'`)
      for (const c of rows) await actualizarCatalogo(s.db, c.id, true).catch(() => null)
      return NextResponse.json({ ok: true })
    }

    // Igualar: con lo que calcula el servidor en este momento.
    const filas = await filasStockML(s.db, s.session.user.country)
    const pubs = new Map(filas.flatMap(f => f.pubs).map(p => [`${p.item_id}:${p.variante_id ?? ''}`, p]))
    const resultados: Resultado[] = []
    for (const x of b.pubs) {
      const p = pubs.get(`${x.item_id}:${x.variante_id ?? ''}`)
      if (!p || p.objetivo == null) {
        resultados.push({ item_id: x.item_id, variante_id: x.variante_id, ok: false, error: 'Esta publicación no se iguala desde aquí' })
        continue
      }
      const nada = p.objetivo === p.ml_disponible && !p.reactivar
      resultados.push(nada
        ? { item_id: x.item_id, variante_id: x.variante_id, ok: true, estado: p.estado ?? undefined, disponible: p.objetivo }
        : await aplicarCambio(s.db, { item_id: p.item_id, variante_id: p.variante_id, cantidad: p.objetivo },
            { reactivar: p.reactivar, origen: 'stock_ml', usuarioId: Number(s.session.user.id) }))
    }
    const hechos = resultados.filter(x => x.ok).length
    if (hechos) await registrarUso(s.db, 'stock', hechos)
    return NextResponse.json({ resultados })
  } catch (err) {
    return apiError(err)
  }
}
