import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { parseBonusPhases } from '@/lib/bonus'

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const [{ rows: [r1] }, { rows: [r2] }, { rows: cfg }] = await Promise.all([
      db.query(`
        SELECT COALESCE(SUM(total_amount), 0) AS total
        FROM sales
        WHERE status IN ('PROCESADA', 'DESCARGADA', 'DESCARGADA_LOCAL')
          AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
      `),
      db.query(`
        SELECT COALESCE(SUM(total_amount), 0) AS total
        FROM sales
        WHERE status IN ('PROCESADA', 'DESCARGADA', 'DESCARGADA_LOCAL')
          AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
      `),
      db.query(`SELECT key, value FROM app_settings WHERE key LIKE 'bono\\_%'`),
    ])

    const settings: Record<string, string> = {}
    for (const c of cfg) settings[c.key] = c.value
    const PHASES = parseBonusPhases(settings)

    const salesAmount     = parseFloat(r1.total)
    const lastMonthSales  = parseFloat(r2.total)

    const completedPhases: number[] = []
    let currentPhase: (typeof PHASES)[number] | null = null
    let phaseProgress = 0

    for (const p of PHASES) {
      if (salesAmount >= p.end) {
        completedPhases.push(p.phase)
      } else if (!currentPhase) {
        currentPhase  = p
        const span    = p.end - p.start
        const inPhase = Math.max(0, salesAmount - p.start)
        phaseProgress = Math.round((inPhase / span) * 1000) / 10
      }
    }

    const allComplete  = completedPhases.length === PHASES.length
    const bonusEarned  = PHASES.filter(p => completedPhases.includes(p.phase))
                               .reduce((s, p) => s + p.bonus, 0)

    return NextResponse.json({
      current_phase:        currentPhase?.phase ?? null,
      current_phase_label:  currentPhase?.label ?? null,
      phase_progress_pct:   phaseProgress,
      completed_phases:     completedPhases,
      all_complete:         allComplete,
      has_bonus:            salesAmount >= PHASES[0].end,
      bonus_earned:         bonusEarned,
      sales_amount:         Math.round(salesAmount * 100) / 100,
      last_month_sales:     Math.round(lastMonthSales * 100) / 100,
      phases:               PHASES,
    })
  } catch (err) {
    return apiError(err)
  }
}
