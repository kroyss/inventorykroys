// Publicaciones en lote (08-11-2026, mig 152): descripción en 3 partes con textos guardados (encabezados y pies),
// cambios en muchas publicaciones a la vez (poner/cambiar encabezado o pie, precios) y lectura de las descripciones
// para detectar textos repetidos. Los lotes los procesa el cron de a pocas publicaciones por minuto (para no saturar
// a ML); cada cambio queda en ml_publicacion_cambios con lo que había antes.
import type { Pool } from 'pg'
import { mlFetch, ErrorML } from '@/lib/ml'
import { componer, mismoTexto, separar, caracteresNoPermitidos, MAX_DESCRIPCION, NOMBRE_TIPO, type PlantillaTexto, type TipoTexto, quitarParecido, similitud } from '@/lib/descripcionTexto'
import { cuentaDe, guardarPublicacion } from '@/lib/publicacionesML'

export interface Plantilla extends PlantillaTexto { nombre: string; conexion_id: number | null; usos?: number }
export interface Separacion { encabezadoId: number | null; pieId: number | null; condicionesId: number | null; cuerpo: string; separada: boolean }
export type Partes = { encabezadoId: number | null; pieId: number | null; condicionesId?: number | null; cuerpo: string }
const textoDe = (ps: Plantilla[], s: Partes) => componer(ps.find(x => x.id === s.encabezadoId)?.texto, s.cuerpo, ps.find(x => x.id === s.pieId)?.texto, ps.find(x => x.id === s.condicionesId)?.texto)

const POR_PASADA_ESCRIBIR = 12
const POR_PASADA_LEER = 25

/** Las plantillas que sirven para una cuenta (las generales + las de esa cuenta). */
export async function plantillasDe(db: Pool, conexionId: number | null): Promise<Plantilla[]> {
  const { rows } = await db.query(
    `SELECT id::int, tipo, nombre, texto, conexion_id FROM ml_desc_plantillas
     WHERE $1::int IS NULL OR conexion_id IS NULL OR conexion_id = $1 ORDER BY tipo, nombre`, [conexionId])
  return rows
}

/** Cómo está separada la descripción de una publicación: lo guardado si sigue igual a lo que hay en ML; si no
 *  (o nunca se separó), se separa sola con las plantillas (texto exacto al inicio / al final). */
export async function separacionDe(db: Pool, itemId: string, conexionId: number, textoML: string, plantillas?: Plantilla[]): Promise<Separacion> {
  const ps = plantillas ?? await plantillasDe(db, conexionId)
  const { rows: [r] } = await db.query(
    `SELECT encabezado_id::int, pie_id::int, condiciones_id::int, cuerpo, texto_ml FROM ml_item_descripcion WHERE item_id = $1`, [itemId])
  if (r && r.cuerpo != null) {
    const enc = ps.find(p => p.id === r.encabezado_id), pie = ps.find(p => p.id === r.pie_id), cond = ps.find(p => p.id === r.condiciones_id)
    // Vale lo guardado si en ML sigue el mismo texto que dejamos (aunque después se haya cambiado la plantilla:
    // así, al actualizar un pie en lote, se reemplaza el viejo y no se duplica) o si coincide con las plantillas de ahora.
    if ((r.texto_ml != null && mismoTexto(r.texto_ml, textoML)) || mismoTexto(componer(enc?.texto, r.cuerpo, pie?.texto, cond?.texto), textoML)) {
      return { encabezadoId: enc?.id ?? null, pieId: pie?.id ?? null, condicionesId: cond?.id ?? null, cuerpo: r.cuerpo, separada: true }
    }
  }
  const s = separar(textoML, ps)
  return { encabezadoId: s.encabezado?.id ?? null, pieId: s.pie?.id ?? null, condicionesId: s.condiciones?.id ?? null, cuerpo: s.cuerpo, separada: !!(s.encabezado || s.pie || s.condiciones) }
}

export async function guardarSeparacion(db: Pool, itemId: string, conexionId: number, s: Partes, textoML: string) {
  await db.query(
    `INSERT INTO ml_item_descripcion (item_id, conexion_id, encabezado_id, pie_id, condiciones_id, cuerpo, texto_ml, leido_at, actualizado_at)
     VALUES ($1, $2, $3, $4, $7, $5, $6, NOW(), NOW())
     ON CONFLICT (empresa_id, item_id) DO UPDATE SET conexion_id = EXCLUDED.conexion_id, encabezado_id = EXCLUDED.encabezado_id,
       pie_id = EXCLUDED.pie_id, condiciones_id = EXCLUDED.condiciones_id, cuerpo = EXCLUDED.cuerpo, texto_ml = EXCLUDED.texto_ml, leido_at = NOW(), actualizado_at = NOW()`,
    [itemId, conexionId, s.encabezadoId, s.pieId, s.cuerpo, textoML, s.condicionesId ?? null])
}

const leerDescripcion = async (db: Pool, conexionId: number, itemId: string) =>
  (await mlFetch<{ plain_text?: string }>(db, conexionId, `/items/${encodeURIComponent(itemId)}/description`)
    .catch(e => { if (e instanceof ErrorML && e.status === 404) return { plain_text: '' }; throw e })).plain_text ?? ''

const mensajeML = (e: unknown) => {
  if (e instanceof ErrorML) {
    const d = e.datos as { message?: string; cause?: { message?: string }[] } | null
    return (d?.cause ?? []).map(c => c.message).filter(Boolean).join(' · ') || d?.message || e.message
  }
  return e instanceof Error ? e.message : String(e)
}

/** Manda una descripción a ML y la anota (antes / después). */
export async function mandarDescripcion(db: Pool, conexionId: number, itemId: string, antes: string, nuevo: string, userId: number | null) {
  const enviado = { plain_text: nuevo }
  try {
    await mlFetch(db, conexionId, `/items/${encodeURIComponent(itemId)}/description?api_version=2`, { method: 'PUT', body: enviado })
    await db.query(`INSERT INTO ml_publicacion_cambios (conexion_id, item_id, user_id, partes, antes, enviado, ok) VALUES ($1, $2, $3, '{descripcion}', $4, $5, TRUE)`,
      [conexionId, itemId, userId, JSON.stringify({ descripcion: antes }), JSON.stringify(enviado)])
    return null
  } catch (e) {
    const m = mensajeML(e)
    await db.query(`INSERT INTO ml_publicacion_cambios (conexion_id, item_id, user_id, partes, antes, enviado, ok, error) VALUES ($1, $2, $3, '{descripcion}', $4, $5, FALSE, $6)`,
      [conexionId, itemId, userId, JSON.stringify({ descripcion: antes }), JSON.stringify(enviado), m]).catch(() => {})
    return m
  }
}

// ── Crear lotes ──
// noReconocida quedó de los lotes viejos (antes del 08-11): ya no se usa, el sistema decide solo.
export type ParametrosDescripcion = { parte: TipoTexto; plantillaId: number | null; noReconocida?: 'saltar' | 'agregar' }
export type ParametrosPrecio = { modo: 'porcentaje' | 'monto' | 'fijo'; valor: number; redondeo: 'no' | 'entero' | '90' }

export async function crearLote(db: Pool, tipo: 'descripcion' | 'precio' | 'leer', titulo: string, parametros: object, items: { item: string; datos?: object }[], userId: number | null) {
  const unicos = [...new Map(items.map(x => [x.item, x])).values()]
  const { rows: [l] } = await db.query(
    `INSERT INTO ml_pub_lotes (tipo, titulo, parametros, user_id, total) VALUES ($1, $2, $3, $4, $5) RETURNING id::int`,
    [tipo, titulo, JSON.stringify(parametros), userId, unicos.length])
  for (let i = 0; i < unicos.length; i += 500) {
    const parte = unicos.slice(i, i + 500)
    await db.query(
      `INSERT INTO ml_pub_lote_items (lote_id, item_id, datos) SELECT $1, x.item, x.datos
       FROM jsonb_to_recordset($2::jsonb) AS x(item text, datos jsonb) ON CONFLICT DO NOTHING`,
      [l.id, JSON.stringify(parte.map(x => ({ item: x.item, datos: x.datos ?? {} })))])
  }
  return l.id as number
}

/** Precio nuevo según la regla (sube/baja %, suma/resta monto o precio fijo) y el redondeo. */
export function precioNuevo(actual: number, p: ParametrosPrecio, moneda: string) {
  let v = p.modo === 'porcentaje' ? actual * (1 + p.valor / 100) : p.modo === 'monto' ? actual + p.valor : p.valor
  if (p.redondeo === 'entero') v = Math.round(v)
  else if (p.redondeo === '90') v = Math.max(0.9, Math.floor(v) + 0.9)
  else v = moneda === 'COP' ? Math.round(v) : Math.round(v * 100) / 100
  return v
}

// ── Procesar (cron) ──
async function tomar(db: Pool, tipo: 'escribir' | 'leer') {
  await db.query(`UPDATE ml_pub_lote_items SET estado = 'pendiente', tomado_at = NULL WHERE estado = 'procesando' AND tomado_at < NOW() - INTERVAL '10 minutes'`)
  const { rows } = await db.query(
    `UPDATE ml_pub_lote_items i SET estado = 'procesando', tomado_at = NOW()
     FROM (SELECT i2.lote_id, i2.item_id FROM ml_pub_lote_items i2 JOIN ml_pub_lotes l ON l.id = i2.lote_id
           WHERE i2.estado = 'pendiente' AND l.estado = 'en_curso' AND (l.tipo = 'leer') = $1
           ORDER BY l.creado_at, i2.item_id LIMIT $2 FOR UPDATE OF i2 SKIP LOCKED) x
     WHERE i.lote_id = x.lote_id AND i.item_id = x.item_id
     RETURNING i.lote_id::int, i.item_id, i.datos`, [tipo === 'leer', tipo === 'leer' ? POR_PASADA_LEER : POR_PASADA_ESCRIBIR])
  return rows as { lote_id: number; item_id: string; datos: Record<string, unknown> }[]
}

const terminar = (db: Pool, loteId: number, itemId: string, estado: string, mensaje: string | null) =>
  db.query(`UPDATE ml_pub_lote_items SET estado = $3, mensaje = $4, hecho_at = NOW() WHERE lote_id = $1 AND item_id = $2`, [loteId, itemId, estado, mensaje])

export async function procesarLotes(db: Pool) {
  const r = { hechas: 0, errores: 0 }
  const lotes = new Map<number, { tipo: string; parametros: Record<string, unknown>; user_id: number | null }>()
  const loteDe = async (id: number) => {
    if (!lotes.has(id)) {
      const { rows: [l] } = await db.query(`SELECT tipo, parametros, user_id FROM ml_pub_lotes WHERE id = $1`, [id])
      lotes.set(id, l)
    }
    return lotes.get(id)!
  }
  for (const tipo of ['escribir', 'leer'] as const) {
    for (const it of await tomar(db, tipo)) {
      const l = await loteDe(it.lote_id)
      try {
        const [estado, mensaje] = await procesarItem(db, l, it)
        await terminar(db, it.lote_id, it.item_id, estado, mensaje)
        if (estado === 'error') r.errores++; else r.hechas++
      } catch (e) {
        await terminar(db, it.lote_id, it.item_id, 'error', mensajeML(e))
        r.errores++
      }
    }
  }
  await db.query(
    `UPDATE ml_pub_lotes l SET estado = 'terminado', terminado_at = NOW()
     WHERE l.estado = 'en_curso' AND NOT EXISTS (SELECT 1 FROM ml_pub_lote_items i WHERE i.lote_id = l.id AND i.estado IN ('pendiente', 'procesando'))`)
  return r.hechas || r.errores ? r : null
}

async function procesarItem(db: Pool, l: { tipo: string; parametros: Record<string, unknown>; user_id: number | null },
  it: { item_id: string; datos: Record<string, unknown> }): Promise<[string, string | null]> {
  const cuenta = await cuentaDe(db, it.item_id)
  if (!cuenta) return ['error', 'La publicación ya no está en una cuenta conectada']

  if (l.tipo === 'leer') {
    const texto = await leerDescripcion(db, cuenta.id, it.item_id)
    const s = await separacionDe(db, it.item_id, cuenta.id, texto)
    const { rows: [r] } = await db.query(`SELECT cuerpo FROM ml_item_descripcion WHERE item_id = $1`, [it.item_id])
    if (s.separada || r?.cuerpo != null) await guardarSeparacion(db, it.item_id, cuenta.id, s, texto)
    else await db.query(
      `INSERT INTO ml_item_descripcion (item_id, conexion_id, texto_ml, leido_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (empresa_id, item_id) DO UPDATE SET texto_ml = EXCLUDED.texto_ml, leido_at = NOW()`, [it.item_id, cuenta.id, texto])
    return ['ok', null]
  }

  if (l.tipo === 'precio') {
    const nuevo = Number(it.datos.precio_nuevo)
    if (!(nuevo > 0)) return ['error', 'Precio no válido']
    const res = await guardarPublicacion(db, it.item_id, { precio: nuevo }, l.user_id)
    if (!res.ok) return ['error', res.errores.map(e => e.mensaje).join(' · ')]
    return res.guardado.length ? ['ok', null] : ['sin_cambio', 'Ya tenía ese precio']
  }

  // Descripción: poner, cambiar o quitar un encabezado o un pie.
  const p = l.parametros as unknown as ParametrosDescripcion
  const ps = await plantillasDe(db, cuenta.id)
  const plantilla = p.plantillaId == null ? null : ps.find(x => x.id === p.plantillaId)
  if (p.plantillaId != null && !plantilla) return ['saltada', 'Ese texto es de otra cuenta (o se borró)']
  const texto = await leerDescripcion(db, cuenta.id, it.item_id)
  const s = await separacionDe(db, it.item_id, cuenta.id, texto, ps)
  const tieneParte = (p.parte === 'encabezado' ? s.encabezadoId : p.parte === 'condiciones' ? s.condicionesId : s.pieId) != null
  // 08-11 (el dueño): ya no se salta nada. Si no tiene esa parte reconocida, se busca un bloque PARECIDO pegado a mano
  // (versión vieja del mismo texto) y se reemplaza; si no hay nada parecido, se agrega.
  let cuerpo = s.cuerpo, pieId = s.pieId
  if (!tieneParte && plantilla) {
    const refs = ps.filter(x => x.id === plantilla.id || x.tipo === p.parte
      || (p.parte !== 'encabezado' && x.tipo !== 'encabezado')).map(x => x.texto)
    const q = quitarParecido(s.cuerpo, refs, p.parte === 'encabezado' ? 'inicio' : 'final')
    if (q !== null) cuerpo = q
    // Unas condiciones que hoy están guardadas como pie (el mismo bloque): pasan a ser las condiciones, sin repetir.
    if (p.parte === 'condiciones' && pieId != null) {
      const pie = ps.find(x => x.id === pieId)
      if (pie && similitud(pie.texto, plantilla.texto) >= 0.6) pieId = null
    }
  }
  const nuevaSep: Partes = { encabezadoId: s.encabezadoId, pieId, condicionesId: s.condicionesId, cuerpo }
  if (p.parte === 'encabezado') nuevaSep.encabezadoId = plantilla?.id ?? null
  else if (p.parte === 'condiciones') nuevaSep.condicionesId = plantilla?.id ?? null
  else nuevaSep.pieId = plantilla?.id ?? null
  const nuevo = textoDe(ps, nuevaSep)
  if (mismoTexto(nuevo, texto)) { await guardarSeparacion(db, it.item_id, cuenta.id, nuevaSep, texto); return ['sin_cambio', 'Ya lo tenía'] }
  if (nuevo.length > MAX_DESCRIPCION) return ['error', `La descripción quedaría de ${nuevo.length} caracteres (máximo ${MAX_DESCRIPCION})`]
  const malos = caracteresNoPermitidos(nuevo)
  if (malos.length) return ['error', `Tiene caracteres que ML no acepta: ${malos.join(' ')}`]
  const err = await mandarDescripcion(db, cuenta.id, it.item_id, texto, nuevo, l.user_id)
  if (err) return ['error', err]
  await guardarSeparacion(db, it.item_id, cuenta.id, nuevaSep, nuevo)
  return ['ok', null]
}

/** Después de crear o cambiar plantillas: separa sola cada descripción ya leída de la cuenta que todavía no la tenía. */
export async function resepararLeidas(db: Pool, conexionId: number | null) {
  const { rows } = await db.query(
    `SELECT item_id, conexion_id, texto_ml FROM ml_item_descripcion
     WHERE texto_ml IS NOT NULL AND ($1::int IS NULL OR conexion_id = $1)`, [conexionId])
  const porCuenta = new Map<number, Plantilla[]>()
  let n = 0
  for (const r of rows) {
    if (!porCuenta.has(r.conexion_id)) porCuenta.set(r.conexion_id, await plantillasDe(db, r.conexion_id))
    // Con las plantillas de ahora (no lo guardado): así una plantilla nueva se reconoce también donde ya había otra parte.
    const f = separar(r.texto_ml, porCuenta.get(r.conexion_id)!)
    if (f.encabezado || f.pie || f.condiciones) {
      await guardarSeparacion(db, r.item_id, r.conexion_id, { encabezadoId: f.encabezado?.id ?? null, pieId: f.pie?.id ?? null, condicionesId: f.condiciones?.id ?? null, cuerpo: f.cuerpo }, r.texto_ml)
      n++
    }
  }
  return n
}
