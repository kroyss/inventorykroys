// Topes diarios de Mi IA (no descuentan créditos, pero gastan tokens nuestros), por empresa. La organización de la
// plataforma (SolucionesMC) no tiene tope. Se cuenta solo lo que terminó bien (si falla, no gasta una).
// Vive en app_settings.mi_ia_pruebas (por empresa).
//   · 09-11: prueba con 10 reales, máximo 2 por día para Preguntas y 2 para Mensajes.
//   · 12-11 (el dueño): con la IA de ese módulo ya ENCENDIDA, 1 por día (la prueba es para decidir si encenderla);
//     «Sugerir lo que falta» (prellenado) y «Pasar mis Políticas»: hasta 3 por día cada uno.
import type { Pool } from 'pg'
import { currentDate, COUNTRY_TZ } from '@/lib/tz'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'

export const PRUEBAS_POR_DIA = 2
const PRUEBAS_ENCENDIDA = 1
const SUGERIR_POR_DIA = 3
const CLAVE = 'mi_ia_pruebas'
// Mismas claves que lib/iaAutomatica.ts (CLAVE_IA_AUTO) y lib/mensajesIAPrueba.ts (CLAVE_AUTO); no se importan para no
// arrastrar esos módulos enteros.
const ENCENDIDA: Record<'preguntas' | 'mensajes', string> = { preguntas: 'preguntas_ia_auto', mensajes: 'mensajes_ia_auto' }
export type TipoTope = 'preguntas' | 'mensajes' | 'sugerir' | 'politicas'
type Usuario = { organizacionId: number; country: string }
type Cuenta = Record<TipoTope, number> & { fecha: string }

function hoy(u: Usuario) {
  return currentDate(COUNTRY_TZ[u.country as keyof typeof COUNTRY_TZ])
}

async function leer(db: Pick<Pool, 'query'>, u: Usuario): Promise<{ v: Cuenta; encendida: Record<'preguntas' | 'mensajes', boolean> }> {
  const { rows } = await db.query(`SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`,
    [[CLAVE, ENCENDIDA.preguntas, ENCENDIDA.mensajes]])
  const json = (k: string) => { try { return JSON.parse(rows.find(r => r.key === k)?.value ?? '{}') ?? {} } catch { return {} } }
  const f = hoy(u)
  const g = json(CLAVE)
  const v: Cuenta = g.fecha === f
    ? { fecha: f, preguntas: Number(g.preguntas) || 0, mensajes: Number(g.mensajes) || 0, sugerir: Number(g.sugerir) || 0, politicas: Number(g.politicas) || 0 }
    : { fecha: f, preguntas: 0, mensajes: 0, sugerir: 0, politicas: 0 }
  return { v, encendida: { preguntas: json(ENCENDIDA.preguntas).modo === 'real', mensajes: json(ENCENDIDA.mensajes).modo === 'real' } }
}

const tope = (tipo: TipoTope, encendida: Record<'preguntas' | 'mensajes', boolean>) =>
  tipo === 'sugerir' || tipo === 'politicas' ? SUGERIR_POR_DIA : encendida[tipo] ? PRUEBAS_ENCENDIDA : PRUEBAS_POR_DIA

/** Cuántas le quedan hoy de cada una; null = sin tope (la plataforma). */
export async function pruebasQuedan(db: Pick<Pool, 'query'>, u: Usuario): Promise<Record<TipoTope, number> | null> {
  if (u.organizacionId === ORGANIZACION_PLATAFORMA) return null
  const { v, encendida } = await leer(db, u)
  const q = (t: TipoTope) => Math.max(0, tope(t, encendida) - v[t])
  return { preguntas: q('preguntas'), mensajes: q('mensajes'), sugerir: q('sugerir'), politicas: q('politicas') }
}

/** ¿Puede hacerlo hoy? (antes de llamar a la IA) */
export async function puedeProbar(db: Pick<Pool, 'query'>, u: Usuario, tipo: TipoTope) {
  const q = await pruebasQuedan(db, u)
  return !q || q[tipo] > 0
}

/** Cuenta una hecha (después de que terminó bien). */
export async function contarPrueba(db: Pick<Pool, 'query'>, u: Usuario, tipo: TipoTope) {
  if (u.organizacionId === ORGANIZACION_PLATAFORMA) return
  const { v } = await leer(db, u)
  v[tipo] += 1
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [CLAVE, JSON.stringify(v)])
}

export const ERROR_TOPE = 'Ya hiciste las pruebas de hoy. Puedes volver a probar mañana.'
export const ERROR_TOPE_SUGERIR = `Ya lo usaste ${SUGERIR_POR_DIA} veces hoy. Puedes volver a usarlo mañana.`
