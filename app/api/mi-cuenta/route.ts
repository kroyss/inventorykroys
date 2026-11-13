import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { compare, hash } from 'bcryptjs'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { ENTORNO } from '@/lib/telegram'
import { avisosHabilitados } from '@/lib/avisosTelegram'
import { unauthorized, forbidden } from '@/lib/session'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/usuarios'

// Mi cuenta (13-11-2026, el dueño; mig. 176). Cada persona: sus datos (nombre, correo, WhatsApp) y su clave.
// El administrador, además, el nombre de su negocio. Su equipo sigue en /api/users.
//   GET                                   → datos de la persona + Telegram vinculado + negocio
//   PUT { accion: 'datos', full_name, email, whatsapp }
//   PUT { accion: 'clave', actual, nueva }  → cierra TODAS sus sesiones (vuelve a entrar con la nueva)
//   PUT { accion: 'negocio', nombre }       → solo admin; queda en la Historia de la cuenta (Plataforma)
const Cuerpo = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('datos'),
    full_name: z.string().trim().min(2, 'Escribe tu nombre').max(100),
    email: z.string().trim().toLowerCase().email('Revisa el correo').max(120).or(z.literal('')),
    whatsapp: z.string().trim().regex(/^([+\d\s()-]{7,20})?$/, 'Revisa el número de WhatsApp'),
  }),
  z.object({
    accion: z.literal('clave'),
    actual: z.string().min(1, 'Escribe tu contraseña actual').max(200),
    nueva: z.string().min(PASSWORD_MIN, `La contraseña nueva debe tener al menos ${PASSWORD_MIN} caracteres`).max(PASSWORD_MAX),
  }),
  z.object({
    accion: z.literal('negocio'),
    nombre: z.string().trim().min(2, 'Escribe el nombre del negocio').max(80),
  }),
])

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return unauthorized()
  try {
    const { rows: [u] } = await dbGlobal().query(
      `SELECT u.username, u.full_name, NULLIF(u.email, '') AS email, NULLIF(u.whatsapp, '') AS whatsapp,
              t.tg_usuario, (t.chat_id IS NOT NULL) AS telegram
       FROM users u LEFT JOIN telegram_usuarios t ON t.user_id = u.id AND t.chat_id IS NOT NULL AND t.entorno = $2
       WHERE u.id = $1`, [session.user.id, ENTORNO])
    if (!u) return unauthorized()
    const { rows: [e] } = await dbGlobal().query(`SELECT nombre FROM empresas WHERE id = $1`, [session.user.empresaId])
    return NextResponse.json({
      ...u, telegram: !!u.telegram,
      avisos: await avisosHabilitados(session.user.organizacionId),
      admin: session.user.role === 'admin', negocio: e?.nombre ?? null,
    })
  } catch (err) {
    return apiError(err)
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return unauthorized()
  const r = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!r.success) return NextResponse.json({ error: r.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  const b = r.data
  const yo = Number(session.user.id)
  const db = dbGlobal()
  try {
    if (b.accion === 'datos') {
      if (b.email) {
        const { rows: [dup] } = await db.query(`SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2`, [b.email, yo])
        if (dup) return NextResponse.json({ error: 'Ese correo ya está en otra cuenta' }, { status: 400 })
      }
      await db.query(`UPDATE users SET full_name = $2, email = NULLIF($3, ''), whatsapp = NULLIF($4, '') WHERE id = $1`,
        [yo, b.full_name, b.email, b.whatsapp])
      return NextResponse.json({ ok: true })
    }

    if (b.accion === 'clave') {
      const { rows: [u] } = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [yo])
      if (!u || !(await compare(b.actual, u.password_hash))) return NextResponse.json({ error: 'La contraseña actual no es correcta' }, { status: 400 })
      if (b.actual === b.nueva) return NextResponse.json({ error: 'La nueva tiene que ser distinta de la actual' }, { status: 400 })
      await db.query(`UPDATE users SET password_hash = $2, session_version = session_version + 1 WHERE id = $1`, [yo, await hash(b.nueva, 10)])
      return NextResponse.json({ ok: true })
    }

    // Nombre del negocio: solo el administrador de esta empresa. Misma regla que Plataforma: la organización con
    // una sola empresa y el mismo nombre se renombra también.
    if (session.user.role !== 'admin') return forbidden()
    const id = session.user.empresaId
    const { rows: [e] } = await db.query(`SELECT nombre, organizacion_id FROM empresas WHERE id = $1`, [id])
    if (!e) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    if (e.nombre === b.nombre) return NextResponse.json({ ok: true })
    const { rows: [dup] } = await db.query(`SELECT 1 FROM empresas WHERE lower(nombre) = lower($1) AND id <> $2`, [b.nombre, id])
    if (dup) return NextResponse.json({ error: 'Ya hay otro negocio con ese nombre. Prueba con otro.' }, { status: 400 })
    await db.query(
      `UPDATE organizaciones o SET nombre = $2 FROM empresas e
       WHERE e.id = $1 AND o.id = e.organizacion_id AND o.nombre = e.nombre AND o.estado <> 'propietario'
         AND (SELECT COUNT(*) FROM empresas x WHERE x.organizacion_id = o.id) = 1`, [id, b.nombre])
    await db.query(`UPDATE empresas SET nombre = $2 WHERE id = $1`, [id, b.nombre])
    await db.query(`INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle, por) VALUES ($1, 'renombrada', $2, $3)`,
      [e.organizacion_id, `${e.nombre} → ${b.nombre}`, session.user.id]).catch(err => console.error('[organizacion_eventos]', err))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return NextResponse.json({ error: 'Ya hay otro negocio con ese nombre. Prueba con otro.' }, { status: 400 })
    return apiError(err)
  }
}
