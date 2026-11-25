import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { tieneModulo, type Modulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { esDuenoPlataforma } from '@/lib/empresa'
import { conTablasGlobales, guardarTablasEnvio, CLAVES_TABLA_ENVIO } from '@/lib/tablasEnvioGlobal'

// Claves que solo existen con su módulo: sin él no se guardan (y ml_descuento se lee como 0).
const DE_MODULO: Record<string, Modulo> = {
  ml_descuento: 'descuento_ml', ml_shipping_table: 'descuento_ml', ml_shipping_table_zoom: 'descuento_ml',
  transito_sale_factor: 'finanzas',
  bono_meta_1: 'bonos', bono_meta_2: 'bonos', bono_meta_3: 'bonos', bono_meta_4: 'bonos', bono_meta_5: 'bonos',
  bono_monto_1: 'bonos', bono_monto_2: 'bonos', bono_monto_3: 'bonos', bono_monto_4: 'bonos', bono_monto_5: 'bonos',
}

// Claves permitidas (parámetros de costos ML por país). Evita escrituras arbitrarias.
const ALLOWED = new Set([
  'ml_comision', 'ml_envio', 'ml_umbral', 'ml_descuento', // VE (ml_descuento = descuento manual global)
  'ml_shipping_table',                               // VE (tabla MercadoEnvíos peso→precio mín, JSON) = TEALCA
  'ml_shipping_table_zoom',                          // VE: la de ZOOM (19-10), mismos rangos de peso
  'ml_cuentas',                                      // cuentas de MercadoLibre de la empresa (JSON)
  'despacho_remitente',                              // remitente del manifiesto (vacío = nombre de la empresa)
  'preguntas_politicas',                             // Preguntas ML: políticas que usa la IA (texto libre)
  'preguntas_plantillas',                            // Preguntas ML: respuestas rápidas (JSON)
  'mensajes_plantillas',                             // Mensajes ML: respuestas rápidas post-venta (JSON)
  'calificaciones_plantillas',                       // Calificaciones ML: textos concretada / no concretada (JSON)
  'ml_umbral_envio', 'ml_envio_bajo', 'ml_envio_alto', 'ml_reten', // CO
  'transito_sale_factor',                            // Finanzas (global, vive en VE maestra)
  'bono_meta_1', 'bono_meta_2', 'bono_meta_3', 'bono_meta_4', 'bono_meta_5',       // Bonos: metas de ventas del mes
  'bono_monto_1', 'bono_monto_2', 'bono_monto_3', 'bono_monto_4', 'bono_monto_5',   // Bonos: monto de cada fase
  'rentab_sano', 'rentab_ajustado',                  // 14-11: colores de la rentabilidad sobre costo (lib/salud.ts)
  'margen_sano', 'margen_ajustado',                  // 14-11 (viejas, sobre venta): solo se leen para convertir
])

// Lo que puede leer y guardar quien tiene "Configurar automatizaciones" sin ser admin (lib/permisos.ts).
// El resto (costos ML, bonos, finanzas…) es de Ajustes: solo admin.
const DE_AUTOMATIZACIONES = new Set(['despacho_remitente', 'preguntas_politicas', 'preguntas_plantillas',
                                     'mensajes_plantillas', 'calificaciones_plantillas'])
// 14-11: Productos → Costos ML (permiso «Configurar costos ML», sin ser admin): comisión, envío y colores.
const DE_COSTOS_ML = new Set(['ml_comision', 'ml_envio', 'ml_umbral', 'rentab_sano', 'rentab_ajustado',
                              'ml_umbral_envio', 'ml_envio_bajo', 'ml_envio_alto', 'ml_reten'])
const accesoAjustes = (user: Parameters<typeof puede>[0] & { role: string }) =>
  user.role === 'admin' ? 'todo' : puede(user, 'automatizaciones_config') ? 'automatizaciones' : null

// GET /api/settings → { key: value, ... } del país de la sesión
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  // Leer: también quien ve Productos (los precios usan los costos ML de aquí).
  const acceso = puede(session.user, 'ver_productos') ? 'todo' : accesoAjustes(session.user)
  if (!acceso) return forbidden()

  try {
    // 12-11 (rapidez): sin la imagen del membrete (283 KB en SolucionesMC; la sirve /api/invoices/membrete) ni las
    // pausas de promociones (las lee su página): iban en cada pedido y dentro del HTML de Productos/Promociones/MercadoEnvíos.
    const { rows } = await db.query(`SELECT key, value FROM app_settings WHERE key <> 'membrete_factura_img' AND key NOT LIKE 'promo_pausa:%'`)
    const out: Record<string, string> = {}
    for (const r of rows) if (acceso === 'todo' || DE_AUTOMATIZACIONES.has(r.key)) out[r.key] = r.value
    // Sin el módulo Descuento ML, el descuento global es 0: publicado = final en todas las pantallas.
    if (!tieneModulo(session.user, 'descuento_ml')) out.ml_descuento = '0'
    // 14-11: la tabla de MercadoEnvíos es GLOBAL (la mantiene el dueño de la plataforma), igual para todas las empresas.
    return NextResponse.json(acceso === 'todo' ? await conTablasGlobales(out, session.user.country) : out)
  } catch (err) {
    return apiError(err)
  }
}

// PUT /api/settings → upsert de las claves enviadas (solo las permitidas)
export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const acceso = accesoAjustes(session.user)
  const costosML = puede(session.user, 'costos_ml_config')
  if (!acceso && !costosML) return forbidden()

  try {
    const body = z.record(z.string(), z.union([z.string(), z.number()])).parse(await req.json())
    // 14-11: la tabla de MercadoEnvíos es global → solo el dueño de la plataforma, y va a plataforma_config.
    const tabla = Object.fromEntries(CLAVES_TABLA_ENVIO.filter(k => body[k] != null).map(k => [k, String(body[k])]))
    for (const k of CLAVES_TABLA_ENVIO) delete body[k]
    if (Object.keys(tabla).length) {
      if (!esDuenoPlataforma(session.user) || session.user.country !== 'VE') {
        return NextResponse.json({ error: 'La tabla de MercadoEnvíos es la misma para todos y la mantiene El Comerciante Digital' }, { status: 403 })
      }
      for (const v of Object.values(tabla)) z.array(z.object({ maxKg: z.number().positive(), minPrice: z.number().nonnegative() })).min(1).parse(JSON.parse(v))
      await guardarTablasEnvio(tabla)
      if (!Object.keys(body).length) return NextResponse.json({ ok: true })
    }
    const entries = Object.entries(body)
      .filter(([k]) => ALLOWED.has(k) && (acceso === 'todo' || (acceso === 'automatizaciones' && DE_AUTOMATIZACIONES.has(k)) || (costosML && DE_COSTOS_ML.has(k)))
        && (!DE_MODULO[k] || tieneModulo(session.user, DE_MODULO[k])))
    if (entries.length === 0) {
      return NextResponse.json({ error: 'Sin claves válidas' }, { status: 400 })
    }
    for (const [key, value] of entries) {
      await db.query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, String(value)]
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError || err instanceof SyntaxError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
