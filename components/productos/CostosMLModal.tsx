'use client'
import { useState } from 'react'
import { Ventana } from '@/components/ui/Ventana'
import { parseShippingTable } from '@/lib/mlShipping'
import { umbralesDe, NIVEL } from '@/lib/salud'

// Productos → Costos ML (14-11-2026, el dueño): lo que MercadoLibre te descuenta de cada venta y desde qué % la
// rentabilidad (sobre costo) es sana o ajustada. Antes estaba solo en Ajustes (y los colores fijos en el código). Lo cambia el admin
// o quien tenga el permiso «Configurar costos ML». La tabla de MercadoEnvíos se muestra (solo lectura).
type Campo = { key: string; label: string; ayuda?: string; paso: string; defecto: number; sufijo: string }

const VE: Campo[] = [
  { key: 'ml_comision', label: 'Comisión de MercadoLibre', paso: '0.5', defecto: 12, sufijo: '%', ayuda: 'Lo que ML cobra de cada venta (en Venezuela, 12 %).' },
  { key: 'ml_envio', label: 'Envío de un producto sin peso', paso: '0.01', defecto: 0.65, sufijo: '$', ayuda: 'Solo para productos sin peso. Con peso se usa la tabla de abajo.' },
  { key: 'ml_umbral', label: 'Envío gratis desde (sin peso)', paso: '0.5', defecto: 5, sufijo: '$' },
]
const CO: Campo[] = [
  { key: 'ml_comision', label: 'Comisión de MercadoLibre', paso: '0.5', defecto: 15.5, sufijo: '%' },
  { key: 'ml_umbral_envio', label: 'Envío gratis desde', paso: '1000', defecto: 60000, sufijo: '$' },
  { key: 'ml_envio_bajo', label: 'Envío por debajo de ese precio', paso: '100', defecto: 2600, sufijo: '$' },
  { key: 'ml_envio_alto', label: 'Envío desde ese precio', paso: '100', defecto: 8000, sufijo: '$' },
  { key: 'ml_reten', label: 'Retenciones', paso: '0.01', defecto: 1.91, sufijo: '%' },
]

export default function CostosMLModal({ country, ml, onCerrar, onGuardado }: {
  country: 'VE' | 'CO'; ml: Record<string, string>; onCerrar: () => void; onGuardado: (nuevo: Record<string, string>) => void
}) {
  const campos = country === 'CO' ? CO : VE
  const u = umbralesDe(ml)
  const [v, setV] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(campos.map(c => [c.key, ml[c.key] ?? String(c.defecto)])),
    rentab_sano: String(u.sano), rentab_ajustado: String(u.ajustado),
  }))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sano = parseFloat(v.rentab_sano), ajustado = parseFloat(v.rentab_ajustado)
  const coloresMal = isNaN(sano) || isNaN(ajustado) || ajustado > sano
  const tabla = country === 'VE' ? parseShippingTable(ml.ml_shipping_table) : []

  const guardar = async () => {
    if (coloresMal) return
    setGuardando(true); setError(null)
    const r = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }).catch(() => null)
    setGuardando(false)
    if (!r?.ok) { setError((await r?.json().catch(() => null))?.error ?? 'No se pudo guardar. Prueba de nuevo.'); return }
    onGuardado(v); onCerrar()
  }

  const input = (key: string, paso: string, sufijo: string) => (
    <span className="flex items-center gap-1">
      {sufijo === '$' && <span className="text-sm text-neutral-500">$</span>}
      <input type="number" step={paso} min={key.startsWith('rentab') ? -100 : 0} value={v[key]} onChange={e => setV(x => ({ ...x, [key]: e.target.value }))}
        className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
      {sufijo === '%' && <span className="text-sm text-neutral-500">%</span>}
    </span>
  )

  return (
    <Ventana titulo="Costos de MercadoLibre" onCerrar={onCerrar}>
      <p className="text-xs text-neutral-500">Lo que MercadoLibre te descuenta de cada venta. Se usa en «Te queda», la rentabilidad del catálogo y Promociones.</p>
      <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
        {campos.map(c => (
          <div key={c.key} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0"><div className="text-sm text-neutral-800">{c.label}</div>
              {c.ayuda && <div className="text-[11px] text-neutral-400">{c.ayuda}</div>}</div>
            {input(c.key, c.paso, c.sufijo)}
          </div>
        ))}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-neutral-800">Colores de la rentabilidad</h4>
        <p className="text-[11px] text-neutral-500">Rentabilidad sobre costo: lo que te queda después de MercadoLibre ÷ lo que te costó el producto. 25 % = ganas $25 por cada $100 en mercancía.</p>
        <div className="mt-1.5 divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className={`text-sm font-medium ${NIVEL.sano.texto}`}>{NIVEL.sano.icono} Sana desde</span>{input('rentab_sano', '1', '%')}
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className={`text-sm font-medium ${NIVEL.ajustado.texto}`}>{NIVEL.ajustado.icono} Ajustada desde</span>{input('rentab_ajustado', '1', '%')}
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className={`text-sm font-medium ${NIVEL.perdida.texto}`}>{NIVEL.perdida.icono} Pérdida</span>
            <span className="text-sm text-neutral-500">por debajo de {isNaN(ajustado) ? '—' : `${ajustado}%`}</span>
          </div>
        </div>
        {coloresMal && <p className="mt-1 text-xs text-red-600">«Ajustada desde» tiene que ser menor o igual que «Sana desde».</p>}
      </div>

      {tabla.length > 0 && (
        <details className="rounded-lg border border-neutral-200 px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-800">Tabla de MercadoEnvíos (envío gratis por peso)</summary>
          <p className="mt-1 text-[11px] text-neutral-500">Con peso, el envío que cobra ML sale de aquí: hasta ese peso, envío gratis desde ese precio. Es la misma para todos los vendedores y la mantiene al día El Comerciante Digital.</p>
          <table className="mt-1 w-full text-xs">
            <tbody>{tabla.map((t, i) => (
              <tr key={i} className="border-t border-neutral-100"><td className="py-1 text-neutral-600">{t.maxKg >= 999 ? `más de ${tabla[i - 1]?.maxKg ?? 80} kg` : `hasta ${t.maxKg.toLocaleString('de-DE')} kg`}</td>
                <td className="py-1 text-right font-medium">desde ${t.minPrice.toLocaleString('de-DE')}</td></tr>
            ))}</tbody>
          </table>
        </details>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className="btn-secondary text-sm">Cancelar</button>
        <button type="button" onClick={guardar} disabled={guardando || coloresMal} className="btn-primary text-sm">{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </Ventana>
  )
}
