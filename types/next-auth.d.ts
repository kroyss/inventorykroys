import type { DefaultSession } from 'next-auth'
import type { Country, UserRole } from '@/lib/types'

interface VerComo { id: number; nombre: string }

// Multiempresa: la sesión apunta a UNA empresa. `country` es el país de esa empresa
// (el código existente sigue decidiendo VE/CO por session.user.country) y `role` es el
// rol del usuario EN esa empresa (usuario_empresas).
declare module 'next-auth' {
  interface User {
    role:          UserRole
    permisos:      string[]   // lib/permisos.ts (admin: todos)
    country:       Country
    empresaId:     number
    empresaNombre: string
    modulos:       string[]
    organizacionId: number
    sv?:           number   // versión de sesión (users.session_version)
  }
  interface Session extends DefaultSession {
    user: DefaultSession['user'] & {
      id:            string
      role:          UserRole
    permisos:      string[]   // lib/permisos.ts (admin: todos)
      country:       Country
      empresaId:     number
      empresaNombre: string
      modulos:       string[]
      organizacionId: number
      verComo?:      VerComo | null   // "Ver como este usuario" (lib/auth.ts): role y permisos son los de esa persona
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role:          UserRole
    permisos:      string[]   // lib/permisos.ts (admin: todos)
    country:       Country
    empresaId:     number
    empresaNombre: string
    modulos:       string[]
    organizacionId: number
    sv?:           number   // versión de sesión: si no coincide con la base, la sesión se descarta
    loginAt?:      number   // ms del inicio de sesión: a las 12 h se pide la contraseña de nuevo
    verComo?:      VerComo | null
  }
}
