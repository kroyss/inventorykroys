'use client'
import { useEffect, useState } from 'react'
import { FUNCIONES_INTERNAS } from '@/lib/funcionesInternas'
import { MODULOS } from '@/lib/modulos'
import AvisosTelegramCard from './AvisosTelegramCard'

interface Detalle {
  empresa_id: number; dia: string; modulo: string; modelo: string; usuario: string
  usos: number; entrada: number; salida: number; busquedas: number; costo: number
}
interface EmpresaMeta { id: number; nombre: string; propietario: boolean; limite: number | null; creditos?: number | null }
interface Datos { desde: string; dias: number; detalle: Detalle[]; empresas: EmpresaMeta[] }

const MODULO_TXT: Record<string, string> = { preguntas: 'Preguntas', mensajes: 'Mensajes', fichas: 'Lectura de publicaciones y fotos', revisor: 'Revisor de sugeridas', simulacion: 'Configuración y pruebas (Mi IA)' }
const modeloTxt = (m: string) => m
  .replace(/claude-haiku-[\w.-]+/g, 'Haiku').replace(/claude-sonnet-[\w.-]+/g, 'Sonnet').replace(/claude-opus-[\w.-]+/g, 'Opus')
const tok = (n: number) => n >= 1e6 ? `${(n / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 })} M` : n >= 1e3 ? `${Math.round(n / 1e3).toLocaleString('de-DE')} mil` : String(n)

// Montos chicos (centavos de dólar) con más decimales: si no, $0,0026 se vería como $0,00.
const usd = (n: number) => `$${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 0.995 ? 4 : 2 })}`
const usd4 = (n: number) => `$${n.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const ES_RESPUESTA = (m: string) => m === 'preguntas' || m === 'mensajes'

/** Lo de una empresa (o de todas) desde que se mide, separado por para qué fue. */
interface Cuenta { respuestas: number; creditos: number; costoResp: number; lectura: number; config: number; revisor: number; total: number }
function cuentaDe(filas: Detalle[]): Cuenta {
  const c: Cuenta = { respuestas: 0, creditos: 0, costoResp: 0, lectura: 0, config: 0, revisor: 0, total: 0 }
  for (const d of filas) {
    c.total += d.costo
    if (ES_RESPUESTA(d.modulo)) { c.respuestas += d.usos; c.creditos += d.usos + d.busquedas; c.costoResp += d.costo }
    else if (d.modulo === 'fichas') c.lectura += d.costo
    else if (d.modulo === 'simulacion') c.config += d.costo
    else c.revisor += d.costo
  }
  return c
}

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

  // 12-11 (el dueño): se mide desde que salió Mi IA (lo de antes eran otros modelos y otro diseño). Todo lo que gasta
  // cada cuenta cuenta: respuestas, lectura de publicaciones y fotos, configuración/pruebas de Mi IA y revisor.
  const detalle = datos?.detalle ?? []
  const filas = [...new Set(detalle.map(d => d.empresa_id))].map(id => {
    const meta = datos!.empresas.find(e => e.id === id)
    return { id, nombre: meta?.nombre ?? `Empresa ${id}`, propietario: !!meta?.propietario, c: cuentaDe(detalle.filter(d => d.empresa_id === id)) }
  }).sort((a, b) => b.c.total - a.c.total)
  const clientes = cuentaDe(detalle.filter(d => !datos?.empresas.find(e => e.id === d.empresa_id)?.propietario))
  const total = cuentaDe(detalle)
  const alMes = (n: number) => (datos?.dias ? (n / datos.dias) * 30 : n)

  return (
    <div className="space-y-8">
      <AvisosTelegramCard />
      {datos && filas.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Numero titulo={`Gasto de IA desde ${ddmm(datos.desde)}`} valor={usd(total.total)}
            detalle={`${datos.dias} días · a este ritmo ≈ ${usd(alMes(total.total))} al mes`} />
          <Numero titulo="Clientes: costo real por crédito" valor={clientes.creditos ? usd4(clientes.total / clientes.creditos) : '—'}
            detalle={clientes.creditos ? `todo lo que gastan ÷ ${clientes.creditos} créditos cobrados` : 'todavía no cobraron créditos'} />
          <Numero titulo="Clientes: costo por respuesta" valor={clientes.respuestas ? usd4(clientes.costoResp / clientes.respuestas) : '—'}
            detalle={`solo la respuesta · ${clientes.respuestas} respuestas`} />
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Consumo de IA por cuenta</h2>
          <p className="text-sm text-neutral-500">
            Desde que salió Mi IA ({datos ? ddmm(datos.desde) : '…'}). Todo lo que gasta cada cuenta, separado por para qué fue.
            <b className="text-neutral-700"> Costo real por crédito</b> = todo su gasto ÷ los créditos que se le cobraron: compáralo con lo que
            vale el crédito (≈ $0,007–0,008).
          </p>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
        {!datos ? !error && <p className="text-sm text-neutral-400">Cargando…</p> : filas.length === 0 ? (
          <p className="text-sm text-neutral-400 py-6 text-center bg-white rounded-xl border border-neutral-200">Todavía ninguna cuenta usó la IA.</p>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200">
                  <th className="px-4 py-2.5 font-medium">Cuenta</th>
                  <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap" title="Preguntas y mensajes con IA (borradores y automáticas)">Respuestas</th>
                  <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap" title="1 por respuesta + búsquedas en internet">Créditos</th>
                  <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">En respuestas</th>
                  <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap" title="Leer publicaciones y fotos (una vez, se reutiliza)">Lectura</th>
                  <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap" title="Prellenado, prueba con 10 reales y simulaciones de Mi IA">Config. Mi IA</th>
                  <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Revisor</th>
                  <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap border-l border-neutral-100">Total</th>
                  <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Por respuesta</th>
                  <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">Real por crédito</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ id, nombre, propietario, c }) => (
                  <tr key={id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-neutral-900 whitespace-nowrap">
                      {nombre}{propietario && <span className="block text-[11px] font-normal text-neutral-400">tu empresa · incluye pruebas internas</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right num">{c.respuestas}</td>
                    <td className="px-3 py-2.5 text-right num">{c.creditos}</td>
                    <td className="px-3 py-2.5 text-right num">{c.costoResp ? usd(c.costoResp) : '—'}</td>
                    <td className="px-3 py-2.5 text-right num text-neutral-600">{c.lectura ? usd(c.lectura) : '—'}</td>
                    <td className="px-3 py-2.5 text-right num text-neutral-600">{c.config ? usd(c.config) : '—'}</td>
                    <td className="px-3 py-2.5 text-right num text-neutral-600">{c.revisor ? usd(c.revisor) : '—'}</td>
                    <td className="px-3 py-2.5 text-right num font-medium text-neutral-900 border-l border-neutral-100">{usd(c.total)}</td>
                    <td className="px-3 py-2.5 text-right num text-neutral-600">{c.respuestas ? usd4(c.costoResp / c.respuestas) : '—'}</td>
                    <td className={`px-4 py-2.5 text-right num ${c.creditos && c.total / c.creditos > 0.007 ? 'font-medium text-amber-700' : 'text-neutral-600'}`}>
                      {c.creditos ? usd4(c.total / c.creditos) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-50 text-xs font-semibold text-neutral-700">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-3 py-2 text-right num">{total.respuestas}</td>
                  <td className="px-3 py-2 text-right num">{total.creditos}</td>
                  <td className="px-3 py-2 text-right num">{usd(total.costoResp)}</td>
                  <td className="px-3 py-2 text-right num">{usd(total.lectura)}</td>
                  <td className="px-3 py-2 text-right num">{usd(total.config)}</td>
                  <td className="px-3 py-2 text-right num">{usd(total.revisor)}</td>
                  <td className="px-3 py-2 text-right num border-l border-neutral-100">{usd(total.total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-xs text-neutral-400">
          En ámbar: la cuenta gasta más de $0,007 por crédito cobrado (al precio de las recargas perdería). La configuración de Mi IA
          se gasta una vez al armarla; al principio pesa mucho y se diluye con el uso.
        </p>
      </section>

      {datos && <DetalleMes datos={datos} />}

      {/* Referencia: no cambia día a día, queda plegada */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-neutral-600 hover:text-neutral-900 select-none">
          Referencia: lo que solo ves tú y lo que se activa por cliente
        </summary>
        <div className="mt-4 space-y-8">
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
      </details>
    </div>
  )
}

/** Detalle desde que se mide, por empresa: créditos, módulo × modelo (usos, tokens, costo),
 *  quién lo usó y cuánto por día. Para evaluar y ajustar. */
function DetalleMes({ datos }: { datos: Datos }) {
  const [abierta, setAbierta] = useState<number | null>(null)
  const ids = [...new Set(datos.detalle.map(d => d.empresa_id))]
  const costoDe = (id: number) => datos.detalle.filter(d => d.empresa_id === id).reduce((a, d) => a + d.costo, 0)
  const metas = ids
    .map(id => datos.empresas.find(e => e.id === id) ?? { id, nombre: `Empresa ${id}`, propietario: false, limite: null })
    .sort((a, b) => costoDe(b.id) - costoDe(a.id))
  const total = datos.detalle.reduce((a, d) => a + d.costo, 0)
  const alMes = (c: number) => (datos.dias ? (c / datos.dias) * 30 : c)

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Detalle por cuenta</h2>
        <p className="text-sm text-neutral-500">
          En qué se fue cada centavo desde el {ddmm(datos.desde)}: módulo, modelo, tokens, quién y qué día. Total:{' '}
          <b className="text-neutral-800">{usd(total)}</b> · a este ritmo ≈ <b className="text-neutral-800">{usd(alMes(total))}</b> al mes.
        </p>
      </div>
      {metas.length === 0 ? (
        <p className="text-sm text-neutral-400 py-6 text-center bg-white rounded-xl border border-neutral-200">Nadie usó la IA todavía.</p>
      ) : metas.map(e => {
        const filas = datos.detalle.filter(d => d.empresa_id === e.id)
        const costo = filas.reduce((a, d) => a + d.costo, 0)
        const deBoton = filas.filter(d => d.modulo !== 'fichas' && d.modulo !== 'revisor' && d.modulo !== 'simulacion')
        const borradores = deBoton.reduce((a, d) => a + d.usos, 0)
        // Los que ve el cliente (cupoIA en la API); si no llegaron, desde el detalle del mes.
        const creditos = e.creditos ?? deBoton.reduce((a, d) => a + d.usos + d.busquedas, 0)
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
        const porUsuario = agrupar(d => (d.modulo === 'fichas' ? 'Sistema (fichas)' : d.modulo === 'revisor' ? 'Sistema (revisor)' : d.modulo === 'simulacion' ? 'Sistema (configuración y pruebas)' : d.usuario))
        const porDia = agrupar(d => d.dia).sort((a, b) => a[0].localeCompare(b[0]))
        const maxDia = Math.max(...porDia.map(([, g]) => g.costo), 0.0001)
        const cupo = e.limite
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
                <span className="text-xs text-neutral-400"> · ≈ {usd(alMes(costo))} al mes</span>
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
        Todo va con Haiku; «lote» = fichas a mitad de precio. «Al mes» = lo gastado por día llevado a 30 días.
      </p>
    </section>
  )
}

function Numero({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm px-4 py-3 min-w-0">
      <div className="text-xs text-neutral-500">{titulo}</div>
      <div className="text-xl font-semibold text-neutral-900 num truncate">{valor}</div>
      <div className="text-xs text-neutral-400 truncate">{detalle}</div>
    </div>
  )
}
