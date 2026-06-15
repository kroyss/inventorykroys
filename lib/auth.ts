import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { getDb } from '@/lib/db'
import type { NextAuthOptions } from 'next-auth'
import type { Country, UserRole } from '@/lib/types'

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
          `SELECT id, username, full_name, password_hash, role, country_access, is_active
           FROM users WHERE username = $1`,
          [credentials.username.toLowerCase().trim()]
        )

        const user = rows[0]
        if (!user || !user.is_active) return null
        if (user.country_access !== country) return null

        const valid = await compare(credentials.password, user.password_hash)
        if (!valid) return null

        return {
          id:       String(user.id),
          email:    user.username,
          name:     user.full_name,
          role:     user.role as UserRole,
          country:  user.country_access as Country,
        }
      },
    }),
  ],
  // Sesión de 12h (jornada). Es "rolling": updateAge re-emite el token mientras
  // se use, así las 12h cuentan desde la última actividad, no desde el login.
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60, updateAge: 60 * 60 },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as { role: UserRole; country: Country }
        token.role    = u.role
        token.country = u.country
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
