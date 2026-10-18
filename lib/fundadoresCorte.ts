// Corte de Fundadores (2026-10-16, decidido con el dueño): el lunes FECHA_CORTE los Fundadores que siguen
// sin conectar ninguna cuenta de MercadoLibre pasan a "vencido" (no pueden entrar; su cupo queda para la
// lista de espera) y al dueño le llega por Telegram la lista de quiénes salieron. Una sola vez.
// Cuentas creadas hasta CREADAS_HASTA (Ronda 1, Ronda 2 y las altas de la lista de espera hasta el domingo,
// p. ej. Maikel el 16-10, que tienen el mismo plazo): las posteriores no se tocan. Se reactiva a mano en
// Plataforma → Clientes.
// Lo llama el cron de preguntas (cada minuto); no hace nada antes de la fecha ni después de hecho.
import { conEmpresa, dbGlobal } from '@/lib/db'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { FECHA_LIMITE_ACTIVACION } from '@/lib/fundadores'
import { ENTORNO, enviarTelegram, esc, telegramConfigurado, urlSistema } from '@/lib/telegram'
import type { Country } from '@/lib/types'

export const FECHA_CORTE = '2026-10-19'
const CREADAS_HASTA = FECHA_LIMITE_ACTIVACION     // 18/10: todo lo creado hasta el domingo tiene el mismo plazo
const HORA_CORTE = 23                             // hora de Venezuela (18-10: de 7 a 23, un día completo más)
const CLAVE = `fundadores_corte_${FECHA_CORTE}`

export async function corteFundadores() {
  const ahora = new Date().toLocaleString('sv-SE', { timeZone: 'America/Caracas' })
  if (ahora.slice(0, 10) < FECHA_CORTE || Number(ahora.slice(11, 13)) < HORA_CORTE) return null
  const { rows: [hecho] } = await dbGlobal().query(`SELECT 1 FROM plataforma_ajustes WHERE key = $1`, [CLAVE])
  if (hecho) return null

  // Candidatos: Fundadores en prueba creados hasta CREADAS_HASTA. ml_conexiones es por empresa (RLS):
  // se cuenta empresa por empresa con su propia conexión.
  const { rows: orgs } = await dbGlobal().query(
    `SELECT o.id, o.nombre, COALESCE(json_agg(json_build_object('id', e.id, 'country', e.country)) FILTER (WHERE e.id IS NOT NULL), '[]') AS empresas
     FROM organizaciones o LEFT JOIN empresas e ON e.organizacion_id = o.id
     WHERE o.fundador AND o.estado = 'prueba' AND o.id <> $1
       AND (o.created_at AT TIME ZONE 'America/Caracas')::date <= $2::date
     GROUP BY o.id, o.nombre ORDER BY o.nombre`, [ORGANIZACION_PLATAFORMA, CREADAS_HASTA])
  const salen: string[] = []
  for (const o of orgs) {
    let cuentas = 0
    for (const e of o.empresas as { id: number; country: Country }[]) {
      const { rows: [c] } = await conEmpresa(e.id, e.country, db => db.query(`SELECT COUNT(*)::int AS n FROM ml_conexiones`))
      cuentas += c.n
    }
    if (cuentas > 0) continue
    await dbGlobal().query(`UPDATE organizaciones SET estado = 'vencido' WHERE id = $1 AND estado = 'prueba'`, [o.id])
    salen.push(o.nombre)
  }
  // Se marca hecho ANTES de avisar: aunque Telegram falle, el corte no se repite.
  await dbGlobal().query(
    `INSERT INTO plataforma_ajustes (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
    [CLAVE, JSON.stringify({ at: new Date().toISOString(), salen })])

  if (telegramConfigurado()) {
    const { rows: dest } = await dbGlobal().query(
      `SELECT DISTINCT t.chat_id::text FROM telegram_usuarios t
       JOIN usuario_empresas ue ON ue.user_id = t.user_id AND ue.role = 'admin'
       JOIN empresas e ON e.id = ue.empresa_id AND e.organizacion_id = $1
       WHERE t.chat_id IS NOT NULL AND t.entorno = $2`, [ORGANIZACION_PLATAFORMA, ENTORNO])
    const html = salen.length
      ? `✂️ <b>Corte de Fundadores (${FECHA_CORTE.split('-').reverse().slice(0, 2).join('/')})</b>\n\n`
        + `Salieron <b>${salen.length}</b> por no conectar MercadoLibre a tiempo:\n${salen.map(n => `• ${esc(n)}`).join('\n')}\n\n`
        + 'Ya no pueden entrar y sus cupos quedan libres para la lista de espera. Si alguno merece otra oportunidad, se reactiva en Plataforma → Clientes.'
      : `✂️ <b>Corte de Fundadores</b>\n\nTodos los Fundadores conectaron MercadoLibre: no salió nadie. 🎉`
    for (const d of dest) await enviarTelegram(d.chat_id, html, [[{ texto: 'Abrir Plataforma', url: urlSistema('/plataforma') }]]).catch(() => {})
  }
  return { salen }
}
