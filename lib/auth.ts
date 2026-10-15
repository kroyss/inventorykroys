import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { dbGlobal } from '@/lib/db'
import { empresasDeUsuario, type EmpresaAcceso } from '@/lib/empresa'
import { CUENTA_VENCIDA } from '@/lib/cuenta'
import type { NextAuthOptions } from 'next-auth'
import type { Country, UserRole } from '@/lib/types'
import { permisosEfectivos } from '@/lib/permisos'

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
    permisos:      permisosEfectivos(e.role, e.permisos),
    modulos:       e.modulos,
    organizacionId: e.organizacionId,
  }
}

// Sesión (2026-10-14, antes 12 h fijas desde el login): se cierra tras SESION_HORAS SIN USO; usándola
// sigue abierta, con un tope de SESION_MAX_DIAS desde el login (ahí se pide la contraseña igual).
const SESION_HORAS = 12
const SESION_MAX_DIAS = 7

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
  // La cookie vive hasta el tope; el corte por falta de uso lo decide el callback jwt (users.ultima_actividad).
  session: { strategy: 'jwt', maxAge: SESION_MAX_DIAS * 24 * 60 * 60, updateAge: 60 * 60 },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const u = user as { role: UserRole; permisos: string[]; country: Country; empresaId: number; empresaNombre: string; modulos: string[]; organizacionId: number; sv?: number }
        token.role          = u.role
        token.permisos      = u.permisos
        token.country       = u.country
        token.empresaId     = u.empresaId
        token.empresaNombre = u.empresaNombre
        token.modulos       = u.modulos
        token.organizacionId = u.organizacionId
        token.sv            = u.sv ?? 0
        token.loginAt       = Date.now()
      }

      // Tope desde el login, se use o no (las sesiones sin loginAt cuentan desde ahora).
      token.loginAt ??= Date.now()
      if (Date.now() - token.loginAt > SESION_MAX_DIAS * 24 * 60 * 60 * 1000) {
        throw new Error(`Sesión vencida: pasaron ${SESION_MAX_DIAS} días desde que iniciaste sesión`)
      }

      // Una sesión de ANTES del cambio a multiempresa (sin empresa) no sirve: se descarta
      // y el usuario vuelve a entrar.
      if (!token.empresaId) throw new Error('Sesión anterior al cambio de sistema')

      // Cada request: el usuario sigue activo, con la misma versión de sesión (contraseña)
      // y con acceso a la empresa. Rol y módulos se refrescan de la base: un cambio de
      // permisos o de módulos se aplica sin volver a entrar.
      const empresas = await empresasDeUsuario(token.sub!)
      const { rows: [u] } = await dbGlobal().query(
        `SELECT is_active, session_version AS sv, ultima_actividad FROM users WHERE id = $1`, [token.sub])
      if (!u || !u.is_active || u.sv !== (token.sv ?? 0)) {
        throw new Error('Sesión cerrada: el usuario fue desactivado o cambió su contraseña')
      }
      // Sin uso en SESION_HORAS (última actividad del usuario, leída ANTES de anotar esta): se cierra.
      // Recién entrado no cuenta: la última actividad puede ser de antes del login.
      const ultimoUso = Math.max(token.loginAt, u.ultima_actividad ? new Date(u.ultima_actividad).getTime() : 0)
      if (Date.now() - ultimoUso > SESION_HORAS * 60 * 60 * 1000) {
        throw new Error(`Sesión vencida: ${SESION_HORAS} horas sin usar el sistema`)
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
        const pedido = session as { empresaId?: unknown; country?: unknown; verComo?: unknown } | undefined
        // "Ver como este usuario" (Usuarios): un admin ve el sistema con el rol y los permisos de otra
        // persona de la empresa, en solo lectura (proxy.ts). null = volver a su cuenta.
        if (pedido && 'verComo' in pedido) {
          const id = Number(pedido.verComo)
          token.verComo = pedido.verComo !== null && id > 0 && String(id) !== token.sub ? { id, nombre: '' } : null
        }
        const otra = elegir(empresas, pedido?.empresaId, pedido?.country)
        if (otra && (pedido?.empresaId !== undefined ? otra.id === Number(pedido.empresaId) : otra.country === pedido?.country)) {
          actual = otra
        }
      }
      if (!actual) throw new Error('Sesión cerrada: ya no tienes acceso a esta empresa (o su cuenta venció)')

      const datos = datosEmpresa(actual)
      // Ver como: se revalida en CADA request con el rol REAL (actual.role, el del admin en esta
      // empresa): si deja de ser admin, la persona ya no es de la empresa, está inactiva o es admin,
      // se termina solo. Lo que cambia es solo el rol y los permisos; la cuenta (token.sub) sigue
      // siendo la del admin.
      if (token.verComo) {
        const { rows: [v] } = actual.role === 'admin' ? await dbGlobal().query(
          `SELECT u.id, COALESCE(NULLIF(u.full_name, ''), u.username) AS nombre, ue.role, ue.permisos
           FROM users u JOIN usuario_empresas ue ON ue.user_id = u.id AND ue.empresa_id = $2
           WHERE u.id = $1 AND u.is_active`, [token.verComo.id, actual.id]) : { rows: [] }
        if (!v || v.role === 'admin') token.verComo = null
        else {
          token.verComo = { id: v.id, nombre: v.nombre }
          datos.role = v.role
          datos.permisos = permisosEfectivos(v.role, v.permisos)
        }
      }
      Object.assign(token, datos)
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id            = token.sub!
        session.user.role          = token.role
        session.user.permisos      = token.permisos
        session.user.country       = token.country
        session.user.empresaId     = token.empresaId
        session.user.empresaNombre = token.empresaNombre
        session.user.modulos       = token.modulos
        session.user.organizacionId = token.organizacionId
        session.user.verComo       = token.verComo ?? null
      }
      return session
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
}
