// Recuperar la clave sin ayuda (13-11-2026, el dueño, mig. 175). Pantalla: /login/recuperar.
//   1. pedirCodigo(usuario o correo): código de 6 dígitos al correo (Resend, lib/correo.ts) y al Telegram vinculado.
//   2. cambiarConCodigo(usuario o correo, código, clave nueva): cambia la clave y cierra sus sesiones (session_version).
// Seguridad: la pantalla dice por dónde salió el código con los datos TAPADOS (c•••••@g•••.com, @c•••••) — decisión del
// dueño 13-11 (confirma que el usuario existe, a cambio de no dejar a nadie esperando); el código vence a los 15 min y
// acepta 5 intentos; máx. 3 pedidos por hora por persona y 10 por conexión; solo se guarda su hash.
// Si alguien insiste (llega al tope), el dueño de la plataforma recibe un aviso por Telegram (una vez por hora).
import { createHash, randomInt, timingSafeEqual } from 'crypto'
import { hash } from 'bcryptjs'
import { dbGlobal } from '@/lib/db'
import { correoConfigurado, correoOculto, enviarCorreo } from '@/lib/correo'
import { ENTORNO, enviarTelegram, esc, telegramConfigurado } from '@/lib/telegram'
import { avisarDuenoPlataforma } from '@/lib/registro'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/usuarios'

const VENCE_MIN = 15, MAX_INTENTOS = 5, MAX_POR_PERSONA_HORA = 3, MAX_POR_IP_HORA = 10

const hashCodigo = (codigo: string, userId: number) =>
  createHash('sha256').update(`${codigo}|${userId}|${process.env.NEXTAUTH_SECRET ?? ''}`).digest('hex')

interface Persona {
  id: number; username: string; email: string | null; full_name: string | null
  chat_id: string | null; tg_usuario: string | null; es_admin: boolean
}

/** Lo que ve la pantalla después de «Enviarme el código». */
export type ResultadoPedido =
  | { estado: 'enviado'; correo: string | null; telegram: string | null }   // telegram: '@c•••••' o '' (sin @usuario)
  | { estado: 'sin_canal'; admin: boolean }   // ni correo ni Telegram: empleado → su administrador; admin → soporte
  | { estado: 'no_existe' }
  | { estado: 'frenado' }                     // pidió demasiados códigos en una hora
  | { estado: 'fallo' }                       // tenía canal pero no salió (Resend/Telegram caído)

const telegramOculto = (u: string | null) => {
  const x = (u ?? '').replace(/^@/, '').trim()
  return x ? `@${x.slice(0, Math.min(3, Math.ceil(x.length / 2)))}•••` : ''
}

/** Por usuario o por correo (si coinciden los dos con personas distintas, gana el usuario). Solo cuentas activas. */
async function buscar(identificador: string): Promise<Persona | null> {
  const q = identificador.trim().toLowerCase()
  if (!q) return null
  const { rows: [p] } = await dbGlobal().query(
    `SELECT u.id, u.username, NULLIF(u.email, '') AS email, u.full_name, t.chat_id::text AS chat_id, t.tg_usuario,
            EXISTS (SELECT 1 FROM usuario_empresas ue WHERE ue.user_id = u.id AND ue.role = 'admin') AS es_admin
     FROM users u
     LEFT JOIN telegram_usuarios t ON t.user_id = u.id AND t.chat_id IS NOT NULL AND t.entorno = $2
     WHERE u.is_active AND (lower(u.username) = $1 OR lower(u.email) = $1)
     ORDER BY (lower(u.username) = $1) DESC LIMIT 1`, [q, ENTORNO])
  return p ?? null
}

const correoHtml = (nombre: string, codigo: string) => `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#171717">
  <p style="margin:0 0 16px;font-size:15px">Hola ${esc(nombre)},</p>
  <p style="margin:0 0 16px;font-size:15px">Pediste recuperar tu clave de <b>El Comerciante Digital</b>. Tu código es:</p>
  <p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:8px;background:#f7fee7;border:1px solid #d9f99d;border-radius:12px;padding:16px;text-align:center">${codigo}</p>
  <p style="margin:0 0 8px;font-size:13px;color:#525252">Vence en ${VENCE_MIN} minutos. Escríbelo en la pantalla donde lo pediste y elige tu clave nueva.</p>
  <p style="margin:0;font-size:13px;color:#525252">Si no fuiste tú, ignora este correo: tu clave sigue igual.</p>
</div>`

/** Paso 1. Dice por dónde salió el código (tapado) o por qué no salió. */
export async function pedirCodigo(identificador: string, ipHash: string | null): Promise<ResultadoPedido> {
  const db = dbGlobal()
  if (ipHash) {
    const { rows: [{ n }] } = await db.query(
      `SELECT count(*)::int AS n FROM clave_codigos WHERE ip_hash = $1 AND creado_at > NOW() - interval '1 hour'`, [ipHash])
    if (n >= MAX_POR_IP_HORA) {
      if (n === MAX_POR_IP_HORA) await avisarDuenoPlataforma(`🔐 <b>Recuperar clave</b>: una misma conexión pidió ${n} códigos en una hora (último con «${esc(identificador.slice(0, 60))}»). Quedó frenada por una hora.`)
      await db.query(`INSERT INTO clave_codigos (user_id, ip_hash, expira_at) VALUES (NULL, $1, NOW())`, [ipHash])
      return { estado: 'frenado' }
    }
  }
  const p = await buscar(identificador)
  if (!p) {
    await db.query(`INSERT INTO clave_codigos (user_id, ip_hash, expira_at) VALUES (NULL, $1, NOW())`, [ipHash])
    return { estado: 'no_existe' }
  }
  const usaCorreo = !!p.email && correoConfigurado()
  const usaTelegram = !!p.chat_id && telegramConfigurado()
  if (!usaCorreo && !usaTelegram) {
    await db.query(`INSERT INTO clave_codigos (user_id, ip_hash, expira_at) VALUES ($1, $2, NOW())`, [p.id, ipHash])
    // Tiene correo pero el envío de correos no está configurado: es falla nuestra, no de su cuenta.
    return p.email ? { estado: 'fallo' } : { estado: 'sin_canal', admin: p.es_admin }
  }
  const { rows: [{ n }] } = await db.query(
    `SELECT count(*)::int AS n FROM clave_codigos WHERE user_id = $1 AND creado_at > NOW() - interval '1 hour'`, [p.id])
  if (n >= MAX_POR_PERSONA_HORA) {
    if (n === MAX_POR_PERSONA_HORA) {
      await avisarDuenoPlataforma(`🔐 <b>Recuperar clave</b>: piden muchos códigos para <b>${esc(p.username)}</b> (${n + 1} en una hora). Quedó frenado por una hora; si es la persona, puedes darle clave nueva en Plataforma.`)
      await db.query(`INSERT INTO clave_codigos (user_id, ip_hash, expira_at) VALUES ($1, $2, NOW())`, [p.id, ipHash])
    }
    return { estado: 'frenado' }
  }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const nombre = (p.full_name ?? p.username).split(' ')[0]
  const canales: string[] = []
  if (usaCorreo && p.email) {
    await enviarCorreo({
      para: p.email, asunto: `Tu código: ${codigo} · El Comerciante Digital`, html: correoHtml(nombre, codigo),
      texto: `Hola ${nombre}, tu código para recuperar la clave de El Comerciante Digital es ${codigo}. Vence en ${VENCE_MIN} minutos. Si no fuiste tú, ignora este correo.`,
    }).then(() => canales.push('correo')).catch(err => console.error('[RECUPERAR CLAVE] correo', p.id, (err as Error).message))
  }
  if (usaTelegram && p.chat_id) {
    await enviarTelegram(p.chat_id,
      `🔐 Tu código para recuperar la clave: <b>${codigo}</b>\n\nVence en ${VENCE_MIN} minutos. Si no fuiste tú, ignóralo: tu clave sigue igual.`)
      .then(() => canales.push('telegram')).catch(err => console.error('[RECUPERAR CLAVE] telegram', p.id, (err as Error).message))
  }
  // El código nuevo reemplaza a los anteriores que no se usaron.
  await db.query(`UPDATE clave_codigos SET usado_at = NOW() WHERE user_id = $1 AND usado_at IS NULL`, [p.id])
  await db.query(
    `INSERT INTO clave_codigos (user_id, codigo_hash, canales, ip_hash, expira_at)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(mins => $5))`,
    [p.id, canales.length ? hashCodigo(codigo, p.id) : null, canales, ipHash, VENCE_MIN])
  if (!canales.length) return { estado: 'fallo' }
  return {
    estado: 'enviado',
    // Si escribió el correo, ya lo conoce: se muestra completo.
    correo: canales.includes('correo') && p.email ? (p.email.toLowerCase() === identificador.trim().toLowerCase() ? p.email : correoOculto(p.email)) : null,
    telegram: canales.includes('telegram') ? telegramOculto(p.tg_usuario) : null,
  }
}

/** Paso 2. Devuelve null si salió bien, o el error para mostrar. */
export async function cambiarConCodigo(identificador: string, codigo: string, clave: string): Promise<string | null> {
  if (clave.length < PASSWORD_MIN) return `La clave debe tener al menos ${PASSWORD_MIN} caracteres`
  if (clave.length > PASSWORD_MAX) return `La clave puede tener hasta ${PASSWORD_MAX} caracteres`
  const malo = 'El código no es válido o ya venció. Pide uno nuevo.'
  if (!/^\d{6}$/.test(codigo.trim())) return 'El código son 6 números'
  const p = await buscar(identificador)
  if (!p) return malo
  const client = await dbGlobal().connect()
  try {
    await client.query('BEGIN')
    const { rows: [c] } = await client.query(
      `SELECT id, codigo_hash, intentos FROM clave_codigos
       WHERE user_id = $1 AND usado_at IS NULL AND codigo_hash IS NOT NULL AND expira_at > NOW()
       ORDER BY id DESC LIMIT 1 FOR UPDATE`, [p.id])
    if (!c || c.intentos >= MAX_INTENTOS) { await client.query('ROLLBACK'); return malo }
    const a = Buffer.from(hashCodigo(codigo.trim(), p.id)), b = Buffer.from(c.codigo_hash as string)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await client.query(`UPDATE clave_codigos SET intentos = intentos + 1 WHERE id = $1`, [c.id])
      await client.query('COMMIT')
      const quedan = MAX_INTENTOS - c.intentos - 1
      return quedan > 0 ? `Código incorrecto. Te quedan ${quedan} intento${quedan === 1 ? '' : 's'}.` : malo
    }
    await client.query(
      `UPDATE users SET password_hash = $2, session_version = session_version + 1 WHERE id = $1`, [p.id, await hash(clave, 10)])
    await client.query(`UPDATE clave_codigos SET usado_at = NOW() WHERE user_id = $1 AND usado_at IS NULL`, [p.id])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
  if (p.chat_id && telegramConfigurado()) {
    await enviarTelegram(p.chat_id, '🔐 Tu clave de El Comerciante Digital se cambió recién. Si no fuiste tú, escríbenos de inmediato.').catch(() => {})
  }
  return null
}
