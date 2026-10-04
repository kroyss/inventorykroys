'use client'
import { useEffect, useState } from 'react'
import { FUNCIONES_INTERNAS } from '@/lib/funcionesInternas'
import { MODULOS } from '@/lib/modulos'

interface Fila {
  empresa_id: number; empresa: string; mes: string; modulo: string
  borradores: number; entrada: number; salida: number; busquedas: number; costo: number
}
interface Empresa { id: number; nombre: string; porMes: Record<string, { costo: number; borradores: number; preguntas: number; mensajes: number; fichas: number }> }
interface Detalle {
  empresa_id: number; dia: string; modulo: string; modelo: string; usuario: string
  usos: number; entrada: number; salida: number; busquedas: number; costo: number
}
interface EmpresaMeta { id: number; nombre: string; propietario: boolean; limite: number | null }
interface Datos { meses: string[]; filas: Fila[]; detalle: Detalle[]; empresas: EmpresaMeta[]; diasMes: number; diaHoy: number }

const MODULO_TXT: Record<string, string> = { preguntas: 'Preguntas', mensajes: 'Mensajes', fichas: 'Fichas (segundo plano)' }
const modeloTxt = (m: string) => m
  .replace(/claude-haiku-[\w.-]+/g, 'Haiku').replace(/claude-sonnet-[\w.-]+/g, 'Sonnet').replace(/claude-opus-[\w.-]+/g, 'Opus')
const tok = (n: number) => n >= 1e6 ? `${(n / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 })} M` : n >= 1e3 ? `${Math.round(n / 1e3).toLocaleString('de-DE')} mil` : String(n)

// Montos chicos (centavos de dólar) con más decimales: si no, $0,0026 se vería como $0,00.
const usd = (n: number) => `$${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 0.995 ? 4 : 2 })}`
const nombreMes = (m: string) => new Intl.DateTimeFormat('es-VE', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  .format(new Date(`${m}-15T12:00:00Z`)).replace('.', '')

/** Plataforma → Interno: consumo de IA de cada empresa y la lista de lo que los clientes no ven. */
export default function InternoPanel() {
  const [datos, setDatos] = useState<Datos | null>(null)
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
    const c = (e.porMes[f.mes] ??= { costo: 0, borradores: 0, preguntas: 0, mensajes: 0, fichas: 0 })
    c.costo += f.costo
    // Borradores = lo pedido con el botón (Preguntas + Mensajes). Las fichas suman al costo, no acá.
    if (f.modulo === 'preguntas') { c.preguntas += f.borradores; c.borradores += f.borradores }
    if (f.modulo === 'mensajes') { c.mensajes += f.borradores; c.borradores += f.borradores }
    if (f.modulo === 'fichas') c.fichas += f.costo
  }
  const meses = datos?.meses ?? []
  const mesActual = meses[meses.length - 1]
  const totalMes = (m: string) => empresas.reduce((a, e) => a + (e.porMes[m]?.costo ?? 0), 0)
  const resumen = (e: Empresa) => {
    const conUso = meses.filter(m => e.porMes[m]?.costo)
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
                            title={c ? `${c.preguntas} de Preguntas · ${c.mensajes} de Mensajes${c.fichas ? ` · fichas ${usd(c.fichas)}` : ''}` : undefined}>
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
          Promedio/mes: solo cuenta los meses en que la empresa usó la IA. Pasa el mouse por una celda para ver cuántos borradores fueron de Preguntas y cuántos de Mensajes (y lo que costaron las fichas).
        </p>
      </section>

      {datos && <DetalleMes datos={datos} />}

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

/** Detalle del mes en curso, por empresa: cupo usado, módulo × modelo (usos, tokens, costo),
 *  quién lo usó y cuánto por día, con la proyección al cierre del mes. Para evaluar y ajustar. */
function DetalleMes({ datos }: { datos: Datos }) {
  const [abierta, setAbierta] = useState<number | null>(null)
  const ids = [...new Set(datos.detalle.map(d => d.empresa_id))]
  const costoDe = (id: number) => datos.detalle.filter(d => d.empresa_id === id).reduce((a, d) => a + d.costo, 0)
  const metas = ids
    .map(id => datos.empresas.find(e => e.id === id) ?? { id, nombre: `Empresa ${id}`, propietario: false, limite: null })
    .sort((a, b) => costoDe(b.id) - costoDe(a.id))
  const total = datos.detalle.reduce((a, d) => a + d.costo, 0)
  const proyeccion = (c: number) => (datos.diaHoy ? (c / datos.diaHoy) * datos.diasMes : c)

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Detalle de este mes</h2>
        <p className="text-sm text-neutral-500">
          En qué se fue cada centavo: módulo, modelo, tokens, quién y qué día. Total de la plataforma:{' '}
          <b className="text-neutral-800">{usd(total)}</b> · al ritmo actual cerraría el mes en{' '}
          <b className="text-neutral-800">{usd(proyeccion(total))}</b>.
        </p>
      </div>
      {metas.length === 0 ? (
        <p className="text-sm text-neutral-400 py-6 text-center bg-white rounded-xl border border-neutral-200">Este mes nadie usó la IA todavía.</p>
      ) : metas.map(e => {
        const filas = datos.detalle.filter(d => d.empresa_id === e.id)
        const costo = filas.reduce((a, d) => a + d.costo, 0)
        const deBoton = filas.filter(d => d.modulo !== 'fichas')
        const borradores = deBoton.reduce((a, d) => a + d.usos, 0)
        const creditos = deBoton.reduce((a, d) => a + d.usos + d.busquedas, 0)   // igual que cupoIA
        const entrada = filas.reduce((a, d) => a + d.entrada, 0)
        const salida = filas.reduce((a, d) => a + d.salida, 0)
        const agrupar = (clave: (d: Detalle) => string) => {
          const m = new Map<string, { usos: number; entrada: number; salida: number; costo: number }>()
          for (const d of filas) {
            const g = m.get(clave(d)) ?? { usos: 0, entrada: 0, salida: 0, costo: 0 }
            g.usos += d.usos; g.entrada += d.entrada; g.salida += d.salida; g.costo += d.costo
            m.set(clave(d), g)
          }
          return [...m.entries()].sort((a, b) => b[1].costo - a[1].costo)
        }
        const porModelo = agrupar(d => `${MODULO_TXT[d.modulo] ?? d.modulo}|${modeloTxt(d.modelo)}`)
        const porUsuario = agrupar(d => (d.modulo === 'fichas' ? 'Sistema (fichas)' : d.usuario))
        const porDia = agrupar(d => d.dia).sort((a, b) => a[0].localeCompare(b[0]))
        const maxDia = Math.max(...porDia.map(([, g]) => g.costo), 0.0001)
        const cupo = e.propietario ? null : e.limite
        const abierto = abierta === e.id
        return (
          <div key={e.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm">
            <button onClick={() => setAbierta(abierto ? null : e.id)}
              className="w-full px-4 py-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-left hover:bg-neutral-50 rounded-xl">
              <span className="font-semibold text-neutral-900">{e.nombre}</span>
              <span className="text-sm text-neutral-600">
                Créditos: <b className="num">{creditos}</b>
                {cupo != null ? (
                  <> de <span className="num">{cupo}</span>
                    <span className={`ml-1 text-xs ${creditos >= cupo * 0.9 ? 'text-amber-700' : 'text-neutral-400'}`}>
                      ({Math.round((creditos / Math.max(1, cupo)) * 100)}%)
                    </span>
                  </>
                ) : <span className="text-xs text-neutral-400"> · sin límite</span>}
                <span className="text-xs text-neutral-400"> · {borradores} borradores</span>
              </span>
              <span className="text-sm text-neutral-600">
                Costo: <b className="num text-neutral-900">{usd(costo)}</b>
                <span className="text-xs text-neutral-400"> → {usd(proyeccion(costo))} al cierre</span>
              </span>
              <span className="text-sm text-neutral-600">
                Tokens: <span className="num">{tok(entrada)}</span> leídos · <span className="num">{tok(salida)}</span> escritos
              </span>
              <span className="ml-auto text-xs text-neutral-400">{abierto ? 'Ocultar' : 'Ver detalle'}</span>
            </button>
            {abierto && (
              <div className="border-t border-neutral-100 p-4 grid gap-5 lg:grid-cols-2">
                <div className="lg:col-span-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200">
                        <th className="py-2 pr-3 font-medium">Módulo</th>
                        <th className="py-2 pr-3 font-medium">Modelo</th>
                        <th className="py-2 px-3 font-medium text-right">Usos</th>
                        <th className="py-2 px-3 font-medium text-right">Tokens leídos</th>
                        <th className="py-2 px-3 font-medium text-right">Tokens escritos</th>
                        <th className="py-2 px-3 font-medium text-right">Costo</th>
                        <th className="py-2 pl-3 font-medium text-right">Por uso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porModelo.map(([k, g]) => {
                        const [mod, modelo] = k.split('|')
                        return (
                          <tr key={k} className="border-b border-neutral-100 last:border-0">
                            <td className="py-2 pr-3 text-neutral-800">{mod}</td>
                            <td className="py-2 pr-3 text-neutral-600">{modelo}</td>
                            <td className="py-2 px-3 text-right num">{g.usos}</td>
                            <td className="py-2 px-3 text-right num">{tok(g.entrada)}</td>
                            <td className="py-2 px-3 text-right num">{tok(g.salida)}</td>
                            <td className="py-2 px-3 text-right num">{usd(g.costo)}</td>
                            <td className="py-2 pl-3 text-right num text-neutral-600">{usd(g.costo / Math.max(1, g.usos))}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Quién lo usó</h3>
                  <ul className="text-sm divide-y divide-neutral-100">
                    {porUsuario.map(([u, g]) => (
                      <li key={u} className="py-1.5 flex justify-between gap-3">
                        <span className="text-neutral-700 truncate">{u}</span>
                        <span className="num text-neutral-600 whitespace-nowrap">{g.usos} usos · {usd(g.costo)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Por día</h3>
                  <ul className="text-xs space-y-1">
                    {porDia.map(([d, g]) => (
                      <li key={d} className="flex items-center gap-2" title={`${g.usos} usos · ${tok(g.entrada)} tokens leídos`}>
                        <span className="w-12 text-neutral-500 num">{d.slice(8, 10)}/{d.slice(5, 7)}</span>
                        <span className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                          <span className="block h-full bg-lime-500 rounded-full" style={{ width: `${Math.max(2, (g.costo / maxDia) * 100)}%` }} />
                        </span>
                        <span className="w-16 text-right num text-neutral-700">{usd(g.costo)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <p className="text-xs text-neutral-400">
        Créditos = lo que ve el cliente: 1 por cada «Proponer con IA» (se use o no la respuesta) + 1 por cada búsqueda en internet.
        Haiku = preguntas simples (~$0,004); Sonnet = difíciles (~$0,03); «lote» = fichas a mitad de precio.
        Al cierre = lo gastado hasta hoy llevado a todo el mes.
      </p>
    </section>
  )
}
