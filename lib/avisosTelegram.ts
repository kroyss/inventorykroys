// AVISOS POR TELEGRAM (2026-10-14, decisión del dueño): lo que la app de MercadoLibre NO avisa, al
// Telegram de cada persona que lo conectó en "Mis avisos" y según lo que eligió en cada empresa:
//   - cuenta de ML desconectada (sin ella no entra nada de esa cuenta);
//   - pregunta sin responder pasados N minutos; mensaje de comprador sin responder pasados N minutos;
//   - calificación negativa recibida (neutral, opcional) y contradictoria (él dijo concretada, nosotros no);
//   - resumen diario a la hora elegida (ayer + lo que hizo el sistema + lo pendiente).
// Reglas: solo lo de SU empresa y SUS permisos; horario de silencio (lo que siga pendiente llega al
// terminar); cada cosa se avisa UNA vez (avisos_enviados); varias juntas van en un solo mensaje.
// Primero solo la organización de la plataforma; a los demás cuando se prenda en Plataforma.
// Lo llama el cron de preguntas (cada minuto). Tablas: migración 089.
import type { Pool } from 'pg'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { puede, type Permiso } from '@/lib/permisos'
import { SQL_MENSAJE_VIGENTE } from '@/lib/mensajesML'
import { leerPlantillasCal, sqlBandeja } from '@/lib/calificacionesML'
import { contarAlertas } from '@/lib/alertasStock'
import { ventasDesdeML } from '@/lib/modulos'
import { SQL_CUENTA_SINCRONIZA } from '@/lib/cuenta'
import {
  ENTORNO, TelegramBloqueado, corto, enviarTelegram, esc, leerActualizaciones, telegramConfigurado, urlSistema,
  type Boton,
} from '@/lib/telegram'
import type { Country, UserRole } from '@/lib/types'

// ── Preferencias ───────────────────────────────────────────────────────────

export interface PrefsAvisos {
  desconectada: boolean
  pregunta: boolean; pregunta_min: number
  mensaje: boolean; mensaje_min: number
  negativa: boolean; neutral: boolean
  contradictoria: boolean
  resumen: boolean; resumen_hora: number
  silencio: boolean; silencio_desde: number; silencio_hasta: number
}

export const PREFS_INICIALES: PrefsAvisos = {
  desconectada: true,
  pregunta: true, pregunta_min: 30,
  mensaje: true, mensaje_min: 60,
  negativa: true, neutral: false,
  contradictoria: true,
  resumen: true, resumen_hora: 8,
  silencio: true, silencio_desde: 22, silencio_hasta: 7,
}
export const MINUTOS_OPCIONES = [0, 15, 30, 60, 120, 240] as const   // 0 = al instante

export function leerPrefs(v: unknown): PrefsAvisos {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<PrefsAvisos>
  const p = { ...PREFS_INICIALES }
  for (const k of Object.keys(p) as (keyof PrefsAvisos)[]) {
    if (typeof o[k] === typeof p[k]) (p as Record<string, unknown>)[k] = o[k]
  }
  return p
}

/** Qué avisos le aplican a esta persona en esta empresa (módulos + permisos). */
export function avisosDisponibles(u: { role: UserRole; permisos: string[] | null; modulos: string[] }) {
  const user = { role: u.role, permisos: u.permisos ?? undefined }
  const conML = u.modulos.includes('preguntas')
  const ve = (p: Permiso) => conML && puede(user, p)
  return {
    desconectada: conML || u.modulos.includes('despachos'),
    pregunta: ve('ver_preguntas'),
    mensaje: ve('ver_mensajes'),
    negativa: ve('ver_calificaciones'),
    resumen: true,
  }
}

/** ¿Esta organización ya tiene los avisos? (primero solo la de la plataforma; Plataforma los abre). */
export async function avisosHabilitados(organizacionId: number | undefined) {
  if (!telegramConfigurado()) return false
  if (organizacionId === ORGANIZACION_PLATAFORMA) return true
  const { rows: [r] } = await dbGlobal().query(`SELECT value FROM plataforma_ajustes WHERE key = 'avisos_telegram_abierto'`)
  return r?.value === 'true'
}

const enSilencio = (p: PrefsAvisos, hora: number) =>
  p.silencio && (p.silencio_desde > p.silencio_hasta
    ? hora >= p.silencio_desde || hora < p.silencio_hasta     // cruza medianoche (22 → 7)
    : hora >= p.silencio_desde && hora < p.silencio_hasta)

// ── Conexión (/start CODIGO) ──────────────────────────────────────────────

/** Lee lo que le escribieron al bot y conecta a quien tocó "Iniciar" con su código.
 *  La cola de Telegram es una sola para staging y producción: cada uno recuerda hasta dónde leyó y
 *  solo se confirma (borra de la cola) lo que tiene más de 10 minutos, para que el otro alcance a verlo. */
export async function procesarActualizaciones() {
  if (!telegramConfigurado()) return 0
  const clave = `telegram_ultimo_update_${ENTORNO}`
  const { rows: [u] } = await dbGlobal().query(`SELECT value FROM plataforma_ajustes WHERE key = $1`, [clave])
  const ultimo = Number(u?.value ?? 0)
  const lista = await leerActualizaciones()
  let conectados = 0, mayor = ultimo
  for (const up of lista) {
    if (up.update_id <= ultimo) continue
    mayor = Math.max(mayor, up.update_id)
    const m = up.message
    if (!m?.text || m.chat.type !== 'private') continue
    const codigo = /^\/start\s+([A-Za-z0-9_-]{8,64})$/.exec(m.text.trim())?.[1]
    if (codigo) {
      const nombreTG = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || null
      const { rows: [t] } = await dbGlobal().query(
        `UPDATE telegram_usuarios SET chat_id = $2, tg_usuario = $3, tg_nombre = $4, entorno = $5, vinculado_at = NOW(),
                codigo = NULL, codigo_expira = NULL, error = NULL, actualizado_at = NOW()
         WHERE codigo = $1 AND codigo_expira > NOW()
         RETURNING user_id`, [codigo, m.chat.id, m.from?.username ?? null, nombreTG, ENTORNO])
      if (t) {
        conectados++
        const { rows: [p] } = await dbGlobal().query(`SELECT COALESCE(full_name, username) AS n FROM users WHERE id = $1`, [t.user_id])
        await enviarTelegram(m.chat.id,
          `✅ <b>¡Listo, ${esc(p?.n ?? '')}!</b>\n\nTu Telegram quedó conectado a <b>El Comerciante Digital</b>`
          + `${ENTORNO === 'staging' ? ' (copia de pruebas)' : ''}.\n\nAquí te llegarán los avisos que elegiste en <i>Mis avisos</i>. `
          + `Puedes cambiarlos o desconectarte cuando quieras desde el sistema.`,
          [[{ texto: 'Abrir Mis avisos', url: urlSistema('/mis-avisos') }]]).catch(() => {})
        continue
      }
    }
    // Cualquier otra cosa (o un código de otro entorno / vencido): responde solo producción, una vez.
    if (ENTORNO === 'produccion' && !codigo) {
      await enviarTelegram(m.chat.id,
        '👋 Hola. Este bot envía los <b>avisos de El Comerciante Digital</b> (preguntas sin responder, '
        + 'cuenta de MercadoLibre desconectada, calificaciones negativas y un resumen diario).\n\n'
        + 'Para conectarlo entra al sistema → menú de tu cuenta (arriba a la derecha) → <b>Mis avisos</b> → <i>Conectar Telegram</i>.',
        [[{ texto: 'Ir a Mis avisos', url: urlSistema('/mis-avisos') }]]).catch(() => {})
    }
  }
  if (mayor > ultimo) {
    await dbGlobal().query(
      `INSERT INTO plataforma_ajustes (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [clave, String(mayor)])
  }
  // Confirmar lo viejo (>10 min): ambos entornos ya lo vieron; así la cola no se llena.
  const viejas = lista.filter(x => (x.message?.date ?? 0) * 1000 < Date.now() - 10 * 60_000)
  if (viejas.length) await leerActualizaciones(Math.max(...viejas.map(x => x.update_id)) + 1).catch(() => {})
  return conectados
}

// ── Envío ──────────────────────────────────────────────────────────────────

interface Destinatario {
  user_id: number; chat_id: string; nombre: string; role: UserRole; permisos: string[] | null
  avisos: unknown; vinculado_at: string
}
interface EmpresaAvisos { id: number; nombre: string; country: Country; modulos: string[] }

/** Marca el aviso como mandado ANTES de mandarlo (dos pasadas a la vez no lo repiten); si Telegram
 *  falla se desmarca para reintentar en la próxima. Devuelve las referencias nuevas. */
async function reservar(userId: number, empresaId: number, tipo: string, refs: string[]) {
  if (!refs.length) return []
  const { rows } = await dbGlobal().query(
    `INSERT INTO avisos_enviados (user_id, empresa_id, tipo, ref) SELECT $1, $2, $3, unnest($4::text[])
     ON CONFLICT DO NOTHING RETURNING ref`, [userId, empresaId, tipo, refs])
  return rows.map(r => r.ref as string)
}
const liberar = (userId: number, empresaId: number, tipo: string, refs: string[]) =>
  dbGlobal().query(`DELETE FROM avisos_enviados WHERE user_id = $1 AND empresa_id = $2 AND tipo = $3 AND ref = ANY($4::text[])`,
    [userId, empresaId, tipo, refs])

/** Manda y, si la persona bloqueó el bot, la desconecta. */
async function mandar(d: Destinatario, e: EmpresaAvisos, tipo: string, refs: string[], html: string, botones: Boton[][]) {
  const nuevas = await reservar(d.user_id, e.id, tipo, refs)
  if (!nuevas.length) return false
  try {
    await enviarTelegram(d.chat_id, html, botones)
    return true
  } catch (err) {
    if (err instanceof TelegramBloqueado) {
      await dbGlobal().query(`UPDATE telegram_usuarios SET chat_id = NULL, error = $2, actualizado_at = NOW() WHERE user_id = $1`,
        [d.user_id, 'Bloqueaste el bot o borraste el chat: vuelve a conectarlo'])
    } else {
      await liberar(d.user_id, e.id, tipo, nuevas)
    }
    console.error('[avisos telegram]', d.user_id, tipo, err instanceof Error ? err.message : err)
    return false
  }
}

const cabecera = (e: EmpresaAvisos, multi: boolean) => multi ? `<i>${esc(e.nombre)}</i>\n` : ''
const hace = (fecha: string) => {
  const min = Math.max(1, Math.round((Date.now() - new Date(fecha).getTime()) / 60_000))
  return min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}`.trim() : `hace ${Math.floor(min / 1440)} d`
}

/** Los avisos de UNA persona en UNA empresa (conexión de esa empresa: RLS y hora del país). */
async function avisosDe(db: Pool, e: EmpresaAvisos, d: Destinatario, multi: boolean, hora: number) {
  const p = leerPrefs(d.avisos)
  const disp = avisosDisponibles({ role: d.role, permisos: d.permisos, modulos: e.modulos })
  const silencio = enSilencio(p, hora)
  const cab = cabecera(e, multi)
  let enviados = 0

  // Cuenta desconectada (una vez por desconexión).
  if (p.desconectada && disp.desconectada && !silencio) {
    const { rows } = await db.query(
      // La que alguien desconectó a propósito desde el sistema no se avisa (app/api/ml/conexiones/[id]).
      `SELECT id, nickname, extract(epoch FROM updated_at)::bigint AS t FROM ml_conexiones
       WHERE estado = 'desconectada' AND COALESCE(ultimo_error, '') <> 'Desconectada desde el sistema'
         AND updated_at > NOW() - INTERVAL '7 days'`)
    for (const c of rows) {
      const reconecta = puede({ role: d.role, permisos: d.permisos ?? undefined }, 'ml_cuentas')
      if (await mandar(d, e, 'desconectada', [`${c.id}:${c.t}`],
        `${cab}⚠️ <b>${esc(c.nickname)} se desconectó de MercadoLibre</b>\n\n`
        + 'Mientras no la reconectes no entran preguntas, mensajes ni ventas de esa cuenta, y no corre ninguna automatización.'
        + (reconecta ? '' : '\n\nAvísale a quien administra las cuentas para que la reconecte.'),
        reconecta ? [[{ texto: '🔌 Reconectar ahora', url: urlSistema('/cuentas-ml') }]] : [])) enviados++
    }
  }

  // Preguntas sin responder pasados N minutos (de las últimas 24 h; varias juntas en un mensaje).
  if (p.pregunta && disp.pregunta && !silencio) {
    const { rows } = await db.query(
      `SELECT p.id::text, x.nickname AS cuenta, p.item_titulo, p.texto, p.fecha
       FROM ml_preguntas p JOIN ml_conexiones x ON x.id = p.conexion_id
       WHERE p.estado = 'UNANSWERED' AND p.fecha < NOW() - make_interval(mins => $1) AND p.fecha > NOW() - INTERVAL '24 hours'
       ORDER BY p.fecha LIMIT 30`, [p.pregunta_min])
    const nuevas = await pendientes(d, e, 'pregunta', rows.map(r => r.id))
    const lista = rows.filter(r => nuevas.has(r.id))
    if (lista.length) {
      const html = lista.length === 1
        ? `${cab}❓ <b>${p.pregunta_min ? 'Pregunta sin responder' : 'Pregunta nueva'}</b> · ${esc(lista[0].cuenta)} · ${hace(lista[0].fecha)}\n`
          + `📦 ${esc(corto(lista[0].item_titulo, 80))}\n\n💬 <i>“${esc(corto(lista[0].texto, 400))}”</i>`
        : `${cab}❓ <b>${lista.length} preguntas ${p.pregunta_min ? 'sin responder' : 'nuevas'}</b>${p.pregunta_min ? ` (más de ${p.pregunta_min} min)` : ''}\n\n`
          + lista.slice(0, 6).map(r => `• <b>${esc(r.cuenta)}</b> · ${hace(r.fecha)}\n   <i>“${esc(corto(r.texto, 110))}”</i>`).join('\n')
          + (lista.length > 6 ? `\n… y ${lista.length - 6} más` : '')
      if (await mandar(d, e, 'pregunta', lista.map(r => r.id), html,
        [[{ texto: lista.length === 1 ? 'Responder en el sistema' : 'Ver preguntas', url: urlSistema('/preguntas') }]])) enviados++
    }
  }

  // Mensajes de compradores sin responder pasados N minutos: lo último es del comprador y sigue sin leer (como
  // "Por atender" en Mensajes; un "gracias" que alguien ya leyó no avisa). Un mensaje nuevo vuelve a avisar.
  if (p.mensaje && disp.mensaje && !silencio) {
    const { rows } = await db.query(
      `SELECT c.pack_id::text AS pack, c.pack_id::text || ':' || extract(epoch FROM c.ultimo_at)::bigint AS ref,
              x.nickname AS cuenta, COALESCE(c.comprador_nombre, c.comprador_nick) AS comprador, c.productos, c.ultimo_texto, c.ultimo_at
       FROM ml_conversaciones c JOIN ml_conexiones x ON x.id = c.conexion_id
       WHERE c.ultimo_de_comprador AND c.sin_leer > 0 AND c.ultimo_at < NOW() - make_interval(mins => $1) AND c.ultimo_at > NOW() - INTERVAL '24 hours'
         AND ${SQL_MENSAJE_VIGENTE.replace(/ultimo_at/g, 'c.ultimo_at')}
       ORDER BY c.ultimo_at LIMIT 30`, [p.mensaje_min])
    const nuevas = await pendientes(d, e, 'mensaje', rows.map(r => r.ref))
    const lista = rows.filter(r => nuevas.has(r.ref))
    if (lista.length) {
      const r0 = lista[0]
      const html = lista.length === 1
        ? `${cab}✉️ <b>${p.mensaje_min ? 'Mensaje sin responder' : 'Mensaje nuevo'}</b> · ${esc(r0.cuenta)} · ${hace(r0.ultimo_at)}\n`
          + `👤 ${esc(r0.comprador ?? 'Comprador')}${r0.productos ? ` · 📦 ${esc(corto(r0.productos, 70))}` : ''}\n\n`
          + `💬 <i>“${esc(corto(r0.ultimo_texto || '(adjunto)', 400))}”</i>`
        : `${cab}✉️ <b>${lista.length} mensajes de compradores ${p.mensaje_min ? 'sin responder' : 'nuevos'}</b>${p.mensaje_min ? ` (más de ${p.mensaje_min} min)` : ''}\n\n`
          + lista.slice(0, 6).map(r => `• <b>${esc(r.comprador ?? 'Comprador')}</b> · ${esc(r.cuenta)} · ${hace(r.ultimo_at)}\n   <i>“${esc(corto(r.ultimo_texto || '(adjunto)', 110))}”</i>`).join('\n')
          + (lista.length > 6 ? `\n… y ${lista.length - 6} más` : '')
      if (await mandar(d, e, 'mensaje', lista.map(r => r.ref), html,
        [[lista.length === 1
          ? { texto: 'Abrir conversación', url: urlSistema(`/mensajes?pack=${r0.pack}`) }
          : { texto: 'Ver mensajes', url: urlSistema('/mensajes') }]])) enviados++
    }
  }

  // Calificación negativa (y neutral si la pidió) recibida desde que conectó Telegram.
  if ((p.negativa || p.neutral) && disp.negativa && !silencio) {
    const tipos = [p.negativa && 'negative', p.neutral && 'neutral'].filter(Boolean)
    const { rows } = await db.query(
      `SELECT o.id::text, o.cal_recibida, o.cal_recibida_msg, o.productos, COALESCE(o.comprador_nombre, o.comprador) AS comprador,
              x.nickname AS cuenta
       FROM ml_ordenes o JOIN ml_conexiones x ON x.id = o.conexion_id
       WHERE o.cal_recibida = ANY($1) AND o.cal_recibida_at > GREATEST(NOW() - INTERVAL '3 days', $2::timestamptz)
       ORDER BY o.cal_recibida_at LIMIT 10`, [tipos, d.vinculado_at])
    for (const r of rows) {
      const neg = r.cal_recibida === 'negative'
      if (await mandar(d, e, neg ? 'negativa' : 'neutral', [r.id],
        `${cab}${neg ? '👎 <b>Calificación NEGATIVA recibida</b>' : '😐 <b>Calificación neutral recibida</b>'} · ${esc(r.cuenta)}\n`
        + `👤 ${esc(r.comprador ?? 'Comprador')} · venta ${esc(r.id)}\n`
        + (r.productos ? `📦 ${esc(corto(r.productos, 80))}\n` : '')
        + (r.cal_recibida_msg ? `\n💬 <i>“${esc(corto(r.cal_recibida_msg, 400))}”</i>\n` : '')
        + '\nPuedes responderla en ML para que los próximos compradores vean tu versión.',
        [[{ texto: 'Ver en Reputación', url: urlSistema('/reputacion') }]])) enviados++
    }
  }

  // Contradictoria: el comprador dijo que la venta SÍ se concretó y nosotros que NO (se arregla con
  // "Corregir" en Reputación). Las que el sistema detecta desde que conectó Telegram.
  if (p.contradictoria && disp.negativa && !silencio) {
    const { rows } = await db.query(
      `SELECT o.id::text, o.cal_recibida, o.cal_recibida_msg, o.productos, COALESCE(o.comprador_nombre, o.comprador) AS comprador,
              x.nickname AS cuenta
       FROM ml_ordenes o JOIN ml_conexiones x ON x.id = o.conexion_id
       WHERE o.cal_contradictoria AND o.cal_recibida_concretada AND o.cal_recibida_at > NOW() - INTERVAL '30 days'
         AND o.cal_recibida_revisada_at > $1::timestamptz
       ORDER BY o.cal_recibida_at LIMIT 10`, [d.vinculado_at])
    const nuevas = await pendientes(d, e, 'contradictoria', rows.map(r => r.id))
    for (const r of rows.filter(x => nuevas.has(x.id))) {
      const tipo = r.cal_recibida === 'negative' ? 'negativa' : r.cal_recibida === 'neutral' ? 'neutral' : 'positiva'
      if (await mandar(d, e, 'contradictoria', [r.id],
        `${cab}🟣 <b>Calificación contradictoria</b> · ${esc(r.cuenta)}\n`
        + `👤 ${esc(r.comprador ?? 'Comprador')} · venta ${esc(r.id)}\n`
        + (r.productos ? `📦 ${esc(corto(r.productos, 80))}\n` : '')
        + `\nEl comprador dijo que la venta <b>SÍ se concretó</b> (te calificó ${tipo}) y tú la marcaste como <b>no concretada</b>.`
        + (r.cal_recibida_msg ? `\n💬 <i>“${esc(corto(r.cal_recibida_msg, 300))}”</i>` : '')
        + '\n\nSi de verdad se vendió, corrígela para que la venta cuente bien.',
        [[{ texto: 'Corregir en Reputación', url: urlSistema('/reputacion') }]])) enviados++
    }
  }

  // Resumen diario: una vez por día, en las 3 horas desde la hora elegida (fuera del silencio).
  if (p.resumen && !silencio && hora >= p.resumen_hora && hora < p.resumen_hora + 3) {
    const { rows: [h] } = await db.query(`SELECT CURRENT_DATE::text AS hoy`)
    if (!(await pendientes(d, e, 'resumen', [h.hoy])).size) return enviados
    const html = await resumenDiario(db, e, d, disp, cab, hora)
    if (await mandar(d, e, 'resumen', [h.hoy], html, [[{ texto: 'Abrir el sistema', url: urlSistema('/automatizaciones') }]])) enviados++
  }
  return enviados
}

/** De estas referencias, las que todavía no se le avisaron. */
async function pendientes(d: Destinatario, e: EmpresaAvisos, tipo: string, refs: string[]) {
  if (!refs.length) return new Set<string>()
  const { rows } = await dbGlobal().query(
    `SELECT ref FROM avisos_enviados WHERE user_id = $1 AND empresa_id = $2 AND tipo = $3 AND ref = ANY($4::text[])`,
    [d.user_id, e.id, tipo, refs])
  const ya = new Set(rows.map(r => r.ref as string))
  return new Set(refs.filter(r => !ya.has(r)))
}

const n = (x: number) => x.toLocaleString('es-VE')

/** "Buenos días": ayer en números, lo que hizo el sistema solo y lo que queda pendiente hoy. */
async function resumenDiario(db: Pool, e: EmpresaAvisos, d: Destinatario, disp: ReturnType<typeof avisosDisponibles>, cab: string, hora: number) {
  const lineas: string[] = []
  const { rows: [v] } = await db.query(
    `SELECT COUNT(*) FILTER (WHERE fecha::date = CURRENT_DATE - 1 AND COALESCE(estado, '') <> 'cancelled')::int AS ventas,
            COUNT(*) FILTER (WHERE cal_recibida_at::date = CURRENT_DATE - 1 AND cal_recibida = 'positive')::int AS pos,
            COUNT(*) FILTER (WHERE cal_recibida_at::date = CURRENT_DATE - 1 AND cal_recibida = 'neutral')::int AS neu,
            COUNT(*) FILTER (WHERE cal_recibida_at::date = CURRENT_DATE - 1 AND cal_recibida = 'negative')::int AS neg
     FROM ml_ordenes WHERE fecha > NOW() - INTERVAL '120 days'`)
  const ayer: string[] = []
  if (v.ventas) ayer.push(`🛒 ${n(v.ventas)} venta${v.ventas === 1 ? '' : 's'} en MercadoLibre`)
  if (disp.pregunta) {
    const { rows: [q] } = await db.query(
      `SELECT COUNT(*)::int AS recibidas, COUNT(respuesta_fecha)::int AS respondidas,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM respuesta_fecha - fecha) / 60) AS mediana
       FROM ml_preguntas WHERE fecha::date = CURRENT_DATE - 1`)
    if (q.recibidas) {
      const med = q.mediana == null ? null : Math.round(Number(q.mediana))
      ayer.push(`❓ ${n(q.recibidas)} pregunta${q.recibidas === 1 ? '' : 's'}, ${n(q.respondidas)} respondida${q.respondidas === 1 ? '' : 's'}`
        + (med != null ? ` · la mitad en menos de ${med < 60 ? `${med} min` : `${Math.round(med / 60 * 10) / 10} h`}` : ''))
    }
  }
  if (disp.negativa && (v.pos || v.neu || v.neg)) {
    ayer.push(`⭐ Calificaciones recibidas: ${n(v.pos)} positiva${v.pos === 1 ? '' : 's'}`
      + (v.neu ? ` · ${n(v.neu)} neutral${v.neu === 1 ? '' : 'es'}` : '') + (v.neg ? ` · <b>${n(v.neg)} negativa${v.neg === 1 ? '' : 's'}</b>` : ''))
  }
  if (ayer.length) lineas.push('<b>Ayer</b>', ...ayer)

  // Lo que hizo el sistema solo (ayer).
  const solo: string[] = []
  const { rows: [s] } = await db.query(
    `SELECT (SELECT COUNT(*) FROM respuestas_origen WHERE fuente = 'automatica' AND fecha::date = CURRENT_DATE - 1)::int AS respuestas,
            (SELECT COUNT(*) FROM ml_recordatorios WHERE ultimo_at::date = CURRENT_DATE - 1)::int AS recordatorios,
            (SELECT value FROM app_settings WHERE key = 'calificaciones_auto_ultimo') AS cal`)
  let calificadas = 0
  try { const c = JSON.parse(s.cal ?? 'null'); if (c?.fecha && c.fecha === (await db.query(`SELECT (CURRENT_DATE - 1)::text AS d`)).rows[0].d) calificadas = Number(c.calificadas) || 0 } catch { /* sin dato */ }
  if (calificadas) solo.push(`✅ Calificó ${n(calificadas)} venta${calificadas === 1 ? '' : 's'} concretada${calificadas === 1 ? '' : 's'}`)
  if (s.respuestas) solo.push(`🤖 Respondió ${n(s.respuestas)} pregunta${s.respuestas === 1 ? '' : 's'} sola${s.respuestas === 1 ? '' : 's'}`)
  if (s.recordatorios) solo.push(`🔔 Mandó ${n(s.recordatorios)} recordatorio${s.recordatorios === 1 ? '' : 's'} de pago`)
  if (solo.length) lineas.push('', '<b>Lo que hizo el sistema por ti</b>', ...solo)

  // Pendiente ahora.
  const pend: string[] = []
  const { rows: [c] } = await db.query(
    `SELECT (SELECT COUNT(*) FROM ml_preguntas WHERE estado = 'UNANSWERED')::int AS preguntas,
            (SELECT COUNT(*) FROM ml_conversaciones WHERE sin_leer > 0 AND ${SQL_MENSAJE_VIGENTE})::int AS mensajes,
            (SELECT string_agg(nickname, ', ') FROM ml_conexiones WHERE estado = 'desconectada'
               AND COALESCE(ultimo_error, '') <> 'Desconectada desde el sistema') AS desconectadas`)
  if (c.desconectadas) pend.push(`⚠️ <b>Cuenta desconectada: ${esc(c.desconectadas)}</b>`)
  if (disp.pregunta && c.preguntas) pend.push(`❓ ${n(c.preguntas)} pregunta${c.preguntas === 1 ? '' : 's'} sin responder`)
  if (disp.mensaje && c.mensajes) pend.push(`✉️ ${n(c.mensajes)} conversaci${c.mensajes === 1 ? 'ón' : 'ones'} con mensajes sin leer`)
  if (disp.negativa) {
    const { rows: [pl] } = await db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_plantillas'`)
    const plc = leerPlantillasCal(pl?.value)
    const { rows: [k] } = await db.query(
      `SELECT COUNT(*)::int AS n FROM (${sqlBandeja(ventasDesdeML({ modulos: e.modulos }))}) b
       WHERE sugerencia <> 'esperar' AND b.fecha::date <= CURRENT_DATE - ${plc.esperaDias}`, [plc.noConcretada.dias])
    if (k.n) pend.push(`⭐ ${n(k.n)} venta${k.n === 1 ? '' : 's'} por calificar`)
  }
  if (e.modulos.includes('alertas_stock') && puede({ role: d.role, permisos: d.permisos ?? undefined }, 'ver_stock')) {
    const a = await contarAlertas(db)
    if (a.agotadas) pend.push(`📦 ${n(a.agotadas)} publicaci${a.agotadas === 1 ? 'ón' : 'ones'} o variante${a.agotadas === 1 ? '' : 's'} agotada${a.agotadas === 1 ? '' : 's'}`)
  }
  lineas.push('', '<b>Pendiente hoy</b>', ...(pend.length ? pend : ['Nada pendiente. Todo al día 👌']))

  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  return `${cab}☀️ <b>${saludo}, ${esc(d.nombre.split(/\s+/)[0])}.</b> Tu resumen:\n\n${lineas.join('\n')}`
}

/** Lo llama el cron de preguntas cada minuto: conecta a quien tocó "Iniciar" y manda los avisos. */
export async function enviarAvisosTelegram() {
  if (!telegramConfigurado()) return null
  try { await procesarActualizaciones() } catch (e) { console.error('[avisos telegram] conexiones', e instanceof Error ? e.message : e) }

  const { rows: abierto } = await dbGlobal().query(`SELECT 1 FROM plataforma_ajustes WHERE key = 'avisos_telegram_abierto' AND value = 'true'`)
  const { rows } = await dbGlobal().query(
    `SELECT t.user_id, t.chat_id::text, COALESCE(u.full_name, u.username) AS nombre, ue.role, ue.permisos, ue.avisos,
            t.vinculado_at, e.id AS empresa_id, e.nombre AS empresa, e.country, e.modulos
     FROM telegram_usuarios t
     JOIN users u ON u.id = t.user_id AND u.is_active
     JOIN usuario_empresas ue ON ue.user_id = t.user_id
     JOIN empresas e ON e.id = ue.empresa_id AND e.is_active
     JOIN organizaciones o ON o.id = e.organizacion_id
     WHERE t.chat_id IS NOT NULL AND t.entorno = $1 AND ${SQL_CUENTA_SINCRONIZA}
       AND (e.organizacion_id = $2 OR $3)
     ORDER BY e.id, t.user_id`, [ENTORNO, ORGANIZACION_PLATAFORMA, abierto.length > 0])
  if (!rows.length) return null

  // Personas con más de una empresa: el aviso lleva el nombre de la empresa.
  const empresasPorUsuario = new Map<number, number>()
  for (const r of rows) empresasPorUsuario.set(r.user_id, (empresasPorUsuario.get(r.user_id) ?? 0) + 1)
  const porEmpresa = new Map<number, typeof rows>()
  for (const r of rows) porEmpresa.set(r.empresa_id, [...(porEmpresa.get(r.empresa_id) ?? []), r])

  let enviados = 0
  for (const [, lista] of porEmpresa) {
    const e: EmpresaAvisos = { id: lista[0].empresa_id, nombre: lista[0].empresa, country: lista[0].country, modulos: lista[0].modulos }
    try {
      enviados += await conEmpresa(e.id, e.country, async db => {
        const { rows: [h] } = await db.query(`SELECT EXTRACT(HOUR FROM NOW())::int AS hora`)
        let k = 0
        for (const d of lista) {
          try { k += await avisosDe(db, e, d, (empresasPorUsuario.get(d.user_id) ?? 1) > 1, h.hora) }
          catch (err) { console.error('[avisos telegram]', e.id, d.user_id, err instanceof Error ? err.message : err) }
        }
        return k
      })
    } catch (err) {
      console.error('[avisos telegram]', e.id, err instanceof Error ? err.message : err)
    }
  }
  // Limpieza: lo mandado hace más de 30 días ya no hace falta para no repetir.
  if (new Date().getMinutes() === 0) await dbGlobal().query(`DELETE FROM avisos_enviados WHERE enviado_at < NOW() - INTERVAL '30 days'`).catch(() => {})
  return enviados ? { enviados } : null
}

/** "Mandar mi resumen ahora" (Mis avisos): el resumen de hoy de la empresa actual, sin esperar la hora
 *  (no cuenta como el del día: el automático igual llega). */
export async function resumenAhora(userId: number, empresaId: number) {
  const { rows: [r] } = await dbGlobal().query(
    `SELECT t.user_id, t.chat_id::text, COALESCE(u.full_name, u.username) AS nombre, ue.role, ue.permisos, ue.avisos,
            t.vinculado_at, e.id AS empresa_id, e.nombre AS empresa, e.country, e.modulos
     FROM telegram_usuarios t JOIN users u ON u.id = t.user_id
     JOIN usuario_empresas ue ON ue.user_id = t.user_id AND ue.empresa_id = $2
     JOIN empresas e ON e.id = ue.empresa_id
     WHERE t.user_id = $1 AND t.chat_id IS NOT NULL AND t.entorno = $3`, [userId, empresaId, ENTORNO])
  if (!r) return false
  const e: EmpresaAvisos = { id: r.empresa_id, nombre: r.empresa, country: r.country, modulos: r.modulos }
  await conEmpresa(e.id, e.country, async db => {
    const { rows: [h] } = await db.query(`SELECT EXTRACT(HOUR FROM NOW())::int AS hora`)
    const html = await resumenDiario(db, e, r, avisosDisponibles({ role: r.role, permisos: r.permisos, modulos: e.modulos }), '', h.hora)
    await enviarTelegram(r.chat_id, html, [[{ texto: 'Abrir el sistema', url: urlSistema('/automatizaciones') }]])
  })
  return true
}

/** Aviso de prueba desde "Mis avisos" (así se ve uno de verdad). */
export async function avisoDePrueba(chatId: string, nombre: string) {
  await enviarTelegram(chatId,
    `🔔 <b>Aviso de prueba</b>\n\nHola ${esc(nombre.split(/\s+/)[0])}, si estás leyendo esto, tus avisos de <b>El Comerciante Digital</b> llegan bien.\n\n`
    + 'Así se ve una pregunta sin responder:\n\n❓ <b>Pregunta sin responder</b> · TU_CUENTA · hace 35 min\n📦 Cable USB C 120w Carga Rápida 1m\n\n'
    + '💬 <i>“Buenas, ¿tendrás 2 disponibles?”</i>',
    [[{ texto: 'Abrir Mis avisos', url: urlSistema('/mis-avisos') }]])
}
