// RECORDATORIOS DE PAGO (migración 088, decisión del dueño 2026-10-13): a quien compró y no
// concretó se le recuerda por mensaje de ML, 1 o 2 veces al día durante 1 a 5 días.
//
// Solo empresas con el módulo `pagos_me`: el pago traído del portal de MercadoEnvíos es la señal
// que lo hace seguro (simulación con las ventas del 04 al 09/10: empezando al 2.º día, 3 de 407
// compradores habrían recibido uno estando pagados). Reglas:
//   - APAGADO por defecto; el primero sale al 2.º día de la compra (el 1.º casi todos pagan);
//   - antes de cada turno se hace un "Traer ME" y se espera: si Pagos ME no responde o da error,
//     ese turno NO se manda nada (ante la duda, no molestar a quien ya pagó);
//   - se frena con cualquier señal: pago traído, venta registrada, guía en Despachos, calificada,
//     cancelada, el comprador escribió después de comprar, o "Ya pagó, no recordar";
//   - justo antes de mandar se relee la orden y la conversación en ML (no solo lo guardado).
import type { Pool } from 'pg'
import { mlFetch, ErrorML } from '@/lib/ml'
import { leerHilo } from '@/lib/mensajesML'
import { registrarOrigen } from '@/lib/respuestasOrigen'

export const CLAVE_CONFIG = 'recordatorios_pago'
export const CLAVE_TURNO = 'recordatorios_pago_turno'
/** Hora (del país) de cada turno: 1 al día = 10:00; 2 al día = 10:00 y 17:00. */
export const HORAS = [10, 17]
/** Un turno solo arranca dentro de estas horas desde su hora (prenderlo de noche no manda nada). */
const VENTANA_H = 3
/** Si Pagos ME no termina en estos minutos, el turno se omite. */
const ESPERA_ME_MIN = 20
const MAX_POR_TURNO = 60
/** ML corta los mensajes post-venta largos: el texto ya armado no puede pasar de esto. */
export const MAX_TEXTO = 350

export interface ConfigRecordatorios {
  activo: boolean
  dias: number            // 1–5
  veces: 1 | 2
  texto: string
  final: { activo: boolean; texto: string }   // el último recordatorio, con otro texto
}

export const CONFIG_DEFECTO: ConfigRecordatorios = {
  activo: false, dias: 3, veces: 1,
  texto: 'Hola {nombre}, te recordamos tu compra de {producto}. Cuando realices el pago, envíanos el comprobante por aquí para despacharte. Si ya pagaste, ignora este mensaje. ¡Gracias!',
  final: {
    activo: true,
    texto: 'Hola {nombre}, es nuestro último recordatorio de tu compra de {producto}. Si ya no te interesa, avísanos para liberarla. Si ya pagaste, ignora este mensaje. ¡Gracias!',
  },
}

export function leerConfig(valor: string | null | undefined): ConfigRecordatorios {
  try {
    const v = JSON.parse(valor ?? '') as Partial<ConfigRecordatorios>
    return {
      activo: !!v.activo,
      dias: Math.min(5, Math.max(1, Math.round(Number(v.dias) || CONFIG_DEFECTO.dias))),
      veces: v.veces === 2 ? 2 : 1,
      texto: v.texto?.trim() || CONFIG_DEFECTO.texto,
      final: { activo: v.final?.activo ?? CONFIG_DEFECTO.final.activo, texto: v.final?.texto?.trim() || CONFIG_DEFECTO.final.texto },
    }
  } catch { return CONFIG_DEFECTO }
}

/** Primer nombre con mayúscula ("JOSE LUIS PEREZ" → "Jose"); sin nombre, nada ("Hola ,"→"Hola,"). */
const primerNombre = (n: string | null | undefined) => {
  const p = (n ?? '').trim().split(/\s+/)[0] ?? ''
  return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ''
}

/** El texto con los datos de la venta, dentro del largo que acepta ML (se acorta el producto). */
export function armarTexto(plantilla: string, nombre: string | null, producto: string | null) {
  const n = primerNombre(nombre)
  let prod = (producto ?? 'tu producto').trim()
  const armar = () => plantilla.replaceAll('{nombre}', n).replaceAll('{producto}', prod)
    .replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim()
  let t = armar()
  while (t.length > MAX_TEXTO && prod.length > 20) { prod = prod.slice(0, prod.length - 10).trimEnd() + '…'; t = armar() }
  return t.slice(0, MAX_TEXTO)
}

/** Ventas a recordar HOY (sin mirar el turno): dentro de los días, sin ninguna señal de pago.
 *  $1 = días configurados. Una fila por venta (pack). */
export const SQL_CANDIDATOS = `
  WITH o AS (
    SELECT DISTINCT ON (COALESCE(o.pack_id, o.id)) COALESCE(o.pack_id, o.id) AS pack, o.id, o.conexion_id, o.fecha,
           o.comprador, o.comprador_nombre, COALESCE(o.detalle->0->>'titulo', o.productos) AS producto, o.productos,
           CURRENT_DATE - o.fecha::date AS dia, x.nickname AS cuenta
    FROM ml_ordenes o JOIN ml_conexiones x ON x.id = o.conexion_id AND x.estado = 'activa'
    WHERE o.fecha::date BETWEEN CURRENT_DATE - ($1::int + 1) AND CURRENT_DATE - 2
    ORDER BY COALESCE(o.pack_id, o.id), o.fecha
  )
  SELECT o.pack::text, o.id::text, o.conexion_id, o.fecha, o.comprador, o.comprador_nombre, o.producto, o.productos, o.dia, o.cuenta,
         COALESCE(r.enviados, 0) AS enviados, r.ultimo_at, r.ultimo_turno, r.error
  FROM o
  LEFT JOIN ml_recordatorios r ON r.pack_id = o.pack
  WHERE r.detenido IS NULL
    -- Toda orden de la venta: ni cancelada ni calificada.
    AND NOT EXISTS (SELECT 1 FROM ml_ordenes o2 WHERE COALESCE(o2.pack_id, o2.id) = o.pack
                      AND (o2.estado = 'cancelled' OR o2.cal_vendedor IS NOT NULL))
    AND NOT EXISTS (SELECT 1 FROM me_pagos p WHERE p.venta IN (o.id::text, o.pack::text) AND p.verificacion <> 'invalido')
    AND NOT EXISTS (SELECT 1 FROM sales v WHERE v.ml_order_number IN (o.id::text, o.pack::text))
    AND NOT EXISTS (SELECT 1 FROM despacho_etiquetas e WHERE e.venta IN (o.id::text, o.pack::text))
    AND NOT EXISTS (SELECT 1 FROM ml_mensajes m WHERE m.pack_id = o.pack AND NOT m.propio AND m.fecha > o.fecha)`

export interface Candidato {
  pack: string; id: string; conexion_id: number; fecha: string; comprador: string | null; comprador_nombre: string | null
  producto: string | null; productos: string | null; dia: number; cuenta: string; enviados: number
  ultimo_at: string | null; ultimo_turno: string | null; error: string | null
}

export async function leerConfigDb(db: Pool) {
  const { rows: [c] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_CONFIG])
  return leerConfig(c?.value)
}

export async function candidatos(db: Pool, cfg: ConfigRecordatorios) {
  const { rows } = await db.query<Candidato>(`${SQL_CANDIDATOS} ORDER BY o.fecha`, [cfg.dias])
  return rows
}

/** ¿Es el último recordatorio de esta venta? (último día y último turno del día). */
const esUltimo = (cfg: ConfigRecordatorios, dia: number, turno: number) => dia >= cfg.dias + 1 && turno >= cfg.veces - 1

interface EstadoTurno {
  clave: string; estado: 'esperando_me' | 'enviando' | 'listo' | 'omitido'
  pedido?: number; at?: string; enviados?: number; errores?: number; saltados?: number; motivo?: string
}

async function guardarTurno(db: Pool, t: EstadoTurno, soloSi?: EstadoTurno['estado']) {
  const { rowCount } = await db.query(
    `UPDATE app_settings SET value = $2, updated_at = NOW()
     WHERE key = $1 AND ($3::text IS NULL OR (value::json->>'estado') = $3) AND (value::json->>'clave') = $4`,
    [CLAVE_TURNO, JSON.stringify(t), soloSi ?? null, t.clave])
  return !!rowCount
}

/** Lo llama el cron cada minuto (empresas con `pagos_me`). Un turno: pedir "Traer ME" → esperar
 *  a que todos los perfiles respondan bien → mandar. Si algo falla, el turno se omite. */
export async function recordarPagos(db: Pool) {
  const cfg = await leerConfigDb(db)
  if (!cfg.activo) return null
  const { rows: [h] } = await db.query(`SELECT EXTRACT(HOUR FROM LOCALTIME)::int AS h, CURRENT_DATE::text AS hoy`)
  const turno = HORAS.slice(0, cfg.veces).findIndex(x => h.h >= x && h.h < x + VENTANA_H)
  if (turno < 0) return null
  const clave = `${h.hoy}#${turno}`

  // 1) Tomar el turno (una sola pasada del cron lo logra) y pedir "Traer ME".
  const { rowCount } = await db.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
     WHERE (app_settings.value::json->>'clave') IS DISTINCT FROM $3`,
    [CLAVE_TURNO, JSON.stringify({ clave, estado: 'esperando_me' }), clave])
  if (rowCount) {
    // Sin candidatos no hace falta molestar a la PC: el turno queda listo.
    if (!(await candidatos(db, cfg)).length) {
      await guardarTurno(db, { clave, estado: 'listo', at: new Date().toISOString(), enviados: 0, errores: 0, saltados: 0 })
      return { turno: clave, sinCandidatos: true }
    }
    const { rows: [p] } = await db.query(`INSERT INTO me_pedidos (pedido_por) VALUES (NULL) RETURNING id`)
    await guardarTurno(db, { clave, estado: 'esperando_me', pedido: Number(p.id), at: new Date().toISOString() })
    return { turno: clave, pidioME: Number(p.id) }
  }

  // 2) Esperando a Pagos ME.
  const { rows: [t] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_TURNO])
  const estado = JSON.parse(t?.value ?? '{}') as EstadoTurno
  if (estado.clave !== clave || estado.estado !== 'esperando_me' || !estado.pedido) return null
  const { rows: [ped] } = await db.query(
    `SELECT resultados, pedido_at < NOW() - make_interval(mins => $2) AS vencido FROM me_pedidos WHERE id = $1`,
    [estado.pedido, ESPERA_ME_MIN])
  // Perfiles del vigilante vistos en el último día (el DESPERTADOR no trae pagos).
  const { rows: perf } = await db.query(
    `SELECT perfil FROM me_latidos WHERE perfil <> 'DESPERTADOR' AND visto_at > NOW() - INTERVAL '1 day'`)
  const res = (ped?.resultados ?? {}) as Record<string, { ok: boolean; error?: string | null }>
  const perfiles = perf.map(p => p.perfil as string)
  const completo = perfiles.length > 0 && perfiles.every(p => res[p])
  if (!completo) {
    if (!ped || ped.vencido) {
      const faltan = perfiles.filter(p => !res[p])
      await guardarTurno(db, { ...estado, estado: 'omitido', motivo: perfiles.length
        ? `Pagos ME no respondió (${faltan.join(', ')}): revisa la PC` : 'Pagos ME sin conectar: revisa la PC' }, 'esperando_me')
    }
    return null
  }
  const conError = perfiles.filter(p => !res[p].ok)
  if (conError.length) {
    await guardarTurno(db, { ...estado, estado: 'omitido', motivo: `Pagos ME con error en ${conError.join(', ')}: no se mandó nada` }, 'esperando_me')
    return null
  }

  // 3) Mandar (ya con los pagos al día). "enviando" lo toma una sola pasada.
  if (!(await guardarTurno(db, { ...estado, estado: 'enviando' }, 'esperando_me'))) return null
  const lista = (await candidatos(db, cfg)).filter(c => c.ultimo_turno !== clave).slice(0, MAX_POR_TURNO)
  let enviados = 0, errores = 0, saltados = 0
  for (const c of lista) {
    const r = await recordarUna(db, c, cfg, clave, esUltimo(cfg, c.dia, turno))
    if (r === 'enviado') enviados++
    else if (r === 'error') errores++
    else saltados++
  }
  await guardarTurno(db, { clave, estado: 'listo', pedido: estado.pedido, at: new Date().toISOString(), enviados, errores, saltados })
  return { turno: clave, enviados, errores, saltados }
}

async function anotar(db: Pool, c: Candidato, campos: { enviado?: boolean; error?: string | null; detenido?: string; turno: string }) {
  await db.query(
    `INSERT INTO ml_recordatorios (pack_id, orden_id, enviados, ultimo_at, ultimo_turno, error, detenido, detenido_at)
     VALUES ($1::bigint, $2::bigint, $3::int, CASE WHEN $3::int > 0 THEN NOW() END, $4, $5, $6, CASE WHEN $6::text IS NOT NULL THEN NOW() END)
     ON CONFLICT (empresa_id, pack_id) DO UPDATE SET
       enviados = ml_recordatorios.enviados + EXCLUDED.enviados,
       ultimo_at = COALESCE(EXCLUDED.ultimo_at, ml_recordatorios.ultimo_at),
       ultimo_turno = EXCLUDED.ultimo_turno, error = EXCLUDED.error,
       detenido = COALESCE(EXCLUDED.detenido, ml_recordatorios.detenido),
       detenido_at = COALESCE(EXCLUDED.detenido_at, ml_recordatorios.detenido_at)`,
    [c.pack, c.id, campos.enviado ? 1 : 0, campos.turno, campos.error ?? null, campos.detenido ?? null])
}

/** Relee la venta y la conversación en ML y, si sigue sin señales, manda el recordatorio. */
async function recordarUna(db: Pool, c: Candidato, cfg: ConfigRecordatorios, turno: string, ultimo: boolean)
  : Promise<'enviado' | 'saltado' | 'error'> {
  // Staging tiene copias de los tokens de producción: NUNCA manda mensajes reales desde ahí.
  if (process.env.APP_ENV === 'staging') { await anotar(db, c, { turno, error: 'staging: no se manda' }); return 'saltado' }
  try {
    const orden = await mlFetch<{ status?: string; buyer?: { id: number; first_name?: string } }>(db, c.conexion_id, `/orders/${c.id}`)
    if (orden.status === 'cancelled') { await anotar(db, c, { turno, detenido: 'cancelada' }); return 'saltado' }
    if (!orden.buyer?.id) { await anotar(db, c, { turno, error: 'ML no dijo quién es el comprador' }); return 'error' }
    const { rows: [cx] } = await db.query(`SELECT ml_user_id FROM ml_conexiones WHERE id = $1`, [c.conexion_id])
    const seller = Number(cx.ml_user_id)
    // ¿Escribió después de comprar? (leerHilo también lo guarda: la próxima vez ya no es candidato).
    const hilo = await leerHilo(db, c.conexion_id, c.pack, seller, false)
    if (hilo.mensajes.some(m => !m.propio && new Date(m.fecha) > new Date(c.fecha))) {
      await anotar(db, c, { turno }); return 'saltado'
    }
    const texto = armarTexto(ultimo && cfg.final.activo ? cfg.final.texto : cfg.texto,
      orden.buyer.first_name || c.comprador_nombre, c.producto)
    await mlFetch(db, c.conexion_id, `/messages/packs/${c.pack}/sellers/${seller}?tag=post_sale`, {
      method: 'POST', body: { from: { user_id: seller }, to: { user_id: orden.buyer.id }, text: texto },
    })
    // Queda en la bandeja (Recientes) con lo que se le mandó.
    await db.query(
      `INSERT INTO ml_conversaciones (pack_id, conexion_id, productos, comprador_nick, comprador_nombre, ultimo_texto, ultimo_de_comprador, ultimo_at)
       VALUES ($1::bigint, $2, $3, $4, $5, $6, FALSE, NOW())
       ON CONFLICT (empresa_id, pack_id) DO UPDATE SET ultimo_texto = EXCLUDED.ultimo_texto, ultimo_de_comprador = FALSE,
         ultimo_at = NOW(), actualizada_at = NOW()`,
      [c.pack, c.conexion_id, c.productos, c.comprador, c.comprador_nombre, texto])
    await anotar(db, c, { turno, enviado: true })
    // Registro de quién lo mandó (en la conversación sale "automático").
    await registrarOrigen(db, { modulo: 'mensajes', ref: String(c.pack), fuente: 'automatica', base: texto, texto })
    return 'enviado'
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300)
    // ML rechazó ESTE mensaje (4xx que no es sesión ni límite): no se insiste con esta venta.
    const rechazo = e instanceof ErrorML && e.status >= 400 && e.status < 500 && ![401, 429].includes(e.status)
    await anotar(db, c, { turno, error: msg, detenido: rechazo ? 'ml' : undefined })
    console.error('[recordatorio pago]', c.pack, msg)
    return 'error'
  }
}

/** "Ya pagó, no recordar" (o deshacerlo). */
export async function detenerRecordatorio(db: Pool, pack: string, userId: number | null, detener: boolean) {
  if (detener) {
    const { rows: [o] } = await db.query(
      `SELECT id::text FROM ml_ordenes WHERE COALESCE(pack_id, id) = $1::bigint ORDER BY fecha LIMIT 1`, [pack])
    await db.query(
      `INSERT INTO ml_recordatorios (pack_id, orden_id, detenido, detenido_por, detenido_at) VALUES ($1::bigint, $2::bigint, 'manual', $3, NOW())
       ON CONFLICT (empresa_id, pack_id) DO UPDATE SET detenido = 'manual', detenido_por = $3, detenido_at = NOW()`,
      [pack, o?.id ?? pack, userId])
  } else {
    await db.query(`UPDATE ml_recordatorios SET detenido = NULL, detenido_por = NULL, detenido_at = NULL WHERE pack_id = $1::bigint`, [pack])
  }
}

export async function ultimoTurno(db: Pool): Promise<EstadoTurno | null> {
  const { rows: [t] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_TURNO])
  try { return t ? JSON.parse(t.value) : null } catch { return null }
}
