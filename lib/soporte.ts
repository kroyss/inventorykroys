// Soporte (30-10-2026, migración 134): el cliente escribe desde la burbuja (texto + hasta 3 capturas + contexto
// automático) y TODO cae en una sola bandeja (Plataforma → Soporte) con su ORIGEN, y al Telegram del dueño.
// El dueño responde desde Plataforma o con "Responder" en Telegram (procesarActualizaciones lo trae acá);
// el cliente lo ve en la burbuja y, si conectó su Telegram, también le llega ahí.
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { dbGlobal } from '@/lib/db'
import { UPLOAD_DIR } from '@/lib/uploads'
import { chatsDuenoPlataforma } from '@/lib/registro'
import { corto, enviarFotoTelegram, enviarTelegram, enviarTelegramId, ENTORNO, esc, telegramConfigurado, urlSistema } from '@/lib/telegram'

export const SOPORTE_DIR = path.join(UPLOAD_DIR, 'soporte')
export const MAX_ADJUNTOS = 3
export const MAX_MB = 5
export const TIPOS_ADJUNTO: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' }
export const HORARIO_SOPORTE = 'Te respondemos de lunes a sábado, de 8am a 6pm (hora de Venezuela).'

export const ORIGENES: Record<string, string> = { sistema: '🧩 Sistema', radar: '📡 Radar' }
const nombreOrigen = (o: string) => ORIGENES[o] ?? o

export interface Adjunto { nombre: string; tipo: string; datos: Buffer }

/** Guarda los archivos de un mensaje y devuelve sus nombres en disco. */
async function guardarAdjuntos(casoId: number, mensajeId: number, adjuntos: Adjunto[]) {
  if (!adjuntos.length) return []
  const dir = path.join(SOPORTE_DIR, String(casoId))
  await mkdir(dir, { recursive: true })
  const nombres: string[] = []
  for (const [i, a] of adjuntos.entries()) {
    const archivo = `${mensajeId}-${i + 1}.${TIPOS_ADJUNTO[a.tipo] ?? 'bin'}`
    await writeFile(path.join(dir, archivo), a.datos)
    nombres.push(archivo)
  }
  await dbGlobal().query(`UPDATE soporte_mensajes SET adjuntos = $2 WHERE id = $1`, [mensajeId, nombres])
  return nombres
}

/** Ruta en disco de un adjunto (el nombre se valida: nada de "../"). */
export function rutaAdjunto(casoId: number, archivo: string) {
  if (!/^\d+-\d\.(png|jpg|webp|pdf)$/.test(archivo)) return null
  return path.join(SOPORTE_DIR, String(casoId), archivo)
}

interface Contexto { origen: string; empresaId: number | null; userId: number; pantalla: string; navegador: string }

/** Caso nuevo (o un mensaje más en un caso abierto del mismo usuario si se pasa casoId). Avisa al dueño. */
export async function escribirASoporte(ctx: Contexto, texto: string, adjuntos: Adjunto[], casoId?: number) {
  const db = dbGlobal()
  let id = casoId
  if (id) {
    const { rowCount } = await db.query(
      `UPDATE soporte_casos SET estado = 'abierto', updated_at = NOW(), cliente_visto_at = NOW() WHERE id = $1 AND user_id = $2`, [id, ctx.userId])
    if (!rowCount) throw new Error('Caso no encontrado')
  } else {
    const { rows: [c] } = await db.query(
      `INSERT INTO soporte_casos (origen, empresa_id, user_id, pantalla, navegador, cliente_visto_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
      [ctx.origen, ctx.empresaId, ctx.userId, ctx.pantalla.slice(0, 200), ctx.navegador.slice(0, 300)])
    id = Number(c.id)
  }
  const { rows: [m] } = await db.query(
    `INSERT INTO soporte_mensajes (caso_id, autor, autor_user_id, texto) VALUES ($1, 'cliente', $2, $3) RETURNING id`, [id, ctx.userId, texto])
  await guardarAdjuntos(id, Number(m.id), adjuntos)
  avisarDueno(id, !!casoId, texto, adjuntos).catch(e => console.error('[soporte telegram]', e instanceof Error ? e.message : e))
  return id
}

async function avisarDueno(casoId: number, sigue: boolean, texto: string, adjuntos: Adjunto[]) {
  if (!telegramConfigurado()) return
  const { rows: [c] } = await dbGlobal().query(
    `SELECT c.origen, c.pantalla, c.navegador, COALESCE(u.full_name, u.username) AS persona, u.username, ue.role,
            e.nombre AS empresa, o.nombre AS organizacion
     FROM soporte_casos c
     LEFT JOIN users u ON u.id = c.user_id
     LEFT JOIN empresas e ON e.id = c.empresa_id
     LEFT JOIN organizaciones o ON o.id = e.organizacion_id
     LEFT JOIN usuario_empresas ue ON ue.user_id = c.user_id AND ue.empresa_id = c.empresa_id
     WHERE c.id = $1`, [casoId])
  if (!c) return
  const html = `🆘 <b>Soporte #${casoId}</b> · ${esc(nombreOrigen(c.origen))}${sigue ? ' · <i>sigue escribiendo</i>' : ''}`
    + `${ENTORNO === 'staging' ? ' · <i>staging</i>' : ''}\n`
    + `🏢 ${esc(c.empresa ?? c.organizacion ?? '—')} · 👤 ${esc(c.persona ?? '—')} (${esc(c.username ?? '')}${c.role ? `, ${c.role}` : ''})\n`
    + `📍 ${esc(c.pantalla ?? '—')}\n\n💬 ${esc(corto(texto, 1500))}`
    + `${adjuntos.length ? `\n\n📎 ${adjuntos.length} adjunto${adjuntos.length === 1 ? '' : 's'}` : ''}`
    + `\n\n<i>Toca «Responder» en este mensaje para contestarle.</i>`
  for (const chat of await chatsDuenoPlataforma()) {
    try {
      const mid = await enviarTelegramId(chat, html, [[{ texto: 'Abrir en Plataforma', url: urlSistema(`/plataforma?soporte=${casoId}`) }]])
      await anotarMensajeTG(chat, mid, casoId)
      for (const a of adjuntos) {
        const fid = await enviarFotoTelegram(chat, a.datos, a.nombre || 'captura', a.tipo, mid)
        await anotarMensajeTG(chat, fid, casoId)
      }
    } catch (e) { console.error('[soporte telegram]', e instanceof Error ? e.message : e) }
  }
}

const anotarMensajeTG = (chat: string | number, mid: number, casoId: number) =>
  dbGlobal().query(`INSERT INTO soporte_telegram (chat_id, message_id, caso_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [chat, mid, casoId])

/** Respuesta del dueño (desde Plataforma o Telegram). Le avisa al cliente por Telegram si lo tiene conectado. */
export async function responderCaso(casoId: number, texto: string, autorUserId: number | null, adjuntos: Adjunto[] = []) {
  const db = dbGlobal()
  const { rows: [c] } = await db.query(
    `UPDATE soporte_casos SET estado = 'respondido', updated_at = NOW() WHERE id = $1 RETURNING user_id, origen`, [casoId])
  if (!c) throw new Error('Caso no encontrado')
  const { rows: [m] } = await db.query(
    `INSERT INTO soporte_mensajes (caso_id, autor, autor_user_id, texto) VALUES ($1, 'soporte', $2, $3) RETURNING id`, [casoId, autorUserId, texto])
  await guardarAdjuntos(casoId, Number(m.id), adjuntos)
  if (telegramConfigurado() && c.user_id) {
    const { rows: [t] } = await db.query(
      `SELECT chat_id::text AS chat_id FROM telegram_usuarios WHERE user_id = $1 AND chat_id IS NOT NULL AND entorno = $2`, [c.user_id, ENTORNO])
    // Al Radar no se le manda el botón del Sistema: allá la respuesta se ve en su propia burbuja.
    if (t) await enviarTelegram(t.chat_id, `💬 <b>Soporte te respondió</b> (caso #${casoId})\n\n${esc(corto(texto, 1500))}`,
      c.origen === 'sistema' ? [[{ texto: 'Ver en el sistema', url: urlSistema(`/aprendizaje?soporte=${casoId}`) }]] : []).catch(() => {})
  }
}

/** Un mensaje del dueño en Telegram que responde a un aviso de soporte → respuesta al caso. true si lo tomó. */
export async function respuestaDesdeTelegram(chatId: number, responde: number, texto: string) {
  const { rows: [r] } = await dbGlobal().query(
    `SELECT st.caso_id FROM soporte_telegram st WHERE st.chat_id = $1 AND st.message_id = $2`, [chatId, responde])
  if (!r) return false
  // Solo los chats del dueño (un cliente nunca recibe estos mensajes, pero por las dudas).
  if (!(await chatsDuenoPlataforma()).includes(String(chatId))) return false
  await responderCaso(Number(r.caso_id), texto, null)
  await enviarTelegram(chatId, `✅ Enviado al caso #${r.caso_id}.`).catch(() => {})
  return true
}

/** Lee un adjunto para servirlo. */
export async function leerAdjunto(casoId: number, archivo: string) {
  const ruta = rutaAdjunto(casoId, archivo)
  if (!ruta) return null
  try { return await readFile(ruta) } catch { return null }
}
