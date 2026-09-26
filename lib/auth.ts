import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { getDb } from '@/lib/db'
import type { NextAuthOptions } from 'next-auth'
import type { Country, UserRole } from '@/lib/types'

// Versión de sesión del usuario (migración 026). Se lee vía to_jsonb para que el login
// funcione aunque la columna todavía no exista (deploy antes que la migración): vale 0.
const SQL_SESSION_VERSION = `COALESCE((to_jsonb(users) ->> 'session_version')::int, 0) AS sv`

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Usuario',    type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
        country:  { label: 'País',       type: 'text' },
      },
      async authorize(credentials) {
        const country = credentials?.country as Country | undefined
        if (!credentials?.username || !credentials?.password || !country) return null
        if (country !== 'VE' && country !== 'CO') return null

        const db = getDb(country)
        const { rows } = await db.query(
          `SELECT id, username, full_name, password_hash, role, country_access, is_active,
                  ${SQL_SESSION_VERSION}
           FROM users WHERE username = $1`,
          [credentials.username.toLowerCase().trim()]
        )

        const user = rows[0]
        if (!user || !user.is_active) return null
        if (user.country_access !== country) return null

        const valid = await compare(credentials.password, user.password_hash)
        if (!valid) return null

        await db.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id])

        return {
          id:       String(user.id),
          email:    user.username,
          name:     user.full_name,
          role:     user.role as UserRole,
          country:  user.country_access as Country,
          sv:       user.sv,
        }
      },
    }),
  ],
  // Sesión de 12h (jornada). Es "rolling": updateAge re-emite el token mientras
  // se use, así las 12h cuentan desde la última actividad, no desde el login.
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60, updateAge: 60 * 60 },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const u = user as { role: UserRole; country: Country; sv?: number }
        token.role    = u.role
        token.country = u.country
        token.sv      = u.sv ?? 0
      }

      // Cambio de país en caliente (solo admin), vía useSession().update({ country }).
      // El admin está duplicado por DB con id propio, así que re-resolvemos su id en
      // la DB destino para no atribuir movimientos al id equivocado.
      if (trigger === 'update' && token.role === 'admin') {
        const c = (session as { country?: string } | undefined)?.country
        if (c === 'VE' || c === 'CO') {
          const db = getDb(c)
          const { rows } = await db.query(
            `SELECT id, role, country_access, ${SQL_SESSION_VERSION}
             FROM users WHERE username = $1 AND is_active = TRUE`,
            [String(token.email ?? '').toLowerCase().trim()]
          )
          const u = rows[0]
          if (u && u.role === 'admin' && u.country_access === c) {
            token.sub     = String(u.id)
            token.country = c
            token.sv      = u.sv
          }
        }
      }

      // La sesión solo sirve mientras el usuario siga activo, con el mismo rol y sin que
      // le hayan cambiado la contraseña (session_version). Si no, se lanza: NextAuth
      // descarta la sesión y borra la cookie. Sin esto, un usuario desactivado seguía
      // entrando mientras tuviera la pestaña abierta (la sesión se renueva sola 12 h).
      if (token.sub && (token.country === 'VE' || token.country === 'CO')) {
        const { rows: [u] } = await getDb(token.country as Country).query(
          `SELECT is_active, role, ${SQL_SESSION_VERSION} FROM users WHERE id = $1`, [token.sub])
        if (!u || !u.is_active || u.role !== token.role || u.sv !== (token.sv ?? 0)) {
          throw new Error('Sesión cerrada: el usuario fue desactivado o cambió su acceso')
        }
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        const u = session.user as { id?: string; role?: string; country?: string }
        u.id      = token.sub
        u.role    = token.role    as string
        u.country = token.country as string
      }
      return session
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
}
