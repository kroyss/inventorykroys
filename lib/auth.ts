import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { dbGlobal } from '@/lib/db'
import { empresasDeUsuario, type EmpresaAcceso } from '@/lib/empresa'
import { CUENTA_VENCIDA } from '@/lib/cuenta'
import type { NextAuthOptions } from 'next-auth'
import type { Country, UserRole } from '@/lib/types'

// Multiempresa: el usuario es uno solo (users es global) y entra a una de SUS empresas
// (usuario_empresas). La sesión guarda esa empresa; su país y su rol salen de ahí.

// Qué empresa abrir al entrar o al cambiar: la pedida por id, si no la del país pedido
// (el login y el selector VE/CO de siempre siguen funcionando), si no la primera.
function elegir(empresas: EmpresaAcceso[], empresaId?: unknown, country?: unknown) {
  const id = Number(empresaId)
  return empresas.find(e => e.id === id)
    ?? empresas.find(e => e.country === country)
    ?? empresas[0]
    ?? null
}

function datosEmpresa(e: EmpresaAcceso) {
  return {
    empresaId:     e.id,
    empresaNombre: e.nombre,
    country:       e.country,
    role:          e.role,
    modulos:       e.modulos,
    organizacionId: e.organizacionId,
  }
}

const SESION_HORAS = 12

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Usuario',    type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
        country:  { label: 'País',       type: 'text' },
        empresa:  { label: 'Empresa',    type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null

        const db = dbGlobal()
        const { rows: [user] } = await db.query(
          `SELECT id, username, full_name, password_hash, is_active, session_version AS sv
           FROM users WHERE username = $1`,
          [credentials.username.toLowerCase().trim()],
        )
        if (!user || !user.is_active) return null
        if (!(await compare(credentials.password, user.password_hash))) return null

        const todas = await empresasDeUsuario(user.id, { incluirVencidas: true })
        const empresa = elegir(todas.filter(e => e.habilitada), credentials.empresa, credentials.country)
        if (!empresa) {
          // Tiene empresas pero su cuenta venció (prueba terminada o sin pago): se le dice.
          if (todas.length) throw new Error(CUENTA_VENCIDA)
          return null   // usuario sin ninguna empresa activa
        }

        await db.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id])

        return {
          id:    String(user.id),
          email: user.username,
          name:  user.full_name,
          sv:    user.sv ?? 0,
          ...datosEmpresa(empresa),
        }
      },
    }),
  ],
  // Sesión de 12 h FIJAS desde el inicio de sesión (token.loginAt), se use o no: a las 12 h
  // se pide la contraseña de nuevo. maxAge/updateAge solo mantienen viva la cookie hasta ahí.
  session: { strategy: 'jwt', maxAge: SESION_HORAS * 60 * 60, updateAge: 60 * 60 },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const u = user as { role: UserRole; country: Country; empresaId: number; empresaNombre: string; modulos: string[]; organizacionId: number; sv?: number }
        token.role          = u.role
        token.country       = u.country
        token.empresaId     = u.empresaId
        token.empresaNombre = u.empresaNombre
        token.modulos       = u.modulos
        token.organizacionId = u.organizacionId
        token.sv            = u.sv ?? 0
        token.loginAt       = Date.now()
      }

      // 12 h desde el login, sin importar el uso. Las sesiones de antes de esta regla
      // (sin loginAt) cuentan desde ahora.
      token.loginAt ??= Date.now()
      if (Date.now() - token.loginAt > SESION_HORAS * 60 * 60 * 1000) {
        throw new Error('Sesión vencida: pasaron 12 horas desde que iniciaste sesión')
      }

      // Una sesión de ANTES del cambio a multiempresa (sin empresa) no sirve: se descarta
      // y el usuario vuelve a entrar.
      if (!token.empresaId) throw new Error('Sesión anterior al cambio de sistema')

      // Cada request: el usuario sigue activo, con la misma versión de sesión (contraseña)
      // y con acceso a la empresa. Rol y módulos se refrescan de la base: un cambio de
      // permisos o de módulos se aplica sin volver a entrar.
      const empresas = await empresasDeUsuario(token.sub!)
      const { rows: [u] } = await dbGlobal().query(
        `SELECT is_active, session_version AS sv FROM users WHERE id = $1`, [token.sub])
      if (!u || !u.is_active || u.sv !== (token.sv ?? 0)) {
        throw new Error('Sesión cerrada: el usuario fue desactivado o cambió su contraseña')
      }
      // Última actividad (migración 069), como máximo cada 2 minutos (antes cada hora): la usa el cron
      // de ML para saber qué empresas están en uso, y Plataforma para mostrar quién está "en línea ahora"
      // (lib/plataforma: EN_LINEA_MINUTOS) y no actualizar producción mientras alguien trabaja.
      await dbGlobal().query(
        `UPDATE users SET ultima_actividad = NOW()
         WHERE id = $1 AND (ultima_actividad IS NULL OR ultima_actividad < NOW() - INTERVAL '2 minutes')`, [token.sub]).catch(() => {})

      // Cambio de empresa en caliente, vía useSession().update({ empresaId }) — o
      // update({ country }), el selector VE/CO de siempre.
      let actual = empresas.find(e => e.id === token.empresaId) ?? null
      if (trigger === 'update') {
        const pedido = session as { empresaId?: unknown; country?: unknown } | undefined
        const otra = elegir(empresas, pedido?.empresaId, pedido?.country)
        if (otra && (pedido?.empresaId !== undefined ? otra.id === Number(pedido.empresaId) : otra.country === pedido?.country)) {
          actual = otra
        }
      }
      if (!actual) throw new Error('Sesión cerrada: ya no tienes acceso a esta empresa (o su cuenta venció)')

      Object.assign(token, datosEmpresa(actual))
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id            = token.sub!
        session.user.role          = token.role
        session.user.country       = token.country
        session.user.empresaId     = token.empresaId
        session.user.empresaNombre = token.empresaNombre
        session.user.modulos       = token.modulos
        session.user.organizacionId = token.organizacionId
      }
      return session
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
}
