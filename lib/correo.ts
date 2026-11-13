// Correo saliente (13-11-2026): Resend (resend.com), dominio elcomerciantedigital.com verificado en Cloudflare
// (registros resend._domainkey, send y rsend). La clave va en RESEND_API_KEY (.env.production, la pone el dueño).
// Sin clave no se manda nada (correoConfigurado() = false) y quien llama sigue con lo demás (p. ej. Telegram).
const REMITENTE = process.env.CORREO_REMITENTE || 'El Comerciante Digital <no-responder@elcomerciantedigital.com>'

export const correoConfigurado = () => !!process.env.RESEND_API_KEY

export async function enviarCorreo(d: { para: string; asunto: string; html: string; texto: string }) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('Correo sin configurar (falta RESEND_API_KEY)')
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REMITENTE, to: [d.para], subject: d.asunto, html: d.html, text: d.texto }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
}

/** Correo a medio tapar, reconocible para su dueño (13-11): contrerasm@gmail.com → con•••@gmail.com */
export const correoOculto = (c: string) => {
  const [u, d] = c.split('@')
  if (!d) return '•••'
  return `${u.slice(0, Math.min(3, Math.ceil(u.length / 2)))}•••@${d}`
}
