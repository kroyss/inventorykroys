// Cortes de Fundadores (2026-10-16, decidido con el dueño; 20-10 varios cortes, uno por tanda de altas: ver
// lib/fundadoresCortes.ts). A la hora de cada corte, los Fundadores en prueba de esa tanda que siguen sin conectar
// ninguna cuenta de MercadoLibre pasan a "vencido" (no pueden entrar; su cupo queda para la lista de espera), queda
// en su historia (organizacion_eventos, mig. 106) y al dueño le llega por Telegram la lista de quiénes salieron.
// Cada corte corre una sola vez. Se reactiva en Plataforma → Clientes.
// Lo llama el cron de preguntas (cada minuto); no hace nada antes de la hora ni después de hecho.
import { conEmpresa, dbGlobal } from '@/lib/db'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { CORTES, corteDeAlta, corteISO, type Corte } from '@/lib/fundadoresCortes'
import { ENTORNO, enviarTelegram, esc, telegramConfigurado, urlSistema } from '@/lib/telegram'
import type { Country } from '@/lib/types'

const clave = (c: Corte) => `fundadores_corte_${c.fecha}`
const SQL_CREADA = `(o.created_at AT TIME ZONE 'America/Caracas')::date`

async function cuentasML(empresas: { id: number; country: Country }[]) {
  let n = 0
  for (const e of empresas) {
    const { rows: [c] } = await conEmpresa(e.id, e.country, db => db.query(`SELECT COUNT(*)::int AS n FROM ml_conexiones`))
    n += c.n
  }
  return n
}

export async function corteFundadores() {
  const hechos: { fecha: string; salen: string[] }[] = []
  for (const c of CORTES) {
    if (Date.now() < Date.parse(corteISO(c))) continue
    const r = await cortar(c)
    if (r) hechos.push({ fecha: c.fecha, salen: r.salen })
  }
  return hechos.length ? hechos : null
}

async function cortar(c: Corte) {
  const { rows: [hecho] } = await dbGlobal().query(`SELECT 1 FROM plataforma_ajustes WHERE key = $1`, [clave(c)])
  if (hecho) return null

  // Candidatos: Fundadores en prueba creados en la tanda de este corte. ml_conexiones es por empresa (RLS):
  // se cuenta empresa por empresa con su propia conexión.
  const { rows: orgs } = await dbGlobal().query(
    `SELECT o.id, o.nombre, COALESCE(json_agg(json_build_object('id', e.id, 'country', e.country)) FILTER (WHERE e.id IS NOT NULL), '[]') AS empresas
     FROM organizaciones o LEFT JOIN empresas e ON e.organizacion_id = o.id
     WHERE o.fundador AND o.estado = 'prueba' AND o.id <> $1
       AND ($2::date IS NULL OR ${SQL_CREADA} >= $2::date) AND ${SQL_CREADA} <= $3::date
     GROUP BY o.id, o.nombre ORDER BY o.nombre`, [ORGANIZACION_PLATAFORMA, c.desde, c.hasta])
  const salen: string[] = []
  for (const o of orgs) {
    if (await cuentasML(o.empresas) > 0) continue
    const { rowCount } = await dbGlobal().query(
      `UPDATE organizaciones SET estado = 'vencido', motivo_pausa = 'corte_fundadores', pausa_fecha = CURRENT_DATE
       WHERE id = $1 AND estado = 'prueba'`, [o.id])
    if (!rowCount) continue
    await dbGlobal().query(`INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle) VALUES ($1, 'pausada', 'corte_fundadores')`, [o.id])
      .catch(e => console.error('[corte fundadores] historia', e))
    salen.push(o.nombre)
  }
  // Se marca hecho ANTES de avisar: aunque Telegram falle, el corte no se repite.
  await dbGlobal().query(
    `INSERT INTO plataforma_ajustes (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
    [clave(c), JSON.stringify({ at: new Date().toISOString(), salen })])

  if (telegramConfigurado()) {
    const { rows: dest } = await dbGlobal().query(
      `SELECT DISTINCT t.chat_id::text FROM telegram_usuarios t
       JOIN usuario_empresas ue ON ue.user_id = t.user_id AND ue.role = 'admin'
       JOIN empresas e ON e.id = ue.empresa_id AND e.organizacion_id = $1
       WHERE t.chat_id IS NOT NULL AND t.entorno = $2`, [ORGANIZACION_PLATAFORMA, ENTORNO])
    const ddmm = c.fecha.split('-').reverse().slice(0, 2).join('/')
    const html = salen.length
      ? `✂️ <b>Corte de Fundadores (${ddmm})</b>\n\n`
        + `Salieron <b>${salen.length}</b> por no conectar MercadoLibre a tiempo:\n${salen.map(n => `• ${esc(n)}`).join('\n')}\n\n`
        + 'Ya no pueden entrar y sus cupos quedan libres para la lista de espera. Si alguno merece otra oportunidad, se reactiva en Plataforma → Clientes → Ver inactivos.'
      : `✂️ <b>Corte de Fundadores (${ddmm})</b>\n\nTodos los de esta tanda conectaron MercadoLibre: no salió nadie. 🎉`
    for (const d of dest) await enviarTelegram(d.chat_id, html, [[{ texto: 'Abrir Plataforma', url: urlSistema('/plataforma') }]]).catch(() => {})
  }
  return { salen }
}

/**
 * Aviso del último plazo: si esta organización saldría en un corte que todavía no llegó, la hora de ese corte
 * (ISO); si no, null. Fundador en prueba, de una tanda con corte y sin ninguna cuenta de ML.
 */
export async function corteQueLeToca(organizacionId: number): Promise<string | null> {
  const { rows: [o] } = await dbGlobal().query(
    `SELECT to_char(${SQL_CREADA}, 'YYYY-MM-DD') AS creada,
            COALESCE(json_agg(json_build_object('id', e.id, 'country', e.country)) FILTER (WHERE e.id IS NOT NULL), '[]') AS empresas
     FROM organizaciones o LEFT JOIN empresas e ON e.organizacion_id = o.id
     WHERE o.id = $1 AND o.id <> $2 AND o.fundador AND o.estado = 'prueba'
     GROUP BY o.id`, [organizacionId, ORGANIZACION_PLATAFORMA])
  if (!o) return null
  const c = corteDeAlta(o.creada)
  if (!c || Date.now() >= Date.parse(corteISO(c))) return null
  return await cuentasML(o.empresas) > 0 ? null : corteISO(c)
}
