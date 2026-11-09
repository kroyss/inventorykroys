// Tope de la prueba de Mi IA (09-11-2026, el dueño): gratis (no descuenta créditos), pero máximo 2 por día para
// Preguntas y 2 para Mensajes, por empresa. La organización de la plataforma (SolucionesMC) no tiene tope.
// Se cuenta solo la prueba que terminó bien (si falla, no gasta una). Vive en app_settings.mi_ia_pruebas (por empresa).
import type { Pool } from 'pg'
import { currentDate, COUNTRY_TZ } from '@/lib/tz'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'

export const PRUEBAS_POR_DIA = 2
const CLAVE = 'mi_ia_pruebas'
type Tipo = 'preguntas' | 'mensajes'
type Usuario = { organizacionId: number; country: string }

function hoy(u: Usuario) {
  return currentDate(COUNTRY_TZ[u.country as keyof typeof COUNTRY_TZ])
}

async function leer(db: Pick<Pool, 'query'>, u: Usuario): Promise<{ fecha: string; preguntas: number; mensajes: number }> {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE])
  const f = hoy(u)
  try {
    const v = JSON.parse(r?.value ?? '{}')
    if (v.fecha === f) return { fecha: f, preguntas: Number(v.preguntas) || 0, mensajes: Number(v.mensajes) || 0 }
  } catch { /* vacío */ }
  return { fecha: f, preguntas: 0, mensajes: 0 }
}

/** Cuántas pruebas le quedan hoy de cada tipo; null = sin tope (la plataforma). */
export async function pruebasQuedan(db: Pick<Pool, 'query'>, u: Usuario): Promise<{ preguntas: number; mensajes: number } | null> {
  if (u.organizacionId === ORGANIZACION_PLATAFORMA) return null
  const v = await leer(db, u)
  return { preguntas: Math.max(0, PRUEBAS_POR_DIA - v.preguntas), mensajes: Math.max(0, PRUEBAS_POR_DIA - v.mensajes) }
}

/** ¿Puede probar hoy? (antes de correr la prueba) */
export async function puedeProbar(db: Pick<Pool, 'query'>, u: Usuario, tipo: Tipo) {
  const q = await pruebasQuedan(db, u)
  return !q || q[tipo] > 0
}

/** Cuenta una prueba hecha (después de que terminó bien). */
export async function contarPrueba(db: Pick<Pool, 'query'>, u: Usuario, tipo: Tipo) {
  if (u.organizacionId === ORGANIZACION_PLATAFORMA) return
  const v = await leer(db, u)
  v[tipo] += 1
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [CLAVE, JSON.stringify(v)])
}

export const ERROR_TOPE = `Ya hiciste las ${PRUEBAS_POR_DIA} pruebas de hoy. Puedes volver a probar mañana.`
