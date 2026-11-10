// Editor de publicaciones de MercadoLibre (Fase 6 de las ideas de Mercasist, 2026-11-07, migración 151).
//
// Editar publicaciones EXISTENTES con una pantalla como la de ML. Probado en MLV (PIKEKE, 07-11) antes de armarlo:
//   - precio, stock, estado (activa/pausada) y descripción (PUT /items/{id}/description?api_version=2): sí.
//   - título: SOLO si la publicación no tiene ventas (ML: "Cannot update title when item has bids").
//   - características: se mandan SOLO las que cambiaron (ML deja las demás como estaban).
//   - fotos: se manda la lista completa en el orden nuevo ({id}); las nuevas se suben antes a /pictures/items/upload.
//   - variantes: se mandan TODAS por id (las que no se tocan van solo con su id, si no ML las borra); en la que cambia,
//     attribute_combinations (nombre propio: sin id, name + value_name) y picture_ids.
// Cada envío queda en ml_publicacion_cambios (antes / enviado / resultado). Nunca se crea ni se borra una publicación.
import type { Pool } from 'pg'
import { mlFetch, ErrorML, tokenVigente, CuentaDemo, ML_API } from '@/lib/ml'
import { componer, caracteresNoPermitidos, MAX_DESCRIPCION } from '@/lib/descripcionTexto'
import { plantillasDe, separacionDe, guardarSeparacion } from '@/lib/lotesPublicaciones'

// ── Lo que devuelve ML ──
export interface ValorML { id?: string | null; name?: string | null }
export interface AtributoItem { id: string; name: string; value_id?: string | null; value_name?: string | null }
export interface FotoItem { id: string; url?: string; secure_url?: string; size?: string; max_size?: string }
export interface CombinacionML { id?: string | null; name: string; value_id?: string | null; value_name?: string | null }
export interface VarianteItem {
  id: number; price?: number; available_quantity?: number; sold_quantity?: number
  attribute_combinations?: CombinacionML[]; picture_ids?: string[]
  attributes?: AtributoItem[]; seller_custom_field?: string | null
}
export interface ItemML {
  id: string; title: string; price: number; currency_id: string; available_quantity: number; sold_quantity: number
  status: string; sub_status?: string[]; permalink: string; thumbnail?: string; category_id: string
  listing_type_id?: string; condition?: string; catalog_listing?: boolean
  shipping?: { free_shipping?: boolean; logistic_type?: string; mode?: string }
  pictures?: FotoItem[]; attributes?: AtributoItem[]; variations?: VarianteItem[]
  seller_custom_field?: string | null; tags?: string[]
}
interface AtributoCategoria {
  id: string; name: string; value_type: string; relevance?: number; hint?: string; tooltip?: string
  values?: ValorML[]; allowed_units?: ValorML[]; default_unit?: string; value_max_length?: number
  attribute_group_name?: string
  tags?: Record<string, boolean | undefined>
}

// ── Lo que ve la pantalla ──
export interface CampoFicha {
  id: string; nombre: string; tipo: string               // string · number · number_unit · list · boolean
  principal: boolean; obligatorio: boolean; ayuda: string | null; grupo: string | null
  valores: { id: string; nombre: string }[]              // opciones (list/boolean/string con sugerencias)
  unidades: string[]                                     // number_unit: cm, kg…
  unidad: string | null                                  // la que propone ML
  largoMax: number | null
  valorId: string | null; valor: string | null           // lo que tiene ahora la publicación
}
export interface Publicacion {
  item: {
    id: string; titulo: string; precio: number; moneda: string; stock: number; vendidas: number
    estado: string; subEstado: string[]; permalink: string; thumbnail: string | null; categoria: string
    tipo: string | null; condicion: string | null; envioGratis: boolean; catalogo: boolean
    tituloEditable: boolean
  }
  cuenta: { id: number; nickname: string }
  categoriaNombre: string | null
  fotos: { id: string; url: string }[]
  descripcion: string
  // Descripción en 3 partes (08-11): encabezado y pie son textos guardados (plantillas); el cuerpo es de esta publicación.
  desc: { encabezadoId: number | null; pieId: number | null; condicionesId: number | null; cuerpo: string }
  plantillas: { id: number; tipo: 'encabezado' | 'condiciones' | 'pie'; nombre: string; texto: string; conexion_id: number | null }[]
  limites: { fotos: number; fotosVariante: number }   // de la categoría en ML (MLV: 12 y 10)
  campos: CampoFicha[]
  variantes: { id: number; precio: number | null; stock: number; vendidas: number; sku: string | null
               combinaciones: { id: string | null; nombre: string; valor: string }[]; fotos: string[] }[]
  comision: number            // % de comisión de ML guardado en Ajustes (estimado)
  historial: { id: number; fecha: string; usuario: string | null; partes: string[]; ok: boolean; error: string | null }[]
}

// No se muestran: los maneja ML, van en las variantes o romperían la publicación.
const NO_EDITABLES = new Set(['ITEM_CONDITION', 'GTIN', 'SELLER_SKU', 'PRODUCT_FEATURES', 'SHIPMENT_PACKING'])

const errorDeML = (e: unknown) => {
  if (e instanceof ErrorML) {
    const d = e.datos as { message?: string; cause?: { message?: string; code?: string }[] } | null
    const causas = (d?.cause ?? []).map(c => c.message).filter(Boolean)
    if (causas.length) return causas.join(' · ')
    if (/has bids/i.test(d?.message ?? '')) return 'El título no se puede cambiar: la publicación ya tiene ventas (regla de MercadoLibre)'
    return d?.message ?? e.message
  }
  return e instanceof Error ? e.message : String(e)
}

/** De qué cuenta es la publicación (solo publicaciones de las cuentas conectadas de la empresa). */
export async function cuentaDe(db: Pool, itemId: string) {
  const { rows: [c] } = await db.query(
    `SELECT k.id, k.nickname FROM ml_catalogo m JOIN ml_conexiones k ON k.id = m.conexion_id
     WHERE m.item_id = $1 AND k.estado = 'activa'`, [itemId])
  return c as { id: number; nickname: string } | undefined
}

export async function leerPublicacion(db: Pool, itemId: string, country: string): Promise<Publicacion | null> {
  const cuenta = await cuentaDe(db, itemId)
  if (!cuenta) return null
  const it = await mlFetch<ItemML>(db, cuenta.id, `/items/${encodeURIComponent(itemId)}?include_attributes=all`)
  const [desc, attrsCat, cat, com, hist] = await Promise.all([
    mlFetch<{ plain_text?: string }>(db, cuenta.id, `/items/${encodeURIComponent(itemId)}/description`).catch(() => ({ plain_text: '' })),
    mlFetch<AtributoCategoria[]>(db, cuenta.id, `/categories/${encodeURIComponent(it.category_id)}/attributes`).catch(() => [] as AtributoCategoria[]),
    mlFetch<{ name?: string; path_from_root?: { name: string }[]; settings?: { max_pictures_per_item?: number; max_pictures_per_item_var?: number } }>(db, cuenta.id, `/categories/${encodeURIComponent(it.category_id)}`).catch(() => null),
    db.query(`SELECT value FROM app_settings WHERE key = 'ml_comision'`),
    db.query(
      `SELECT c.id, c.creado_at AS fecha, COALESCE(u.full_name, u.username) AS usuario, c.partes, c.ok, c.error
       FROM ml_publicacion_cambios c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.item_id = $1 ORDER BY c.creado_at DESC LIMIT 15`, [itemId]),
  ])

  const actuales = new Map((it.attributes ?? []).map(a => [a.id, a]))
  const campos: CampoFicha[] = []
  for (const a of attrsCat) {
    const t = a.tags ?? {}
    if (t.hidden || t.read_only || t.fixed || t.variation_attribute || t.others || NO_EDITABLES.has(a.id)) continue
    const v = actuales.get(a.id)
    campos.push({
      id: a.id, nombre: a.name, tipo: a.value_type,
      // En MLV casi todas vienen con relevance 1 (probado 07-11): "principales" son las que ML pide (como en su pantalla).
      principal: !!t.required || !!t.catalog_required || !!t.conditional_required,
      obligatorio: !!t.required || !!t.catalog_required,
      ayuda: a.hint ?? a.tooltip ?? null, grupo: a.attribute_group_name ?? null,
      valores: (a.values ?? []).filter(x => x.id && x.name).map(x => ({ id: String(x.id), nombre: String(x.name) })),
      unidades: (a.allowed_units ?? []).map(u => String(u.name ?? u.id ?? '')).filter(Boolean),
      largoMax: a.value_max_length ?? null,
      unidad: (a.allowed_units ?? []).find(u => u.id === a.default_unit)?.name ?? null,
      valorId: v?.value_id ?? null, valor: v?.value_name ?? null,
    })
  }
  // Las que tiene la publicación y la categoría ya no lista (se muestran igual, como secundarias).
  for (const v of it.attributes ?? []) {
    if (campos.some(c => c.id === v.id) || NO_EDITABLES.has(v.id) || !v.value_name) continue
    if (attrsCat.some(a => a.id === v.id)) continue
    campos.push({ id: v.id, nombre: v.name, tipo: 'string', principal: false, obligatorio: false, ayuda: null, grupo: null,
      valores: [], unidades: [], unidad: null, largoMax: null, valorId: v.value_id ?? null, valor: v.value_name ?? null })
  }

  const plantillas = await plantillasDe(db, cuenta.id)
  const sep = await separacionDe(db, itemId, cuenta.id, desc.plain_text ?? '', plantillas)
  const sku = (v: VarianteItem) => v.seller_custom_field?.trim() || v.attributes?.find(a => a.id === 'SELLER_SKU')?.value_name?.trim() || null
  return {
    item: {
      id: it.id, titulo: it.title, precio: it.price, moneda: it.currency_id, stock: it.available_quantity, vendidas: it.sold_quantity,
      estado: it.status, subEstado: it.sub_status ?? [], permalink: it.permalink, thumbnail: it.thumbnail ?? null, categoria: it.category_id,
      tipo: it.listing_type_id ?? null, condicion: it.condition ?? null, envioGratis: !!it.shipping?.free_shipping,
      catalogo: !!it.catalog_listing, tituloEditable: (it.sold_quantity ?? 0) === 0,
    },
    cuenta,
    categoriaNombre: cat?.path_from_root?.map(p => p.name).join(' › ') ?? cat?.name ?? null,
    fotos: (it.pictures ?? []).map(p => ({ id: p.id, url: p.secure_url ?? p.url ?? '' })),
    descripcion: desc.plain_text ?? '',
    desc: { encabezadoId: sep.encabezadoId, pieId: sep.pieId, condicionesId: sep.condicionesId, cuerpo: sep.cuerpo },
    plantillas,
    limites: { fotos: cat?.settings?.max_pictures_per_item ?? 12, fotosVariante: cat?.settings?.max_pictures_per_item_var ?? 10 },
    campos,
    variantes: (it.variations ?? []).map(v => ({
      id: v.id, precio: v.price ?? null, stock: v.available_quantity ?? 0, vendidas: v.sold_quantity ?? 0, sku: sku(v),
      combinaciones: (v.attribute_combinations ?? []).map(c => ({ id: c.id ?? null, nombre: c.name, valor: c.value_name ?? '' })),
      fotos: v.picture_ids ?? [],
    })),
    comision: Number(com.rows[0]?.value) || (country === 'CO' ? 15.5 : 12),
    historial: hist.rows.map(r => ({ ...r, fecha: new Date(r.fecha).toISOString() })),
  }
}

// ── Guardar ──
export interface CambiosPublicacion {
  titulo?: string
  precio?: number
  stock?: number                       // solo sin variantes
  estado?: 'active' | 'paused'
  descripcion?: string
  descPartes?: { encabezadoId: number | null; pieId: number | null; condicionesId?: number | null; cuerpo: string }   // gana sobre `descripcion`
  atributos?: { id: string; value_id?: string | null; value_name?: string | null }[]
  fotos?: string[]                     // ids en el orden nuevo (incluye las recién subidas)
  variantes?: { id: number; stock?: number; combinaciones?: { id: string | null; nombre: string; valor: string }[]; fotos?: string[] }[]
}
export interface ResultadoGuardar { ok: boolean; errores: { parte: string; mensaje: string }[]; guardado: string[] }

export async function guardarPublicacion(db: Pool, itemId: string, c: CambiosPublicacion, userId: number | null): Promise<ResultadoGuardar> {
  const cuenta = await cuentaDe(db, itemId)
  if (!cuenta) return { ok: false, errores: [{ parte: 'publicacion', mensaje: 'La publicación no es de una cuenta conectada' }], guardado: [] }
  const it = await mlFetch<ItemML>(db, cuenta.id, `/items/${encodeURIComponent(itemId)}?include_attributes=all`)
  const errores: ResultadoGuardar['errores'] = []
  const guardado: string[] = []
  const body: Record<string, unknown> = {}
  const partes: string[] = []
  const antes: Record<string, unknown> = {}

  // 11-11: sin espacios de más (ver EditorPublicacion): solo cuenta un cambio de verdad.
  const normal = (t: string) => t.replace(/\s+/g, ' ').trim()
  if (c.titulo !== undefined && normal(c.titulo) !== normal(it.title ?? '')) {
    if ((it.sold_quantity ?? 0) > 0) errores.push({ parte: 'titulo', mensaje: 'El título no se puede cambiar: la publicación ya tiene ventas (regla de MercadoLibre)' })
    else { body.title = c.titulo.trim(); partes.push('titulo'); antes.titulo = it.title }
  }
  if (c.estado && c.estado !== it.status) { body.status = c.estado; partes.push('estado'); antes.estado = it.status }
  if (c.atributos?.length) {
    const cambia = c.atributos.filter(a => {
      const v = it.attributes?.find(x => x.id === a.id)
      return (a.value_id ?? null) !== (v?.value_id ?? null) || (a.value_name ?? null) !== (v?.value_name ?? null)
    })
    if (cambia.length) {
      body.attributes = cambia.map(a => a.value_id ? { id: a.id, value_id: a.value_id } : { id: a.id, value_name: a.value_name ?? null })
      partes.push('caracteristicas')
      antes.caracteristicas = cambia.map(a => { const v = it.attributes?.find(x => x.id === a.id); return { id: a.id, value_id: v?.value_id ?? null, value_name: v?.value_name ?? null } })
    }
  }
  const fotosAhora = (it.pictures ?? []).map(p => p.id)
  const fotosNuevas = c.fotos && c.fotos.join(',') !== fotosAhora.join(',') ? c.fotos : null
  if (fotosNuevas) {
    if (!fotosNuevas.length) errores.push({ parte: 'fotos', mensaje: 'La publicación tiene que tener al menos una foto' })
    else { body.pictures = fotosNuevas.map(id => ({ id })); partes.push('fotos'); antes.fotos = fotosAhora }
  }

  const vars = it.variations ?? []
  const precioCambia = c.precio !== undefined && Math.abs(c.precio - it.price) > 0.0001
  if (vars.length) {
    const editadas = new Map((c.variantes ?? []).map(v => [v.id, v]))
    let tocaVariantes = precioCambia || !!fotosNuevas
    const enviar = vars.map(v => {
      const e = editadas.get(v.id)
      const out: Record<string, unknown> = { id: v.id }
      if (precioCambia) out.price = c.precio
      if (e?.stock !== undefined && e.stock !== (v.available_quantity ?? 0)) { out.available_quantity = e.stock; tocaVariantes = true }
      const combos = e?.combinaciones
      const comboCambia = combos && combos.map(x => x.valor.trim()).join('|') !== (v.attribute_combinations ?? []).map(x => x.value_name ?? '').join('|')
      if (combos && comboCambia) {
        out.attribute_combinations = combos.map(x => x.id ? { id: x.id, value_name: x.valor.trim() } : { name: x.nombre, value_name: x.valor.trim() })
        tocaVariantes = true
      }
      const fotosVar = e?.fotos && e.fotos.join(',') !== (v.picture_ids ?? []).join(',') ? e.fotos : null
      if (fotosVar || fotosNuevas) {
        const lista = (fotosVar ?? v.picture_ids ?? []).filter(id => (fotosNuevas ?? fotosAhora).includes(id))
        if (!lista.length) errores.push({ parte: 'variantes', mensaje: `La variante ${(v.attribute_combinations ?? []).map(x => x.value_name).join(' / ') || v.id} se queda sin fotos` })
        if (fotosVar || lista.length !== (v.picture_ids ?? []).length) { out.picture_ids = lista; tocaVariantes = true }
      }
      return out
    })
    if (tocaVariantes) {
      body.variations = enviar
      if (precioCambia) { partes.push('precio'); antes.precio = it.price }
      if (enviar.some(v => Object.keys(v).some(k => k !== 'id' && k !== 'price'))) partes.push('variantes')
      antes.variantes = vars.map(v => ({ id: v.id, price: v.price, available_quantity: v.available_quantity,
        attribute_combinations: v.attribute_combinations, picture_ids: v.picture_ids }))
    }
  } else {
    if (precioCambia) { body.price = c.precio; partes.push('precio'); antes.precio = it.price }
    if (c.stock !== undefined && c.stock !== it.available_quantity) { body.available_quantity = c.stock; partes.push('stock'); antes.stock = it.available_quantity }
  }

  // Si algo no se puede mandar, no se manda nada (para no dejar la publicación a medias).
  if (errores.length) return { ok: false, errores, guardado }

  const anotar = (ps: string[], enviado: unknown, ok: boolean, error: string | null, ant: unknown) =>
    db.query(`INSERT INTO ml_publicacion_cambios (conexion_id, item_id, user_id, partes, antes, enviado, ok, error)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [cuenta.id, itemId, userId, ps, JSON.stringify(ant), JSON.stringify(enviado), ok, error]).catch(e => console.error('[publicacion cambios]', e))

  if (Object.keys(body).length) {
    try {
      const r = await mlFetch<ItemML>(db, cuenta.id, `/items/${encodeURIComponent(itemId)}`, { method: 'PUT', body })
      guardado.push(...partes)
      await anotar(partes, body, true, null, antes)
      await db.query(
        `UPDATE ml_catalogo SET titulo = $2, precio = $3, disponible = $4, estado = $5, thumbnail = COALESCE($6, thumbnail), actualizado_at = NOW()
         WHERE item_id = $1`, [itemId, r.title ?? it.title, r.price ?? it.price, r.available_quantity ?? it.available_quantity, r.status ?? it.status, r.thumbnail ?? null])
        .catch(() => {})
    } catch (e) {
      const m = errorDeML(e)
      errores.push({ parte: partes.join(', '), mensaje: m })
      await anotar(partes, body, false, m, antes)
    }
  }
  let partes3: CambiosPublicacion['descPartes'] | null = null
  if (c.descPartes) {
    // Se arma acá con los textos guardados de ahora (no con lo que mandó la pantalla).
    const ps = await plantillasDe(db, cuenta.id)
    const enc = c.descPartes.encabezadoId == null ? null : ps.find(x => x.id === c.descPartes!.encabezadoId)
    const pie = c.descPartes.pieId == null ? null : ps.find(x => x.id === c.descPartes!.pieId)
    const cond = c.descPartes.condicionesId == null ? null : ps.find(x => x.id === c.descPartes!.condicionesId)
    if ((c.descPartes.encabezadoId != null && !enc) || (c.descPartes.pieId != null && !pie) || (c.descPartes.condicionesId != null && !cond)) {
      errores.push({ parte: 'descripcion', mensaje: 'El encabezado, las condiciones o el pie elegido ya no existe (o es de otra cuenta)' })
    } else {
      partes3 = { encabezadoId: enc?.id ?? null, pieId: pie?.id ?? null, condicionesId: cond?.id ?? null, cuerpo: c.descPartes.cuerpo }
      c.descripcion = componer(enc?.texto, c.descPartes.cuerpo, pie?.texto, cond?.texto)
    }
  }
  if (c.descripcion !== undefined) {
    const malos = caracteresNoPermitidos(c.descripcion)
    if (malos.length) { errores.push({ parte: 'descripcion', mensaje: `Tiene caracteres que MercadoLibre no acepta: ${malos.join(' ')}` }); c.descripcion = undefined }
    else if (c.descripcion.length > MAX_DESCRIPCION) { errores.push({ parte: 'descripcion', mensaje: `Pasa de ${MAX_DESCRIPCION} caracteres` }); c.descripcion = undefined }
  }
  if (c.descripcion !== undefined) {
    const d = await mlFetch<{ plain_text?: string }>(db, cuenta.id, `/items/${encodeURIComponent(itemId)}/description`).catch(() => ({ plain_text: '' }))
    if (partes3) await guardarSeparacion(db, itemId, cuenta.id, partes3, (d.plain_text ?? '').trim() === c.descripcion.trim() ? c.descripcion : d.plain_text ?? '')
    if ((d.plain_text ?? '').trim() !== c.descripcion.trim()) {
      const enviado = { plain_text: c.descripcion.trim() }
      try {
        await mlFetch(db, cuenta.id, `/items/${encodeURIComponent(itemId)}/description?api_version=2`, { method: 'PUT', body: enviado })
        guardado.push('descripcion')
        await anotar(['descripcion'], enviado, true, null, { descripcion: d.plain_text ?? '' })
        if (partes3) await guardarSeparacion(db, itemId, cuenta.id, partes3, enviado.plain_text)
      } catch (e) {
        const m = errorDeML(e)
        errores.push({ parte: 'descripcion', mensaje: m })
        await anotar(['descripcion'], enviado, false, m, { descripcion: d.plain_text ?? '' })
      }
    }
  }
  return { ok: !errores.length, errores, guardado }
}

/** Sube una foto a MercadoLibre (queda suelta hasta que se agrega a la publicación). Devuelve su id. */
export async function subirFoto(db: Pool, itemId: string, archivo: Blob, nombre: string) {
  const cuenta = await cuentaDe(db, itemId)
  if (!cuenta) throw new Error('La publicación no es de una cuenta conectada')
  let token: string
  try { token = await tokenVigente(db, cuenta.id) } catch (e) {
    if (e instanceof CuentaDemo) throw new Error('En la cuenta de demostración no se suben fotos')
    throw e
  }
  const form = new FormData()
  form.append('file', archivo, nombre)
  const r = await fetch(`${ML_API}/pictures/items/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, cache: 'no-store' })
  const d = await r.json().catch(() => null) as { id?: string; variations?: { secure_url?: string; url?: string; size?: string }[]; message?: string } | null
  if (!r.ok || !d?.id) throw new Error(`MercadoLibre no aceptó la foto${d?.message ? `: ${d.message}` : ''}`)
  const grande = [...(d.variations ?? [])].sort((a, b) => parseInt(b.size ?? '0') - parseInt(a.size ?? '0'))[0]
  return { id: d.id, url: grande?.secure_url ?? grande?.url ?? '' }
}
