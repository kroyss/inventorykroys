// Empresas y acceso de usuarios (tablas GLOBALES: se leen con dbGlobal()).
import { dbGlobal } from '@/lib/db'
import type { Country, UserRole } from '@/lib/types'
import { SQL_CUENTA_HABILITADA } from '@/lib/cuenta'

export interface EmpresaAcceso {
  id: number
  nombre: string
  country: Country
  modulos: string[]
  role: UserRole
  organizacionId: number
  habilitada: boolean      // la cuenta de su organización está al día (no vencida)
}

/** Empresas activas a las que entra un usuario, con su rol en cada una. Por defecto solo las
 *  de cuentas habilitadas (lib/cuenta.ts); `incluirVencidas` las trae todas (el login lo usa para
 *  decir "tu prueba terminó" en vez de "usuario o contraseña incorrectos"). */
export async function empresasDeUsuario(userId: number | string, { incluirVencidas = false } = {}): Promise<EmpresaAcceso[]> {
  const { rows } = await dbGlobal().query(
    `SELECT e.id, e.nombre, e.country, e.modulos, ue.role, e.organizacion_id AS "organizacionId",
            ${SQL_CUENTA_HABILITADA} AS habilitada
     FROM usuario_empresas ue JOIN empresas e ON e.id = ue.empresa_id
     JOIN organizaciones o ON o.id = e.organizacion_id
     WHERE ue.user_id = $1 AND e.is_active ${incluirVencidas ? '' : `AND ${SQL_CUENTA_HABILITADA}`}
     ORDER BY e.id`,
    [userId],
  )
  return rows as EmpresaAcceso[]
}

/** La empresa hermana (misma organización) de un país. Finanzas de SolucionesMC vive en
 *  la empresa VE y suma la operación de la empresa CO. */
export async function empresaHermana(empresaId: number, country: Country): Promise<{ id: number; country: Country } | null> {
  const { rows: [e] } = await dbGlobal().query(
    `SELECT h.id, h.country
     FROM empresas e JOIN empresas h ON h.organizacion_id = e.organizacion_id
     WHERE e.id = $1 AND h.country = $2 AND h.is_active
     ORDER BY h.id LIMIT 1`,
    [empresaId, country],
  )
  return (e as { id: number; country: Country } | undefined) ?? null
}

// La organización dueña de la plataforma (SolucionesMC). Sus admins manejan lo que es
// común a todas las empresas: las tasas del día (BCV / paralelo / TRM).
export const ORGANIZACION_PLATAFORMA = Number(process.env.PLATAFORMA_ORGANIZACION_ID ?? 1)

export function esDuenoPlataforma(user: { role: UserRole; organizacionId?: number }) {
  return user.role === 'admin' && user.organizacionId === ORGANIZACION_PLATAFORMA
}
