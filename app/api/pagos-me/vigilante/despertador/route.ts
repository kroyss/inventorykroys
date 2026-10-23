import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import type { Pool } from 'pg'
import { autenticarVigilante, PEDIDO_VIGENTE_MIN } from '@/lib/pagosME'
import { leerHorario } from '@/lib/pagosMEComun'

/**
 * POST /api/pagos-me/vigilante/despertador (clave del vigilante, x-perfil: DESPERTADOR) → cada ~1 min
 * desde el script de la PC (tools/vigilante-pagos-me/despertador.ps1). Chrome queda cerrado: si hay un
 * "Traer pagos y guías" vigente, el script abre los perfiles que todavía no lo hicieron (`hechos`), la
 * extensión trabaja y cierra su ventana.
 */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  try {
    await a.db.query(
      `INSERT INTO me_latidos (perfil, visto_at) VALUES ($1, NOW())
       ON CONFLICT (empresa_id, perfil) DO UPDATE SET visto_at = NOW()`, [a.perfil])
    await disparoAutomatico(a.db)
    const { rows: [p] } = await a.db.query(
      `SELECT id, resultados FROM me_pedidos
       WHERE pedido_at > NOW() - make_interval(mins => $1)
       ORDER BY id DESC LIMIT 1`, [PEDIDO_VIGENTE_MIN])
    return NextResponse.json({ pedido: p ? Number(p.id) : null, hechos: p ? Object.keys(p.resultados ?? {}) : [] })
  } catch (err) {
    return apiError(err)
  }
}

/**
 * Traer automático (Pagos ME → Configuración): si ya pasó una de las horas de hoy (hora de Venezuela:
 * la conexión tiene el TimeZone de la empresa) y desde 30 min antes de ella no hubo ningún pedido
 * (manual o automático), se crea uno (pedido_por NULL = automático). Solo la última hora pasada:
 * con la PC apagada a las 8:00, al prender a las 8:30 trae una vez; a las 13:00 solo la de 12:00.
 */
async function disparoAutomatico(db: Pool) {
  const { rows: [cfg] } = await db.query(`SELECT value FROM app_settings WHERE key = 'pagos_me_horario'`)
  const horario = leerHorario(cfg?.value)   // sin configurar = 8, 12, 16 y 19 h de lunes a sábado
  if (!horario.activo || !horario.horas.length) return
  const { rows: [t] } = await db.query(`SELECT EXTRACT(ISODOW FROM NOW())::int AS dia, to_char(NOW(), 'HH24:MI') AS hm`)
  if (!horario.dias.includes(t.dia)) return
  const hora = [...horario.horas].reverse().find(x => x <= t.hm)
  if (!hora) return
  // Sin ningún perfil de Chrome conectado nunca (23-10, recién instalado): no hay con qué traer. Antes se pedía la
  // traída atrasada de las 8:00 al conectar el programa a las 11 y quedaba "no se hizo" sin que nadie supiera por qué.
  const { rows: [perfil] } = await db.query(`SELECT 1 FROM me_latidos WHERE perfil <> 'DESPERTADOR' LIMIT 1`)
  if (!perfil) return
  await db.query(
    `INSERT INTO me_pedidos (pedido_por)
     SELECT NULL WHERE NOT EXISTS (
       SELECT 1 FROM me_pedidos WHERE pedido_at >= (CURRENT_DATE + $1::time) - INTERVAL '30 minutes')`, [hora])
}
