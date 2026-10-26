import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_RE } from '@/lib/usuarios'
import { choqueAlta, crearCuenta } from '@/lib/altaCuenta'
import { avisarDuenoPlataforma, MODULOS_PRUEBA } from '@/lib/registro'
import { esc } from '@/lib/telegram'

// POST /api/registro — autoregistro público (26-10, migración 125): crea la cuenta al instante en prueba de 15 días
// (arranca al conectar MercadoLibre, como siempre). Sin sesión. Protecciones: trampa para bots, tope por conexión,
// y la importante en api/ml/callback: una cuenta de ML ya usada no empieza otra prueba. Al dueño le llega un Telegram.
const Registro = z.object({
  negocio:  z.string().trim().min(2, 'Escribe el nombre de tu negocio').max(80),
  nombre:   z.string().trim().min(2, 'Escribe tu nombre').max(100),
  usuario:  z.string().trim().toLowerCase().regex(USERNAME_RE, 'Usuario: 3 a 30 caracteres, solo letras, números, punto, guion o guion bajo (sin espacios)'),
  correo:   z.string().trim().toLowerCase().email('Revisa el correo').max(120),
  whatsapp: z.string().trim().regex(/^[+\d\s()-]{7,20}$/, 'Revisa el número de WhatsApp').max(20),
  telegram: z.string().trim().transform(t => t.replace(/^@/, '')).pipe(z.string().regex(/^[A-Za-z0-9_]{0,32}$/, 'Revisa tu usuario de Telegram')).optional(),
  clave:    z.string().min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`).max(PASSWORD_MAX),
  sitio:    z.string().max(200).optional(),          // trampa para bots: un humano no lo ve ni lo llena
})

function ipDe(req: NextRequest) {
  // Detrás de Cloudflare: la IP real viene en cf-connecting-ip (igual que /api/fundadores).
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
}

/** Más de esto desde la misma conexión en un día no se crea (en Venezuela mucha gente comparte IP: no se baja más). */
const MAX_POR_IP_DIA = 3

export async function POST(req: NextRequest) {
  const r = Registro.safeParse(await req.json().catch(() => null))
  if (!r.success) return NextResponse.json({ error: r.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  const b = r.data
  if (b.sitio) return NextResponse.json({ ok: true })      // bot: se le dice que sí y no se crea nada

  const ip = ipDe(req)
  const ipHash = ip ? createHash('sha256').update(`${ip}|${process.env.NEXTAUTH_SECRET ?? ''}`).digest('hex').slice(0, 32) : null
  const client = await dbGlobal().connect()
  try {
    if (ipHash) {
      const { rows: [n] } = await client.query(
        `SELECT COUNT(*)::int AS n FROM organizaciones WHERE origen = 'autoregistro' AND registro->>'ip_hash' = $1
           AND created_at > NOW() - INTERVAL '1 day'`, [ipHash])
      if (n.n >= MAX_POR_IP_DIA) {
        return NextResponse.json({ error: 'Ya se crearon varias cuentas desde esta conexión hoy. Escríbenos por Telegram y te ayudamos.' }, { status: 429 })
      }
    }
    const { rows: [mismoCorreo] } = await client.query(`SELECT 1 FROM users WHERE lower(email) = $1`, [b.correo])
    if (mismoCorreo) return NextResponse.json({ error: 'Ese correo ya tiene una cuenta. Entra con tu usuario o escríbenos si no lo recuerdas.' }, { status: 400 })

    await client.query('BEGIN')
    const choque = await choqueAlta(client, b.negocio, b.usuario)
    if (choque) { await client.query('ROLLBACK'); return NextResponse.json({ error: choque }, { status: 400 }) }
    const c = await crearCuenta(client, {
      nombre: b.negocio, country: 'VE', modulos: [...MODULOS_PRUEBA], alta: 'prueba',
      admin: { username: b.usuario, full_name: b.nombre, password: b.clave, email: b.correo },
      origenOrgId: ORGANIZACION_PLATAFORMA, origen: 'autoregistro',
      registro: { correo: b.correo, whatsapp: b.whatsapp, telegram: b.telegram || null, ip_hash: ipHash,
                  navegador: req.headers.get('user-agent')?.slice(0, 200) ?? null },
    })
    await client.query('COMMIT')

    avisarDuenoPlataforma(
      `🆕 <b>Nueva prueba gratis (15 días)</b>\n${esc(b.negocio)} · ${esc(b.nombre)}\n`
      + `WhatsApp ${esc(b.whatsapp)}${b.telegram ? ` · @${esc(b.telegram)}` : ''} · ${esc(b.correo)}\n`
      + 'Los días arrancan cuando conecte MercadoLibre.')
      .catch(e => console.error('[registro] aviso', e instanceof Error ? e.message : e))
    return NextResponse.json({ ok: true, empresa: c.empresaId }, { status: 201 })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return apiError(err)
  } finally {
    await client.query('RESET ALL').catch(() => {})
    client.release()
  }
}
