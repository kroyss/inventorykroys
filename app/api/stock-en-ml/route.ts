import { NextRequest, NextResponse } from 'next/server'
import { pasarPesos } from '@/lib/pesosML'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { registrarUso } from '@/lib/usoAcciones'
import { actualizarCatalogo } from '@/lib/catalogoML'
import { aplicarCambio, cambiarEstadoML, type Resultado } from '@/lib/stockML'
import { igualarPub, pubsPorClave } from '@/lib/igualarStock'
import { crearLote } from '@/lib/lotesPublicaciones'
import { desactivadosPublicados, filasStockML, leerReserva } from '@/lib/stockConML'
import { contarSinVincular } from '@/lib/importarML'
import { guardarEstadoVende, revisarVendeDeMas } from '@/lib/vendeDeMas'
import { guardarInventarioAlDia, leerInventarioAlDia } from '@/lib/inventarioAlDia'
import { leerTablasEnvio } from '@/lib/mlShippingDb'

// Stock en ML, Fase 1 (26-10; lib/stockConML.ts, pantalla Inventario → «Stock en ML»).
//   GET → cada producto vinculado con sus publicaciones, lo que muestran en ML y lo que deberían mostrar
//   POST { accion: 'igualar', pubs: [{ item_id, variante_id }] } → cada una a lo que calcula el servidor AHORA
//        (no lo que mandó la pantalla, que puede estar vieja) y reactiva las pausadas que corresponde
//   POST { accion: 'unidades', codigo_id, unidades } · { accion: 'sincronizar', codigo_id, sin_sincronizar }
//   POST { accion: 'actualizar' } → relee de ML el catálogo de todas las cuentas
//   POST { accion: 'asignar', product_id, asignaciones: [{ item_id, variante_id, cantidad }] } → producto EN RESERVA:
//        lo que decide la persona, sin pasar el disponible (en unidades del producto)
//   POST { accion: 'reserva', unidades } → la reserva de seguridad de la empresa (permiso inventario_config)
//   POST { accion: 'estado', item_id, estado: 'paused'|'active', motivo? } (16-11, bodega) → pausar a mano (Igualar no la
//        reactiva) o activar (exige stock en ML). Publicación entera.
//   POST { accion: 'al_dia', valor } (17-11) → «Mi inventario está al día» de la empresa (permiso inventario_config)
//   POST { accion: 'sin_fisico', product_id, valor } (16-11) → «Se acabó»: todas sus publicaciones a 0 y quedan en 0 hasta
//        que entre mercancía o se ajuste el inventario; valor false = «Ya hay». No toca el inventario.
//   GET ?revisar=1 (16-11, «Vende de más», lib/vendeDeMas.ts) → antes relee de ML las activas que parecen vender más de lo
//        que hay (también para quien solo mira). Sin revisar, igual guarda el estado (numerito del menú al día).

async function sesion(accion: boolean) {
  const s = await sesionPreguntas(accion ? 'reponer_stock' : undefined)
  if ('error' in s) return s
  if (!tieneModulo(s.session.user, 'inventario') || !puede(s.session.user, 'ver_inventario')) {
    return { error: NextResponse.json({ error: 'No tienes acceso al inventario' }, { status: 403 }) } as const
  }
  return s
}

export async function GET(req: NextRequest) {
  const s = await sesion(false)
  if ('error' in s) return s.error
  try {
    const pais = s.session.user.country
    const revisar = req.nextUrl.searchParams.get('revisar') === '1'
    // sinVincular: activas y con unidades en ML pero sin producto: se venden sin que el inventario se entere (aviso → Vincular).
    // desactivados (17-11): productos desactivados con publicaciones activas en ML (ya no se les controla el stock).
    const [filas, reserva, sinVincular, desactivados, inventarioAlDia, { rows: [cola] }, tablas] = await Promise.all([
      revisar ? revisarVendeDeMas(s.db, pais).then(r => r.filas)
              : filasStockML(s.db, pais).then(async f => { await guardarEstadoVende(s.db, f).catch(() => {}); return f }),
      leerReserva(s.db), contarSinVincular(s.db), desactivadosPublicados(s.db), leerInventarioAlDia(s.db),
      // 17-11: lo que está en la cola de ML desde esta pantalla (al volver, se sigue viendo el avance).
      s.db.query(`SELECT id::int, total::int, tipo FROM ml_pub_lotes WHERE tipo IN ('stock', 'estado') AND estado = 'en_curso'
                  ORDER BY creado_at DESC LIMIT 1`),
      leerTablasEnvio(s.db)])
    return NextResponse.json({ filas, reserva, sinVincular, desactivados, inventarioAlDia,
                               cola: cola ? { id: cola.id, total: cola.total, que: cola.tipo === 'stock' ? 'Poniendo en ML lo que hay' : 'Cambiando el estado de publicaciones' } : null,
                               puedeCambiar: puede(s.session.user, 'reponer_stock'),
                               puedeReserva: puede(s.session.user, 'inventario_config'), puedeReactivar: puede(s.session.user, 'ver_productos'),
                               // 18-11 «Crear pack» (POST /api/publicaciones/pack): mismo permiso y módulo que editar publicaciones.
                               puedePack: pais === 'VE' && puede(s.session.user, 'editar_publicaciones') && tieneModulo(s.session.user, 'publicaciones'),
                               tablas })
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
  z.object({ accion: z.literal('al_dia'), valor: z.boolean() }),
  z.object({ accion: z.literal('estado'), item_id: z.string().regex(/^[A-Z]{3}\d+$/), estado: z.enum(['paused', 'active']),
             motivo: z.string().trim().max(200).optional() }),
  z.object({ accion: z.literal('sin_fisico'), product_id: z.number().int().positive(), valor: z.boolean() }),
  z.object({ accion: z.literal('estados'), items: z.array(z.string().regex(/^[A-Z]{3}\d+$/)).min(1).max(10),
             estado: z.enum(['paused', 'active']), motivo: z.string().trim().max(200).optional() }),
  // 17-11 (mig 185): más de 10 publicaciones van por la cola de ML (siguen aunque se cierre la pantalla).
  z.object({ accion: z.literal('cola_stock'), pubs: z.array(z.object({
    item_id: z.string().regex(/^[A-Z]{3}\d+$/), variante_id: z.string().regex(/^\d+$/).nullable() })).min(1).max(3000) }),
  z.object({ accion: z.literal('cola_estado'), items: z.array(z.string().regex(/^[A-Z]{3}\d+$/)).min(1).max(3000),
             estado: z.enum(['paused', 'active']), motivo: z.string().trim().max(200).optional() }),
  z.object({ accion: z.literal('lote'), id: z.number().int().positive() }),
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
      if (b.accion === 'unidades') await pasarPesos(s.db)   // 14-11: al marcar «trae N u.» el peso puede quedar claro
      return NextResponse.json({ ok: true })
    }
    if (b.accion === 'reserva') {
      if (!puede(s.session.user, 'inventario_config')) return NextResponse.json({ error: 'No tienes permiso para cambiar la reserva' }, { status: 403 })
      await s.db.query(
        `INSERT INTO app_settings (key, value) VALUES ('stock_ml_reserva', $1)
         ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value`, [String(b.unidades)])
      return NextResponse.json({ ok: true })
    }
    if (b.accion === 'al_dia') {
      if (!puede(s.session.user, 'inventario_config')) return NextResponse.json({ error: 'No tienes permiso para cambiar esto' }, { status: 403 })
      await guardarInventarioAlDia(s.db, b.valor)
      return NextResponse.json({ ok: true })
    }
    if (b.accion === 'cola_stock' || b.accion === 'cola_estado') {
      const usuario = Number(s.session.user.id)
      if (b.accion === 'cola_stock') {
        const porItem = new Map<string, (string | null)[]>()
        for (const p of b.pubs) porItem.set(p.item_id, [...new Set([...(porItem.get(p.item_id) ?? []), p.variante_id])])
        const id = await crearLote(s.db, 'stock', `Poner en ML lo que hay (${b.pubs.length})`, {},
          [...porItem].map(([item, variantes]) => ({ item, datos: { variantes } })), usuario)
        return NextResponse.json({ lote: { id, total: porItem.size, que: 'Poniendo en ML lo que hay' } })
      }
      const items = [...new Set(b.items)]
      const id = await crearLote(s.db, 'estado', `${b.estado === 'paused' ? 'Pausar' : 'Activar'} ${items.length} publicaciones`,
        { estado: b.estado, motivo: b.motivo ?? null }, items.map(item => ({ item })), usuario)
      return NextResponse.json({ lote: { id, total: items.length, que: b.estado === 'paused' ? 'Pausando publicaciones' : 'Activando publicaciones' } })
    }
    if (b.accion === 'lote') {
      const { rows: [l] } = await s.db.query(
        `SELECT l.estado, COUNT(i.*)::int AS total,
                COUNT(*) FILTER (WHERE i.estado IN ('ok', 'sin_cambio', 'saltada'))::int AS hechos,
                COUNT(*) FILTER (WHERE i.estado = 'error')::int AS errores,
                (array_agg(i.item_id || ': ' || COALESCE(i.mensaje, 'error')) FILTER (WHERE i.estado = 'error'))[1:5] AS lista
         FROM ml_pub_lotes l LEFT JOIN ml_pub_lote_items i ON i.lote_id = l.id
         WHERE l.id = $1 AND l.tipo IN ('stock', 'estado') GROUP BY l.id`, [b.id])
      if (!l) return NextResponse.json({ error: 'No se encontró' }, { status: 404 })
      return NextResponse.json({ ...l, terminado: l.estado !== 'en_curso', lista: l.lista ?? [] })
    }
    if (b.accion === 'estados') {
      // 16-11: pausar / activar varias (la pantalla manda de a 10, con avance, como «Igualar»).
      const resultados: Resultado[] = []
      for (const it of [...new Set(b.items)]) {
        resultados.push(await cambiarEstadoML(s.db, it, b.estado, { usuarioId: Number(s.session.user.id), motivo: b.motivo }))
      }
      const hechos = resultados.filter(x => x.ok).length
      if (hechos) await registrarUso(s.db, 'stock', hechos)
      return NextResponse.json({ resultados })
    }
    if (b.accion === 'estado') {
      const r = await cambiarEstadoML(s.db, b.item_id, b.estado, { usuarioId: Number(s.session.user.id), motivo: b.motivo })
      if (r.ok) await registrarUso(s.db, 'stock', 1)
      return NextResponse.json({ resultados: [r] })
    }
    if (b.accion === 'sin_fisico') {
      const usuario = Number(s.session.user.id)
      if (!b.valor) {
        await s.db.query(`UPDATE products SET sin_fisico_at = NULL, sin_fisico_por = NULL WHERE id = $1`, [b.product_id])
        return NextResponse.json({ resultados: [] })
      }
      const { rowCount } = await s.db.query(`UPDATE products SET sin_fisico_at = NOW(), sin_fisico_por = $2 WHERE id = $1`, [b.product_id, usuario])
      if (!rowCount) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
      const f = (await filasStockML(s.db, s.session.user.country)).find(x => x.product_id === b.product_id)
      const resultados: Resultado[] = []
      for (const p of f?.pubs ?? []) {
        if (p.sin_sincronizar || p.entera_con_variantes || p.estado == null || !(p.ml_disponible ?? 0)) continue
        resultados.push(await aplicarCambio(s.db, { item_id: p.item_id, variante_id: p.variante_id, cantidad: 0 },
          { reactivar: false, origen: 'se_acabo', usuarioId: usuario }))
      }
      const hechos = resultados.filter(x => x.ok).length
      if (hechos) await registrarUso(s.db, 'stock', hechos)
      return NextResponse.json({ resultados })
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
      const total = f.pubs.filter(p => p.estado != null && p.ml_disponible != null && !p.sin_sincronizar
          && (!p.pausa_mano || pedidas.has(`${p.item_id}:${p.variante_id ?? ''}`)))
        .reduce((sum, p) => sum + (pedidas.get(`${p.item_id}:${p.variante_id ?? ''}`) ?? p.ml_disponible ?? 0) * p.unidades, 0)
      if (total > f.disponible) {
        return NextResponse.json({ error: `Entre todas las publicaciones serían ${total} y hay ${f.disponible} disponibles. Si hay más, corrige el stock primero.` }, { status: 400 })
      }
      const resultados: Resultado[] = []
      for (const [k, cantidad] of pedidas) {
        const p = pubs.get(k)!
        // 17-11: una pausada a mano no se reactiva por cambiarle el número (se activa con «Activar»).
        const reactivar = p.estado === 'paused' && cantidad > 0 && p.envio !== 'destino' && !p.pausa_mano
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
    const pubs = pubsPorClave(await filasStockML(s.db, s.session.user.country))
    const resultados: Resultado[] = []
    for (const x of b.pubs) resultados.push(await igualarPub(s.db, pubs, x, Number(s.session.user.id)))
    const hechos = resultados.filter(x => x.ok).length
    if (hechos) await registrarUso(s.db, 'stock', hechos)
    return NextResponse.json({ resultados })
  } catch (err) {
    return apiError(err)
  }
}
