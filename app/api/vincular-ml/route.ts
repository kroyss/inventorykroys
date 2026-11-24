import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { desvincular, eliminarVarianteML, filasVincular, marcarNoUsa, productosParaVincular, vincular } from '@/lib/vincularML'
import { ErrorML } from '@/lib/ml'
import { pasarPesos } from '@/lib/pesosML'
import { buscarNuevas } from '@/lib/catalogoML'
import type { Pool } from 'pg'

/** 17-11: productos vinculados a la publicación ENTERA cuando todas sus variantes (del catálogo) ya tienen su propio vínculo. */
async function enteraVieja(db: Pool, pub: string) {
  const { rows } = await db.query(
    `SELECT p.id, p.code, p.name FROM product_ml_codes m JOIN products p ON p.id = m.product_id
     WHERE m.is_active AND m.ml_code = $1
       AND NOT EXISTS (
         SELECT 1 FROM ml_catalogo c, jsonb_array_elements(c.variantes) v
         WHERE substring(c.item_id FROM 4) = $1
           AND NOT EXISTS (SELECT 1 FROM product_ml_codes x WHERE x.is_active AND x.ml_code = $1 || ':' || (v->>'id')))
       AND EXISTS (SELECT 1 FROM ml_catalogo c WHERE substring(c.item_id FROM 4) = $1 AND jsonb_array_length(c.variantes) > 0)
     ORDER BY p.code`, [pub])
  return rows as { id: number; code: string; name: string }[]
}

// Vincular publicaciones de ML (20-10, migración 109; lib/vincularML.ts). Permiso "vincular_ml" (empleados, sin ver
// Productos). Precios solo para quien tiene "costos". Resolver dudas como "ignorada": quien ve Productos (el dueño).
//   GET  → filas (publicación/variante) + productos para elegir + avance
//   POST { accion: 'vincular', codigo, cuenta, product_id } · { accion: 'desvincular', codigo, product_id }
//        { accion: 'duda', codigo, cuenta, titulo, variante, nota } · { accion: 'ignorar', id }
//        { accion: 'no_usa', codigo, valor } (cualquiera que vincula) · { accion: 'eliminar_variante', codigo } (el dueño; borra en ML)
//        { accion: 'kit', codigo, cuenta, componentes: [{ product_id, unidades }] } · { accion: 'quitar_kit', codigo } (24-11, el dueño)
async function sesion() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: unauthorized() } as const
  const permitido = puede(session.user, 'vincular_ml') || (puede(session.user, 'ver_productos') && puede(session.user, 'importar_ml'))
  if (!permitido || !tieneModulo(session.user, 'inventario')) return { error: forbidden() } as const
  if (!tieneModulo(session.user, 'preguntas')) {
    return { error: NextResponse.json({ error: 'Primero hay que conectar las cuentas de MercadoLibre' }, { status: 400 }) } as const
  }
  return { session, db } as const
}

export async function GET(req: NextRequest) {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    // 17-11: solo la lista de productos (para «Dividir por variantes» en Stock en ML).
    if (req.nextUrl.searchParams.get('productos') === '1') return NextResponse.json({ productos: await productosParaVincular(s.db) })
    // 20-11 «Vincular por color» (panel): la publicación vinculada entera, sus variantes y los productos vinculados a ella.
    const colores = req.nextUrl.searchParams.get('colores')
    if (colores) {
      const pub = colores.replace(/^[A-Z]{3}/, '')
      if (!/^\d{5,15}$/.test(pub)) return NextResponse.json({ error: 'Publicación inválida' }, { status: 400 })
      const [{ rows: [c] }, { rows: vinc }] = await Promise.all([
        s.db.query(`SELECT item_id, titulo, estado, variantes FROM ml_catalogo WHERE substring(item_id FROM 4) = $1 LIMIT 1`, [pub]),
        s.db.query(
          // Lo vinculado a la publicación entera y a cada color (lo ya dividido viene elegido).
          `SELECT p.id, p.code, p.name, COALESCE(i.quantity, 0)::int AS stock, m.ml_account AS cuenta,
                  NULLIF(split_part(m.ml_code, ':', 2), '') AS variante
           FROM product_ml_codes m JOIN products p ON p.id = m.product_id LEFT JOIN inventory i ON i.product_id = p.id
           WHERE m.is_active AND split_part(m.ml_code, ':', 1) = $1 ORDER BY (m.ml_code = $1) DESC, p.code`, [pub]),
      ])
      if (!c) return NextResponse.json({ error: 'No encontré la publicación (actualiza las publicaciones)' }, { status: 404 })
      const vs: { id: number | string; nombre: string | null; disponible: number; foto?: string | null }[] = Array.isArray(c.variantes) ? c.variantes : []
      return NextResponse.json({
        item_id: c.item_id, titulo: c.titulo, estado: c.estado, cuenta: vinc[0]?.cuenta ?? null,
        variantes: vs.map(v => ({ id: String(v.id), nombre: v.nombre, disponible: Number(v.disponible) || 0, foto: v.foto ?? null })),
        vinculados: [...new Map(vinc.map(v => [v.id, { id: v.id, code: v.code, name: v.name }])).values()],
        actuales: Object.fromEntries(vinc.filter(v => v.variante).map(v => [String(v.variante), v.id])),
      })
    }
    const userId = Number(s.session.user.id)
    const [filas, productos, { rows: [hoy] }, { rows: [c] }] = await Promise.all([
      filasVincular(s.db, puede(s.session.user, 'costos'), userId),
      productosParaVincular(s.db),
      s.db.query(
        `SELECT COUNT(*)::int AS todos, COUNT(*) FILTER (WHERE vinculado_por = $1)::int AS mios
         FROM product_ml_codes WHERE is_active AND vinculado_at::date = CURRENT_DATE`, [userId]),
      s.db.query(`SELECT MIN(catalogo_at) AS at FROM ml_conexiones WHERE estado = 'activa'`),
    ])
    return NextResponse.json({
      filas, productos, hoy, actualizado_at: c?.at ?? null,
      esDueno: puede(s.session.user, 'ver_productos'),
    })
  } catch (err) {
    return apiError(err)
  }
}

const Codigo = z.string().regex(/^\d{5,15}(:\d{1,15})?$/, 'Código ML inválido')
const Body = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('vincular'), codigo: Codigo, cuenta: z.string().min(1).max(50), product_id: z.number().int().positive() }),
  z.object({ accion: z.literal('desvincular'), codigo: Codigo, product_id: z.number().int().positive() }),
  z.object({ accion: z.literal('duda'), codigo: Codigo, cuenta: z.string().max(50).optional(), titulo: z.string().max(300).optional(),
             variante: z.string().max(200).nullable().optional(), nota: z.string().trim().min(2, 'Escribe la duda (corto)').max(300) }),
  z.object({ accion: z.literal('ignorar'), id: z.number().int().positive() }),
  z.object({ accion: z.literal('no_usa'), codigo: Codigo, valor: z.boolean(), cuenta: z.string().max(50).optional(),
             titulo: z.string().max(300).optional(), variante: z.string().max(200).nullable().optional() }),
  z.object({ accion: z.literal('eliminar_variante'), codigo: Codigo, con_stock: z.boolean().optional() }),
  z.object({ accion: z.literal('buscar_nuevas') }),
  // 24-11 Kit (mig 198): la publicación (o variante) trae TODOS estos productos, cada uno × sus unidades. Solo el dueño.
  z.object({ accion: z.literal('kit'), codigo: Codigo, cuenta: z.string().min(1).max(50),
             componentes: z.array(z.object({ product_id: z.number().int().positive(), unidades: z.number().int().min(1).max(100) }))
               .min(2, 'Un kit lleva al menos 2 productos distintos').max(12) }),
  z.object({ accion: z.literal('quitar_kit'), codigo: Codigo }),
  z.object({ accion: z.literal('dividir'), item: z.string().regex(/^\d{5,15}$/), cuenta: z.string().min(1).max(50),
             asignaciones: z.array(z.object({ variante: z.string().regex(/^\d{1,15}$/), product_id: z.number().int().positive() })).min(1).max(100) }),
])

export async function POST(req: NextRequest) {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const b = Body.parse(await req.json())
    const userId = Number(s.session.user.id)
    // 13-11 (mig. 173): al abrir la pantalla, las publicaciones nuevas de cada cuenta (máx. cada 5 min por cuenta).
    if (b.accion === 'buscar_nuevas') {
      const { rows: cs } = await s.db.query(`SELECT id FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
      let nuevas = 0
      for (const c of cs) nuevas += (await buscarNuevas(s.db, c.id).catch(e => { console.error('[nuevas ML]', c.id, e instanceof Error ? e.message : e); return 0 })) ?? 0
      return NextResponse.json({ ok: true, nuevas })
    }
    // 17-11 «Dividir por variantes»: cada variante a su producto y se quita el vínculo de la publicación entera (el entero se quita al final).
    if (b.accion === 'dividir') {
      const ids = [...new Set(b.asignaciones.map(a => a.product_id))]
      const { rows } = await s.db.query(`SELECT id FROM products WHERE id = ANY($1::int[]) AND is_active`, [ids])
      if (rows.length !== ids.length) return NextResponse.json({ error: 'Algún producto no existe o está desactivado' }, { status: 400 })
      // Sin transacción (vincular() pide pesos y traga sus errores): si algo falla a medias, la variante vinculada ya le
      // gana al vínculo entero, y el entero se quita solo al final, cuando todas quedaron.
      for (const a of b.asignaciones) {
        // 20-11: cada color queda con UN producto: si ya tenía otro, ese vínculo se quita (queda quién y cuándo).
        await s.db.query(
          `UPDATE product_ml_codes SET is_active = FALSE, desvinculado_por = $3, desvinculado_at = NOW()
           WHERE ml_code = $1 AND is_active AND product_id <> $2`, [`${b.item}:${a.variante}`, a.product_id, userId])
        await vincular(s.db, a.product_id, b.cuenta, `${b.item}:${a.variante}`, userId)
      }
      await s.db.query(
        `UPDATE product_ml_codes SET is_active = FALSE, desvinculado_por = $2, desvinculado_at = NOW() WHERE ml_code = $1 AND is_active`,
        [b.item, userId])
      return NextResponse.json({ ok: true })
    }
    if (b.accion === 'kit' || b.accion === 'quitar_kit') {
      if (!puede(s.session.user, 'ver_productos')) return forbidden()
      if (b.accion === 'quitar_kit') {
        await s.db.query(`UPDATE product_ml_codes SET kit = FALSE, updated_at = NOW() WHERE ml_code = $1 AND is_active`, [b.codigo])
        return NextResponse.json({ ok: true })
      }
      const ids = b.componentes.map(c => c.product_id)
      if (new Set(ids).size !== ids.length) return NextResponse.json({ error: 'Hay un producto repetido: usa «u.» para poner cuántas trae' }, { status: 400 })
      const { rows } = await s.db.query(`SELECT id FROM products WHERE id = ANY($1::int[]) AND is_active`, [ids])
      if (rows.length !== ids.length) return NextResponse.json({ error: 'Algún producto no existe o está desactivado' }, { status: 400 })
      // Sin transacción, como «dividir» (vincular() pide pesos y traga sus errores): primero se vincula lo que falta, después
      // se quitan los que ya no van y al final se marca kit (hasta ahí sigue como compartida).
      const { rows: ya } = await s.db.query(`SELECT product_id FROM product_ml_codes WHERE ml_code = $1 AND is_active`, [b.codigo])
      const tenia = new Set(ya.map(r => r.product_id as number))
      for (const c of b.componentes) if (!tenia.has(c.product_id)) await vincular(s.db, c.product_id, b.cuenta, b.codigo, userId)
      await s.db.query(
        `UPDATE product_ml_codes SET is_active = FALSE, kit = FALSE, desvinculado_por = $3, desvinculado_at = NOW()
         WHERE ml_code = $1 AND is_active AND NOT (product_id = ANY($2::int[]))`, [b.codigo, ids, userId])
      await s.db.query(
        `UPDATE product_ml_codes m SET kit = TRUE, unidades = x.u, combo_revisado = TRUE, updated_at = NOW()
         FROM unnest($2::int[], $3::int[]) AS x(pid, u) WHERE m.ml_code = $1 AND m.is_active AND m.product_id = x.pid`,
        [b.codigo, ids, b.componentes.map(c => c.unidades)])
      await pasarPesos(s.db).catch(() => {})
      return NextResponse.json({ ok: true })
    }
    if (b.accion === 'vincular') {
      const { rows: [p] } = await s.db.query(`SELECT id FROM products WHERE id = $1 AND is_active`, [b.product_id])
      if (!p) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
      await vincular(s.db, b.product_id, b.cuenta, b.codigo, userId)
      // 17-11: si era la última variante sin producto propio y la publicación sigue vinculada entera (vínculo viejo), se avisa.
      return NextResponse.json({ ok: true, viejo: b.codigo.includes(':') ? await enteraVieja(s.db, b.codigo.split(':')[0]) : [] })
    }
    if (b.accion === 'desvincular') {
      const n = await desvincular(s.db, b.product_id, b.codigo, userId, !puede(s.session.user, 'ver_productos'))
      if (!n) return NextResponse.json({ error: 'Solo puedes deshacer lo que vinculaste tú (o ese vínculo ya no estaba)' }, { status: 409 })
      return NextResponse.json({ ok: true })
    }
    if (b.accion === 'duda') {
      await s.db.query(
        `INSERT INTO ml_vinculo_dudas (codigo, cuenta, titulo, variante, nota, por) VALUES ($1, $2, $3, $4, $5, $6)`,
        [b.codigo, b.cuenta ?? null, b.titulo ?? null, b.variante ?? null, b.nota, userId])
      return NextResponse.json({ ok: true })
    }
    if (b.accion === 'no_usa') {
      await marcarNoUsa(s.db, b.codigo, b.cuenta ?? null, b.titulo ?? null, b.variante ?? null, b.valor, userId)
      return NextResponse.json({ ok: true })
    }
    if (b.accion === 'eliminar_variante') {
      if (!puede(s.session.user, 'ver_productos')) return forbidden()
      try {
        const r = await eliminarVarianteML(s.db, b.codigo, userId, !!b.con_stock)
        return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 409 })
      } catch (e) {
        // 409 y no 502: Cloudflare cambia los 502 por su página y el mensaje de ML no llegaba a la pantalla.
        if (e instanceof ErrorML) {
          console.warn('[eliminar variante]', b.codigo, e.message, JSON.stringify(e.datos ?? null).slice(0, 500))
          // ML suele explicar el motivo en cause[] (el message es genérico).
          const causas = ((e.datos as { cause?: { message?: string }[] } | null)?.cause ?? []).map(c => c.message).filter(Boolean)
          return NextResponse.json({ error: causas.length ? `${e.message} · ${causas.join(' · ')}` : e.message }, { status: 409 })
        }
        throw e
      }
    }
    // Ignorar una duda (no se vincula): solo el dueño.
    if (!puede(s.session.user, 'ver_productos')) return forbidden()
    await s.db.query(`UPDATE ml_vinculo_dudas SET resuelta_at = NOW(), resuelta_por = $2, resolucion = 'ignorada' WHERE id = $1 AND resuelta_at IS NULL`,
      [b.id, userId])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
