import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { COUNTRY_TZ, DEFAULT_TZ, nowParts } from '@/lib/tz'

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// Vista del mes actual (acumulado de ventas por día) + totales de meses pasados
// como puntos de referencia. Mismos estados que cuentan para el bono.
export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const [{ rows: daily }, { rows: prev }] = await Promise.all([
      // Conteo por día del mes actual
      db.query(`
        SELECT EXTRACT(DAY FROM created_at)::int AS day, COUNT(*) AS count
        FROM sales
        WHERE status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
          AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        GROUP BY 1
        ORDER BY 1
      `),
      // Conteo POR DÍA de los 2 meses anteriores (para acumulado comparable)
      db.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS ym,
          EXTRACT(DAY FROM created_at)::int AS day,
          COUNT(*) AS count
        FROM sales
        WHERE status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
          AND created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '2 months'
          AND created_at <  DATE_TRUNC('month', NOW())
        GROUP BY 1, 2
      `),
    ])

    // Días del mes actual — en la zona del país de la sesión (no la del contenedor),
    // para que coincida con NOW()/DATE_TRUNC del SQL de arriba.
    const tz          = COUNTRY_TZ[session.user.country as 'VE' | 'CO'] ?? DEFAULT_TZ
    const { year, month } = nowParts(tz)                 // month 1-12
    const mIdx        = month - 1                          // 0-based para Date/MONTH_NAMES
    const daysInMonth = new Date(year, month, 0).getDate()
    const today       = nowParts(tz).day

    const perDay = new Map<number, number>()
    for (const r of daily) perDay.set(r.day, parseInt(r.count, 10) || 0)

    // Acumulado día a día hasta hoy (los días futuros quedan null)
    let running = 0
    const points: { day: number; cumulative: number | null }[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      if (d <= today) {
        running += perDay.get(d) ?? 0
        points.push({ day: d, cumulative: running })
      } else {
        points.push({ day: d, cumulative: null })
      }
    }

    // Referencias de meses pasados: acumulado día a día, alineado al eje del mes
    // actual, para comparar por días equivalentes (no contra el total de cierre).
    const prevByMonthDay = new Map<string, Map<number, number>>()
    for (const r of prev) {
      const day = parseInt(r.day, 10)
      const cnt = parseInt(r.count, 10) || 0
      if (!prevByMonthDay.has(r.ym)) prevByMonthDay.set(r.ym, new Map())
      prevByMonthDay.get(r.ym)!.set(day, cnt)
    }
    const refs: { label: string; total: number; at_today: number; cumulative: (number | null)[] }[] = []
    for (let i = 2; i >= 1; i--) {
      const dt        = new Date(year, mIdx - i, 1)
      const ym        = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      const daysInRef = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
      const perDayRef = prevByMonthDay.get(ym) ?? new Map<number, number>()

      // Acumulado real del mes de referencia, día 1..daysInRef
      const refCum: number[] = []
      let acc = 0
      for (let d = 1; d <= daysInRef; d++) { acc += perDayRef.get(d) ?? 0; refCum[d] = acc }
      const total   = acc
      const atToday = refCum[Math.min(today, daysInRef)] ?? 0

      // Proyectado al eje del mes actual (si el ref tiene menos días, queda plano al final)
      const cumulative: (number | null)[] = []
      for (let d = 1; d <= daysInMonth; d++) cumulative.push(refCum[Math.min(d, daysInRef)] ?? 0)

      refs.push({ label: MONTH_NAMES[dt.getMonth()], total, at_today: atToday, cumulative })
    }

    return NextResponse.json({
      current_month: MONTH_NAMES[mIdx],
      total:         running,
      days_in_month: daysInMonth,
      today,
      points,
      // [{ label, total, at_today, cumulative[] }] meses anteriores (más antiguo → más reciente)
      refs,
    })
  } catch (err) {
    return apiError(err)
  }
}
