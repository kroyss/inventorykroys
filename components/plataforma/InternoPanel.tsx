'use client'
import { useEffect, useState } from 'react'
import { FUNCIONES_INTERNAS } from '@/lib/funcionesInternas'
import { MODULOS } from '@/lib/modulos'

interface Fila {
  empresa_id: number; empresa: string; mes: string; modulo: string
  borradores: number; entrada: number; salida: number; busquedas: number; costo: number
}
interface Empresa { id: number; nombre: string; porMes: Record<string, { costo: number; borradores: number; preguntas: number; mensajes: number }> }

// Montos chicos (centavos de dólar) con más decimales: si no, $0,0026 se vería como $0,00.
const usd = (n: number) => `$${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 0.995 ? 4 : 2 })}`
const nombreMes = (m: string) => new Intl.DateTimeFormat('es-VE', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  .format(new Date(`${m}-15T12:00:00Z`)).replace('.', '')

/** Plataforma → Interno: consumo de IA de cada empresa y la lista de lo que los clientes no ven. */
export default function InternoPanel() {
  const [datos, setDatos] = useState<{ meses: string[]; filas: Fila[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/plataforma/uso-ia')
      .then(async r => { const d = await r.json().catch(() => ({})); if (!vivo) return; if (r.ok) setDatos(d); else setError(d.error ?? 'No se pudo cargar') })
      .catch(() => { if (vivo) setError('No se pudo cargar') })
    return () => { vivo = false }
  }, [])

  const empresas: Empresa[] = []
  for (const f of datos?.filas ?? []) {
    let e = empresas.find(x => x.id === f.empresa_id)
    if (!e) { e = { id: f.empresa_id, nombre: f.empresa, porMes: {} }; empresas.push(e) }
    const c = (e.porMes[f.mes] ??= { costo: 0, borradores: 0, preguntas: 0, mensajes: 0 })
    c.costo += f.costo; c.borradores += f.borradores
    if (f.modulo === 'preguntas') c.preguntas += f.borradores
    if (f.modulo === 'mensajes') c.mensajes += f.borradores
  }
  const meses = datos?.meses ?? []
  const mesActual = meses[meses.length - 1]
  const totalMes = (m: string) => empresas.reduce((a, e) => a + (e.porMes[m]?.costo ?? 0), 0)
  const resumen = (e: Empresa) => {
    const conUso = meses.filter(m => e.porMes[m]?.borradores)
    const costo = conUso.reduce((a, m) => a + e.porMes[m].costo, 0)
    const borradores = conUso.reduce((a, m) => a + e.porMes[m].borradores, 0)
    return { promedioMes: conUso.length ? costo / conUso.length : 0, porBorrador: borradores ? costo / borradores : 0 }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Consumo de IA por empresa</h2>
          <p className="text-sm text-neutral-500">
            Lo que cuestan los borradores de la IA en Preguntas y Mensajes. En la fase Fundadores lo paga la plataforma;
            sirve para saber cuánto consume una cuenta en promedio y ponerle precio.
          </p>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
        {!datos ? !error && <p className="text-sm text-neutral-400">Cargando…</p> : empresas.length === 0 ? (
          <p className="text-sm text-neutral-400 py-6 text-center bg-white rounded-xl border border-neutral-200">Todavía ninguna empresa usó la IA.</p>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200">
                  <th className="px-4 py-2.5 font-medium">Empresa</th>
                  {meses.map(m => (
                    <th key={m} className={`px-3 py-2.5 font-medium text-right whitespace-nowrap ${m === mesActual ? 'text-neutral-900' : ''}`}>
                      {nombreMes(m)}{m === mesActual ? ' (en curso)' : ''}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap border-l border-neutral-100">Promedio/mes</th>
                  <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">Por borrador</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map(e => {
                  const r = resumen(e)
                  return (
                    <tr key={e.id} className="border-b border-neutral-100 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-neutral-900 whitespace-nowrap">{e.nombre}</td>
                      {meses.map(m => {
                        const c = e.porMes[m]
                        return (
                          <td key={m} className="px-3 py-2.5 text-right whitespace-nowrap"
                            title={c ? `${c.preguntas} de Preguntas · ${c.mensajes} de Mensajes` : undefined}>
                            {c ? <>
                              <span className="num text-neutral-900">{usd(c.costo)}</span>
                              <span className="block text-[11px] text-neutral-400 num">{c.borradores} borr.</span>
                            </> : <span className="text-neutral-300">—</span>}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2.5 text-right num border-l border-neutral-100">{usd(r.promedioMes)}</td>
                      <td className="px-4 py-2.5 text-right num text-neutral-600">
                        ${r.porBorrador.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-50 text-xs font-semibold text-neutral-700">
                  <td className="px-4 py-2">Total plataforma</td>
                  {meses.map(m => <td key={m} className="px-3 py-2 text-right num">{totalMes(m) ? usd(totalMes(m)) : '—'}</td>)}
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-xs text-neutral-400">
          Promedio/mes: solo cuenta los meses en que la empresa usó la IA. Pasa el mouse por una celda para ver cuántos borradores fueron de Preguntas y cuántos de Mensajes.
        </p>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Solo para ti</h2>
          <p className="text-sm text-neutral-500">
            Lo de la plataforma que ningún cliente ve, nunca. La lista vive en <code className="text-xs">lib/funcionesInternas.ts</code>.
          </p>
        </div>
        <ul className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100">
          {FUNCIONES_INTERNAS.map(f => (
            <li key={f.nombre} className="px-4 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-medium text-neutral-900">{f.nombre}</span>
              <span className="text-xs text-neutral-400">{f.donde} · desde {f.desde.split('-').reverse().join('/')}</span>
              <span className="basis-full text-sm text-neutral-600">{f.motivo}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Lo que se activa por cliente</h2>
          <p className="text-sm text-neutral-500">
            Tu empresa tiene todo; a cada cliente se le prende lo que corresponda en <b>Empresas</b> (casillas de módulos).
            Lo nuevo o en pruebas entra apagado para los clientes. El núcleo (Ventas, Inventario, Compras, Productos,
            Reportes, Ajustes, Usuarios) lo tienen todos.
          </p>
        </div>
        <ul className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100 text-sm">
          {Object.entries(MODULOS).map(([clave, texto]) => (
            <li key={clave} className="px-4 py-2.5 flex items-baseline gap-3">
              <code className="text-xs text-neutral-400 w-24 shrink-0">{clave}</code>
              <span className="text-neutral-700">{texto}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
