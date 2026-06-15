import type { DefaultSession } from 'next-auth'
import type { Country, UserRole } from '@/lib/types'

declare module 'next-auth' {
  interface User {
    role:    UserRole
    country: Country
  }
  interface Session extends DefaultSession {
    user: DefaultSession['user'] & {
      id:      string
      role:    UserRole
      country: Country
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role:    UserRole
    country: Country
  }
}
