'use client'
import { NIVEL, type Nivel } from '@/lib/salud'

// Recargo sobre costo (14-11-2026, el dueño; antes «% de ganancia», y antes la "categoría de ganancia"): lo que se le suma
// al costo para el precio. Barra de 0 a 200 % y campo para escribirlo; los dos se mueven juntos. El color sale del nivel de
// la RENTABILIDAD que deja ese recargo (sana / ajustada / pérdida, configurable en Productos → Costos ML), así se ve al
// instante si el precio aguanta.
export const GANANCIA_MAX = 200

export default function MedidorGanancia({ valor, onChange, nivel, titulo = 'Recargo sobre costo', ayuda, children }: {
  valor: number | null
  onChange: (n: number) => void
  nivel: Nivel | null           // null: sin datos para medir (sin costo o sin tasa)
  titulo?: string
  ayuda?: React.ReactNode
  children?: React.ReactNode    // lo que va debajo (precio resultante, botones)
}) {
  const v = valor ?? 0
  const n = nivel ? NIVEL[nivel] : null
  const fijar = (x: number) => onChange(Math.max(0, Math.min(GANANCIA_MAX, Math.round(x * 10) / 10)))
  const lleno = Math.min(100, v / GANANCIA_MAX * 100)
  const color = !n ? '#737373' : nivel === 'sano' ? '#059669' : nivel === 'ajustado' ? '#ea580c' : '#dc2626'
  return (
    <div className={`rounded-lg border-2 p-3 transition-colors ${n ? n.fondo : 'border-neutral-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="ganancia-pct" className="text-xs font-semibold text-neutral-700">
          {titulo}
          {n && <span className={`ml-2 text-[11px] font-semibold ${n.texto}`}>{n.icono} {n.nombre}</span>}
          <span className="block text-[10px] font-normal text-neutral-500">lo que le sumas a lo que te costó</span>
        </label>
        <span className="flex items-center gap-1">
          <input id="ganancia-pct" type="number" inputMode="decimal" min={0} max={GANANCIA_MAX} step={0.5}
            value={valor == null ? '' : v} placeholder="0"
            onChange={e => fijar(Number(e.target.value) || 0)}
            className={`w-20 rounded-md border border-neutral-300 bg-white px-2 py-1 text-right text-lg font-bold focus:outline-none focus:ring-2 focus:ring-neutral-800 ${n ? n.texto : 'text-neutral-800'}`} />
          <span className="text-sm font-semibold text-neutral-500">%</span>
        </span>
      </div>
      <input type="range" min={0} max={GANANCIA_MAX} step={1} value={v} aria-label={titulo}
        onChange={e => fijar(Number(e.target.value))}
        className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full"
        style={{ background: `linear-gradient(to right, ${color} ${lleno}%, #e5e5e5 ${lleno}%)`, accentColor: color }} />
      <div className="mt-0.5 flex justify-between text-[10px] text-neutral-400"><span>0%</span><span>100%</span><span>200%</span></div>
      {ayuda && <p className="mt-1 text-[11px] text-neutral-500">{ayuda}</p>}
      {children}
    </div>
  )
}
