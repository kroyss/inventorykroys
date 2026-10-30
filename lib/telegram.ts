// Bot de Telegram de los avisos (2026-10-14): @ComercianteDigitalAvisosBot. El token vive en el
// server (TELEGRAM_BOT_TOKEN, nunca en el repo). Solo se usa la Bot API por HTTPS: mandar mensajes
// y leer los "/start CODIGO" con los que cada persona conecta su Telegram (lib/avisosTelegram.ts).

/** staging y producción comparten el bot: cada uno manda solo a quien se conectó en él. */
export const ENTORNO = process.env.APP_ENV === 'staging' ? 'staging' : 'produccion'

export const telegramConfigurado = () => !!process.env.TELEGRAM_BOT_TOKEN

/** La persona bloqueó el bot o borró el chat: se la marca desconectada y no se le vuelve a escribir. */
export class TelegramBloqueado extends Error {}

async function api<T>(metodo: string, cuerpo: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('Telegram no está configurado')
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(10_000), cache: 'no-store',
  })
  const d = await r.json().catch(() => null) as { ok?: boolean; result?: T; error_code?: number; description?: string } | null
  if (!d?.ok) {
    const desc = d?.description ?? `HTTP ${r.status}`
    if (d?.error_code === 403 || /chat not found|user is deactivated/i.test(desc)) throw new TelegramBloqueado(desc)
    throw new Error(`Telegram: ${desc}`)
  }
  return d.result as T
}

/** Texto seguro para parse_mode HTML. */
export const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Recorta a n caracteres (sin cortar a la mitad un par sustituto de un emoji). */
export const corto = (s: string | null | undefined, n: number) => {
  const t = [...(s ?? '').replace(/\s+/g, ' ').trim()]
  return t.length > n ? t.slice(0, n - 1).join('') + '…' : t.join('')
}

export interface Boton { texto: string; url: string }

/** Manda un mensaje (HTML) con botones que abren el sistema. Lanza TelegramBloqueado si ya no se puede. */
export async function enviarTelegram(chatId: number | string, html: string, botones: Boton[][] = []) {
  await api('sendMessage', {
    chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true,
    ...(botones.length ? { reply_markup: { inline_keyboard: botones.map(f => f.map(b => ({ text: b.texto, url: b.url }))) } } : {}),
  })
}

/** Como enviarTelegram, pero devuelve el id del mensaje (Soporte: al "Responder" en Telegram se sabe a qué caso va). */
export async function enviarTelegramId(chatId: number | string, html: string, botones: Boton[][] = []) {
  const r = await api<{ message_id: number }>('sendMessage', {
    chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true,
    ...(botones.length ? { reply_markup: { inline_keyboard: botones.map(f => f.map(b => ({ text: b.texto, url: b.url }))) } } : {}),
  })
  return r.message_id
}

/** Manda una foto (captura de Soporte) como respuesta a un mensaje. Devuelve su id. */
export async function enviarFotoTelegram(chatId: number | string, foto: Buffer, nombreArchivo: string, tipo: string, responderA?: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('Telegram no está configurado')
  const f = new FormData()
  f.append('chat_id', String(chatId))
  if (responderA) f.append('reply_to_message_id', String(responderA))
  f.append(tipo === 'application/pdf' ? 'document' : 'photo', new Blob([new Uint8Array(foto)], { type: tipo }), nombreArchivo)
  const r = await fetch(`https://api.telegram.org/bot${token}/${tipo === 'application/pdf' ? 'sendDocument' : 'sendPhoto'}`, {
    method: 'POST', body: f, signal: AbortSignal.timeout(30_000), cache: 'no-store',
  })
  const d = await r.json().catch(() => null) as { ok?: boolean; result?: { message_id: number }; description?: string } | null
  if (!d?.ok) throw new Error(`Telegram: ${d?.description ?? `HTTP ${r.status}`}`)
  return d.result!.message_id
}

let nombre: string | null = null
/** @usuario del bot (sin @), para armar el link de conexión. */
export async function nombreBot() {
  nombre ??= (await api<{ username: string }>('getMe', {})).username
  return nombre
}

export interface ActualizacionTG {
  update_id: number
  message?: { message_id: number; date: number; text?: string; caption?: string; chat: { id: number; type: string }
    from?: { username?: string; first_name?: string; last_name?: string }
    reply_to_message?: { message_id: number } }
}

/** Lo que le escribieron al bot (sin confirmar: staging y producción leen la misma cola). */
export const leerActualizaciones = (desde?: number) =>
  api<ActualizacionTG[]>('getUpdates', { timeout: 0, limit: 100, allowed_updates: ['message'], ...(desde ? { offset: desde } : {}) })

/** URL del sistema para los botones (la de este entorno). */
export const urlSistema = (ruta: string) =>
  (process.env.NEXTAUTH_URL ?? 'https://app.elcomerciantedigital.com').replace(/\/$/, '') + ruta
