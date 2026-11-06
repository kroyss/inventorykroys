'use client'
import { useEffect, useState } from 'react'
import type { MiIA as Config, Agencia } from '@/lib/miIA'

// Mi IA (06-11, lib/miIA.ts): cuestionario paso a paso (una pantalla por tema) + página con una tarjeta por tema.
// La misma en Preguntas → Configuración, en Mensajes y en el menú de usuario (/mi-ia). Guarda en cada "Siguiente".

type Paso = { id: string; titulo: string; tema: string; lleno: (c: Config) => boolean }
const PASOS: Paso[] = [
  { id: 'tono', tema: 'Tono', titulo: '¿Cómo le hablas al comprador?', lleno: c => !!(c.tono?.saludo || c.tono?.despedida) },
  { id: 'oferta', tema: 'Oferta fija', titulo: '¿Hay algo que siempre quieras mencionar?', lleno: c => c.oferta !== undefined },
  { id: 'pago', tema: 'Pago', titulo: '¿Cómo te pagan?', lleno: c => !!c.pago?.medios?.length },
  { id: 'envio', tema: 'Envío', titulo: '¿Por dónde envías?', lleno: c => !!c.envio?.agencias?.length },
  { id: 'despacho', tema: 'Despacho', titulo: '¿Cuándo despachas?', lleno: c => !!c.despacho?.dias },
  { id: 'ubicacion', tema: 'Ubicación y retiro', titulo: '¿Dónde estás y se puede retirar?', lleno: c => !!(c.ubicacion?.zona || c.ubicacion?.retiro) },
  { id: 'factura', tema: 'Factura y garantía', titulo: 'Factura y garantía', lleno: c => !!(c.factura?.tipo || c.factura?.garantiaDias) },
  { id: 'desconocido', tema: 'Si no sabe algo', titulo: 'Si la IA no sabe un dato técnico, ¿qué hace?', lleno: c => !!c.desconocido?.length },
  { id: 'persona', tema: 'Siempre una persona', titulo: '¿Qué temas responde siempre una persona?', lleno: c => !!c.persona?.length },
  { id: 'postventa', tema: 'Después de la compra', titulo: 'Después de la compra (Mensajes)', lleno: c => !!(c.postventa?.pasos?.length || c.postventa?.datosPago) },
]

const MEDIOS = ['Pago móvil', 'Transferencia', 'Efectivo en divisas', 'Zelle', 'Binance', 'Banesco Panamá']
const AGENCIAS = ['ZOOM', 'TEALCA', 'MRW', 'Domesa', 'Liberty Express', 'Delivery propio']
const PERSONA = ['Reclamos', 'Ventas al mayor', 'Cambios y devoluciones', 'Pagos con problemas', 'Factura a nombre de empresa', 'Pedidos de otros productos']
const PASOS_PV = ['Llenar el formulario de MercadoLibre', 'Mandar el comprobante de pago por el chat', 'Confirmar el color o la talla']
const DESC = { verificar: 'Decir "lo verificamos y te confirmamos"', preguntar: 'Preguntar el modelo o para qué lo necesita', recomendar: 'Recomendar otra publicación tuya que sí lo cumpla', persona: 'Dejarla para una persona' } as const
type Desc = keyof typeof DESC

const contacto = (s?: string) => !!s && (/\d[\d\s.-]{8,}\d/.test(s) || /@|https?:|www\.|\.com\b|wa\.me|whats?app|instagram|telegram/i.test(s))
const lleno = (c: Config) => PASOS.filter(p => p.lleno(c)).length

// ── piezas ───────────────────────────────────────────────────────────────────
function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${activo ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-300 text-neutral-700 hover:border-neutral-400'}`}>{children}</button>
}
function Opciones({ valor, opciones, onChange, otro = true, placeholder }: { valor?: string; opciones: string[]; onChange: (v: string) => void; otro?: boolean; placeholder?: string }) {
  const esOtro = !!valor && !opciones.includes(valor)
  const [abierto, setAbierto] = useState(esOtro)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {opciones.map(o => <Chip key={o} activo={valor === o && !abierto} onClick={() => { setAbierto(false); onChange(o) }}>{o}</Chip>)}
        {otro && <Chip activo={abierto} onClick={() => { setAbierto(true); if (!esOtro) onChange('') }}>Otro</Chip>}
      </div>
      {abierto && <input autoFocus value={valor ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />}
    </div>
  )
}
function Varios({ valor = [], opciones, onChange, otroPlaceholder }: { valor?: string[]; opciones: string[]; onChange: (v: string[]) => void; otroPlaceholder?: string }) {
  const [nuevo, setNuevo] = useState('')
  const extra = valor.filter(v => !opciones.includes(v))
  const alternar = (o: string) => onChange(valor.includes(o) ? valor.filter(x => x !== o) : [...valor, o])
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {[...opciones, ...extra].map(o => <Chip key={o} activo={valor.includes(o)} onClick={() => alternar(o)}>{o}</Chip>)}
      </div>
      {otroPlaceholder && (
        <div className="flex gap-2">
          <input value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder={otroPlaceholder}
            onKeyDown={e => { if (e.key === 'Enter' && nuevo.trim()) { onChange([...valor, nuevo.trim()]); setNuevo('') } }}
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
          <button type="button" onClick={() => { if (nuevo.trim()) { onChange([...valor, nuevo.trim()]); setNuevo('') } }}
            className="px-3 rounded-lg border border-neutral-300 text-sm">Agregar</button>
        </div>
      )}
    </div>
  )
}
const Pregunta = ({ t, ayuda, children }: { t: string; ayuda?: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <p className="text-sm font-medium text-neutral-800">{t}</p>
    {ayuda && <p className="text-xs text-neutral-500 -mt-1">{ayuda}</p>}
    {children}
  </div>
)
const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : null }

// ── cada pantalla ────────────────────────────────────────────────────────────
function Pantalla({ id, c, set, pais }: { id: string; c: Config; set: (f: (c: Config) => Config) => void; pais: string }) {
  switch (id) {
    case 'tono': return <>
      <Pregunta t="¿Cómo saludas?"><Opciones valor={c.tono?.saludo} opciones={['Buenas,', '¡Hola!', 'Buen día,']} placeholder="Tu saludo" onChange={v => set(c => ({ ...c, tono: { ...c.tono, saludo: v } }))} /></Pregunta>
      <Pregunta t="¿Cómo te despides?"><Opciones valor={c.tono?.despedida} opciones={['quedo a su orden', 'a la orden', 'saludos']} placeholder="Tu despedida" onChange={v => set(c => ({ ...c, tono: { ...c.tono, despedida: v } }))} /></Pregunta>
      <Pregunta t="¿Tuteas o hablas de usted?"><div className="flex gap-2">
        <Chip activo={c.tono?.trato === 'tu'} onClick={() => set(c => ({ ...c, tono: { ...c.tono, trato: 'tu' } }))}>Tuteo</Chip>
        <Chip activo={c.tono?.trato === 'usted'} onClick={() => set(c => ({ ...c, tono: { ...c.tono, trato: 'usted' } }))}>De usted</Chip>
      </div></Pregunta>
    </>
    case 'oferta': return <>
      <Pregunta t="Algo que quieras decir siempre" ayuda="Por ejemplo: 20% de descuento pagando en divisas. Déjalo vacío si no hay nada.">
        <textarea rows={2} value={c.oferta?.texto ?? ''} onChange={e => set(c => ({ ...c, oferta: { ...c.oferta, texto: e.target.value } }))}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        {contacto(c.oferta?.texto) && <p className="text-xs text-red-700">Tiene un teléfono, correo o link: MercadoLibre borra o sanciona esas respuestas. Quítalo.</p>}
      </Pregunta>
      {!!c.oferta?.texto?.trim() && <Pregunta t="¿Cuándo lo menciona?"><div className="flex flex-wrap gap-2">
        {([['siempre', 'En todas las respuestas'], ['primera', 'Solo en la primera'], ['precio', 'Solo si preguntan precio o pago']] as const).map(([k, t]) =>
          <Chip key={k} activo={(c.oferta?.cuando ?? 'siempre') === k} onClick={() => set(c => ({ ...c, oferta: { ...c.oferta, cuando: k } }))}>{t}</Chip>)}
      </div></Pregunta>}
    </>
    case 'pago': return <>
      {pais === 'VE' && <Pregunta t="¿A qué tasa cobras?"><Opciones valor={c.pago?.tasa} opciones={['tasa BCV del día']} placeholder="Ej.: tasa BCV del momento del pago" onChange={v => set(c => ({ ...c, pago: { ...c.pago, tasa: v } }))} /></Pregunta>}
      <Pregunta t="¿Qué medios de pago aceptas?" ayuda="Marca todos los que uses.">
        <Varios valor={c.pago?.medios} opciones={pais === 'VE' ? MEDIOS : ['Nequi', 'Daviplata', 'Transferencia', 'PSE', 'Efectivo']} otroPlaceholder="Otro medio" onChange={v => set(c => ({ ...c, pago: { ...c.pago, medios: v } }))} />
      </Pregunta>
      {pais === 'VE' && <Pregunta t="¿Das descuento por pagar en divisas?">
        <div className="flex flex-wrap items-center gap-2">
          <Chip activo={!c.pago?.divisas} onClick={() => set(c => ({ ...c, pago: { ...c.pago, divisas: null } }))}>No</Chip>
          <Chip activo={!!c.pago?.divisas} onClick={() => set(c => ({ ...c, pago: { ...c.pago, divisas: c.pago?.divisas ?? { pct: 10 } } }))}>Sí</Chip>
          {c.pago?.divisas && <label className="text-sm text-neutral-700 flex items-center gap-1">de
            <input inputMode="decimal" value={c.pago.divisas.pct} onChange={e => set(c => ({ ...c, pago: { ...c.pago, divisas: { ...c.pago!.divisas!, pct: num(e.target.value) ?? 0 } } }))}
              className="w-16 rounded-lg border border-neutral-300 px-2 py-1 text-sm" />%</label>}
        </div>
      </Pregunta>}
    </>
    case 'envio': {
      const ags = c.envio?.agencias ?? []
      const setAg = (a: Agencia[]) => set(c => ({ ...c, envio: { ...c.envio, agencias: a } }))
      return <>
        <Pregunta t="¿Qué agencias usas?" ayuda="Marca cada una y elige si es gratis o cobro a destino.">
          <div className="space-y-1.5">
            {[...AGENCIAS, ...ags.map(a => a.nombre).filter(n => !AGENCIAS.includes(n))].map(n => {
              const a = ags.find(x => x.nombre === n)
              return (
                <div key={n} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${a ? 'border-neutral-900' : 'border-neutral-200'}`}>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!a}
                    onChange={() => setAg(a ? ags.filter(x => x.nombre !== n) : [...ags, { nombre: n, gratis: true }])} />{n}</label>
                  {a && <select value={a.gratis ? 'g' : 'd'} onChange={e => setAg(ags.map(x => x.nombre === n ? { ...x, gratis: e.target.value === 'g' } : x))}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs"><option value="g">Gratis</option><option value="d">Cobro a destino</option></select>}
                </div>
              )
            })}
          </div>
        </Pregunta>
        <Pregunta t="¿Hay un mínimo de unidades en productos baratos?">
          <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
            <Chip activo={!c.envio?.minimo} onClick={() => set(c => ({ ...c, envio: { ...c.envio, minimo: null } }))}>No</Chip>
            <Chip activo={!!c.envio?.minimo} onClick={() => set(c => ({ ...c, envio: { ...c.envio, minimo: c.envio?.minimo ?? { precioMenor: 3, unidades: 2 } } }))}>Sí</Chip>
            {c.envio?.minimo && <>menos de $<input inputMode="decimal" value={c.envio.minimo.precioMenor} onChange={e => set(c => ({ ...c, envio: { ...c.envio, minimo: { ...c.envio!.minimo!, precioMenor: num(e.target.value) ?? 0 } } }))}
              className="w-16 rounded-lg border border-neutral-300 px-2 py-1" /> → mínimo <input inputMode="numeric" value={c.envio.minimo.unidades} onChange={e => set(c => ({ ...c, envio: { ...c.envio, minimo: { ...c.envio!.minimo!, unidades: Math.round(num(e.target.value) ?? 2) } } }))}
              className="w-14 rounded-lg border border-neutral-300 px-2 py-1" /> unidades</>}
          </div>
        </Pregunta>
      </>
    }
    case 'despacho': return <>
      <Pregunta t="¿Qué días despachas?"><Opciones valor={c.despacho?.dias} opciones={['de lunes a viernes', 'de lunes a sábado']} placeholder="Ej.: martes y jueves" onChange={v => set(c => ({ ...c, despacho: { ...c.despacho, dias: v } }))} /></Pregunta>
      <Pregunta t="¿Despachas el mismo día?">
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
          <Chip activo={!c.despacho?.corte} onClick={() => set(c => ({ ...c, despacho: { ...c.despacho, corte: null } }))}>No</Chip>
          <Chip activo={!!c.despacho?.corte} onClick={() => set(c => ({ ...c, despacho: { ...c.despacho, corte: c.despacho?.corte ?? '13:00' } }))}>Sí</Chip>
          {c.despacho?.corte && <>si paga y llena el formulario antes de las <input type="time" value={c.despacho.corte} onChange={e => set(c => ({ ...c, despacho: { ...c.despacho, corte: e.target.value || null } }))}
            className="rounded-lg border border-neutral-300 px-2 py-1" /></>}
        </div>
      </Pregunta>
    </>
    case 'ubicacion': return <>
      <Pregunta t="¿En qué ciudad y zona estás?" ayuda="Sin dirección exacta: MercadoLibre no lo permite.">
        <input value={c.ubicacion?.zona ?? ''} onChange={e => set(c => ({ ...c, ubicacion: { ...c.ubicacion, zona: e.target.value } }))} placeholder="Ej.: Mérida, Las Lomas"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <Chip activo={c.ubicacion?.decir !== false} onClick={() => set(c => ({ ...c, ubicacion: { ...c.ubicacion, decir: true } }))}>Se puede decir</Chip>
          <Chip activo={c.ubicacion?.decir === false} onClick={() => set(c => ({ ...c, ubicacion: { ...c.ubicacion, decir: false } }))}>Mejor no decirlo</Chip>
        </div>
      </Pregunta>
      <Pregunta t="¿Se puede retirar en persona?">
        <div className="flex flex-wrap gap-2">
          {([['no', 'No, solo envíos'], ['acuerdo', 'Sí, previo acuerdo'], ['horario', 'Sí, en un horario']] as const).map(([k, t]) =>
            <Chip key={k} activo={c.ubicacion?.retiro === k} onClick={() => set(c => ({ ...c, ubicacion: { ...c.ubicacion, retiro: k } }))}>{t}</Chip>)}
        </div>
        {c.ubicacion?.retiro === 'horario' && <input value={c.ubicacion.retiroHorario ?? ''} onChange={e => set(c => ({ ...c, ubicacion: { ...c.ubicacion, retiroHorario: e.target.value } }))}
          placeholder="Ej.: lunes a viernes de 9 a 4" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />}
      </Pregunta>
    </>
    case 'factura': return <>
      <Pregunta t="¿Das factura?"><div className="flex flex-wrap gap-2">
        {([['fiscal', 'Factura fiscal'], ['nota', 'Nota de entrega'], ['no', 'No']] as const).map(([k, t]) =>
          <Chip key={k} activo={c.factura?.tipo === k} onClick={() => set(c => ({ ...c, factura: { ...c.factura, tipo: k } }))}>{t}</Chip>)}
      </div></Pregunta>
      <Pregunta t="¿Cuántos días de garantía das?">
        <div className="flex items-center gap-2 text-sm text-neutral-700">
          <input inputMode="numeric" value={c.factura?.garantiaDias ?? ''} onChange={e => set(c => ({ ...c, factura: { ...c.factura, garantiaDias: e.target.value ? Math.round(num(e.target.value) ?? 0) : null } }))}
            className="w-20 rounded-lg border border-neutral-300 px-2 py-1" /> días
        </div>
        <input value={c.factura?.garantiaNoCubre ?? ''} onChange={e => set(c => ({ ...c, factura: { ...c.factura, garantiaNoCubre: e.target.value } }))}
          placeholder="¿Qué no cubre? Ej.: mal uso ni gastos de devolución" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
      </Pregunta>
    </>
    case 'desconocido': {
      const orden = c.desconocido ?? []
      return <Pregunta t="Toca las opciones en tu orden de preferencia" ayuda="La IA usa la primera que aplique. Nunca inventa el dato.">
        <div className="space-y-1.5">
          {(Object.keys(DESC) as Desc[]).map(k => {
            const i = orden.indexOf(k)
            return <button key={k} type="button" onClick={() => set(c => ({ ...c, desconocido: i >= 0 ? orden.filter(x => x !== k) : [...orden, k] }))}
              className={`w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${i >= 0 ? 'border-neutral-900' : 'border-neutral-200'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${i >= 0 ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-400'}`}>{i >= 0 ? i + 1 : ''}</span>{DESC[k]}
            </button>
          })}
        </div>
      </Pregunta>
    }
    case 'persona': return <Pregunta t="Marca los temas" ayuda="Esas preguntas y mensajes nunca salen solos: van a revisión.">
      <Varios valor={c.persona} opciones={PERSONA} otroPlaceholder="Otro tema" onChange={v => set(c => ({ ...c, persona: v }))} />
    </Pregunta>
    case 'postventa': return <>
      <Pregunta t="Después de comprar, ¿qué tiene que hacer el comprador?">
        <Varios valor={c.postventa?.pasos} opciones={PASOS_PV} otroPlaceholder="Otro paso" onChange={v => set(c => ({ ...c, postventa: { ...c.postventa, pasos: v } }))} />
      </Pregunta>
      <Pregunta t="Datos para pagar (si los das por el chat)" ayuda="La IA los copia exactos, sin cambiar nada. Déjalo vacío si el pago va por otro lado.">
        <textarea rows={2} value={c.postventa?.datosPago ?? ''} onChange={e => set(c => ({ ...c, postventa: { ...c.postventa, datosPago: e.target.value } }))}
          placeholder="Ej.: Pago móvil: banco, cédula, teléfono" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
      </Pregunta>
    </>
  }
  return null
}

// ── componente ───────────────────────────────────────────────────────────────
export default function MiIA() {
  const [datos, setDatos] = useState<{ miIA: Config | null; pais: string; texto: { preguntas: string; mensajes: string } | null } | null>(null)
  const [c, setC] = useState<Config>({ version: 1 })
  const [paso, setPaso] = useState<number | null>(null)     // null = página; n = pantalla del cuestionario
  const [unaSola, setUnaSola] = useState(false)              // editando una tarjeta (vuelve a la página al guardar)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [verTexto, setVerTexto] = useState(false)

  const cargar = async () => {
    const r = await fetch('/api/mi-ia'); const d = await r.json()
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
    setDatos(d); if (d.miIA) setC(d.miIA)
  }
  useEffect(() => { cargar() }, [])

  const guardar = async () => {
    setGuardando(true); setError(null)
    const r = await fetch('/api/mi-ia', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) })
    const d = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo guardar'); return false }
    return true
  }
  const siguiente = async () => {
    if (!(await guardar())) return
    if (unaSola || paso === PASOS.length - 1) { setPaso(null); setUnaSola(false); cargar() } else setPaso(p => (p ?? 0) + 1)
  }

  if (error && !datos) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
  if (!datos) return <p className="text-sm text-neutral-500">Cargando…</p>

  const aviso = <p className="text-xs text-neutral-500">Esto lo usa la IA en <b>Preguntas</b> y en <b>Mensajes</b>.</p>

  // Cuestionario
  if (paso !== null) {
    const p = PASOS[paso]
    return (
      <div className="max-w-xl rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
        {!unaSola && <div className="h-1 rounded bg-neutral-100"><div className="h-1 rounded bg-neutral-900" style={{ width: `${((paso + 1) / PASOS.length) * 100}%` }} /></div>}
        <div>
          <p className="text-xs text-neutral-500">{p.tema}{unaSola ? '' : ` · ${paso + 1} de ${PASOS.length}`}</p>
          <h2 className="text-lg font-semibold text-neutral-900">{p.titulo}</h2>
        </div>
        <Pantalla id={p.id} c={c} set={f => setC(f)} pais={datos.pais} />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex gap-2">
            {!unaSola && paso > 0 && <button type="button" onClick={() => setPaso(paso - 1)} className="px-3 py-2 rounded-lg border border-neutral-300 text-sm">Atrás</button>}
            <button type="button" onClick={() => { if (unaSola) { setPaso(null); setUnaSola(false); if (datos.miIA) setC(datos.miIA) } else setPaso(paso === PASOS.length - 1 ? null : paso + 1) }}
              className="px-3 py-2 rounded-lg text-sm text-neutral-500 hover:text-neutral-800">{unaSola ? 'Cancelar' : 'Saltar'}</button>
          </div>
          <button type="button" onClick={siguiente} disabled={guardando}
            className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm disabled:opacity-50">
            {guardando ? 'Guardando…' : unaSola ? 'Guardar' : paso === PASOS.length - 1 ? 'Terminar' : 'Siguiente →'}</button>
        </div>
      </div>
    )
  }

  // Primera vez
  if (!datos.miIA) return (
    <div className="max-w-xl rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-3">
      <h2 className="text-lg font-semibold text-neutral-900">Configura tu IA</h2>
      <p className="text-sm text-neutral-600">Unos 4 minutos: {PASOS.length} pantallas cortas sobre cómo trabajas (envío, pago, tono, límites). Con eso la IA responde como tú en Preguntas y en Mensajes.</p>
      <p className="text-xs text-neutral-500">Tus “Políticas para la IA” de texto siguen valiendo. Lo que contestes aquí manda si algo choca.</p>
      <button type="button" onClick={() => setPaso(0)} className="w-full px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm">Empezar</button>
    </div>
  )

  // Página Mi IA
  const n = lleno(c)
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div><h2 className="text-lg font-semibold text-neutral-900">Mi IA</h2>{aviso}</div>
        <span className={`text-xs px-2 py-1 rounded-full ${n === PASOS.length ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
          {Math.round((n / PASOS.length) * 100)}% completa</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {PASOS.map((p, i) => {
          const ok = p.lleno(c)
          return <button key={p.id} type="button" onClick={() => { setUnaSola(true); setPaso(i) }}
            className={`text-left rounded-xl border px-4 py-3 hover:border-neutral-400 ${ok ? 'border-neutral-200 bg-white' : 'border-dashed border-neutral-300 bg-neutral-50'}`}>
            <p className="text-sm font-medium text-neutral-900">{p.tema}</p>
            <p className="text-xs text-neutral-500">{ok ? 'Toca para revisar o cambiar' : 'Falta: toca para completarlo'}</p>
          </button>
        })}
      </div>
      <button type="button" onClick={() => setVerTexto(v => !v)} className="text-sm text-sky-700">{verTexto ? 'Ocultar' : 'Ver'} cómo lo lee la IA</button>
      {verTexto && datos.texto && <pre className="whitespace-pre-wrap rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-700">{datos.texto.mensajes}</pre>}
    </div>
  )
}
