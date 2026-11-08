'use client'
import { useEffect, useState } from 'react'
import type { MiIA as Config, Agencia, MotivoCambio } from '@/lib/miIA'
import { MOTIVOS_CAMBIO, motivosCambio } from '@/lib/miIA'

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
  { id: 'cambios', tema: 'Cambios y devoluciones', titulo: '¿Aceptas cambios o devoluciones?', lleno: c => !!c.cambios?.acepta },
  { id: 'negocio', tema: 'Al mayor, rebajas y apartados', titulo: 'Al mayor, rebajas y apartados', lleno: c => !!(c.negocio?.mayor || c.negocio?.regateo || c.negocio?.apartar) },
  { id: 'atencion', tema: 'Horario de atención', titulo: '¿En qué horario atienden?', lleno: c => !!c.atencion?.horario?.trim() },
  { id: 'desconocido', tema: 'Si no sabe algo', titulo: 'Si la IA no sabe un dato técnico, ¿qué hace?', lleno: c => !!c.desconocido?.length },
  { id: 'persona', tema: 'Siempre una persona', titulo: '¿Qué temas responde siempre una persona?', lleno: c => !!c.persona?.length },
  { id: 'extras', tema: 'Información extra', titulo: 'Información extra (opcional)', lleno: c => !!(c.extrasNoAplica || c.extras?.length) },
  { id: 'postventa', tema: 'Después de la compra', titulo: 'Después de la compra (Mensajes)', lleno: c => !!(c.postventa?.noAplica || c.postventa?.pasos?.length || c.postventa?.datosPago) },
]

/** Lo guardado en una línea (la tarjeta lo muestra para verificar sin entrar). */
const lista = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`
const corto = (s: string, n = 60) => s.length > n ? s.slice(0, n - 1) + '…' : s
function resumen(id: string, c: Config): string {
  switch (id) {
    case 'tono': return [c.tono?.saludo && `«${c.tono.saludo}»`, c.tono?.despedida && `«${c.tono.despedida}»`, c.tono?.trato === 'usted' ? 'de usted' : c.tono?.trato === 'tu' ? 'tuteo' : ''].filter(Boolean).join(' · ')
    case 'oferta': return c.oferta?.texto?.trim() ? corto(c.oferta.texto.trim()) : c.oferta ? 'No tengo oferta fija' : ''
    case 'pago': return [c.pago?.tasa, c.pago?.medios?.length ? corto(lista(c.pago.medios), 70) : '', c.pago?.divisas ? `${c.pago.divisas.pct}% menos en divisas` : ''].filter(Boolean).join(' · ')
    case 'envio': {
      const ags = c.envio?.agencias ?? []
      const g = ags.filter(a => a.gratis).map(a => a.nombre), d = ags.filter(a => !a.gratis).map(a => a.nombre)
      return [g.length ? `${lista(g)} gratis` : '', d.length ? `${lista(d)} cobro a destino` : '',
        c.envio?.minimo ? `mínimo ${c.envio.minimo.unidades} u. bajo $${c.envio.minimo.precioMenor}` : ''].filter(Boolean).join(' · ')
    }
    case 'despacho': return [c.despacho?.dias, c.despacho?.corte ? `mismo día antes de las ${c.despacho.corte}` : ''].filter(Boolean).join(' · ')
    case 'ubicacion': return [c.ubicacion?.zona, c.ubicacion?.decir === false ? 'no decirlo' : '',
      c.ubicacion?.retiro === 'no' ? 'sin retiro' : c.ubicacion?.retiro === 'acuerdo' ? 'retiro previo acuerdo' : c.ubicacion?.retiro === 'horario' ? `retiro ${c.ubicacion.retiroHorario ?? ''}`.trim() : ''].filter(Boolean).join(' · ')
    case 'factura': return [c.factura?.tipo === 'fiscal' ? 'Factura fiscal' : c.factura?.tipo === 'nota' ? 'Nota de entrega' : c.factura?.tipo === 'no' ? 'Sin factura' : '',
      c.factura?.garantiaDias ? `${c.factura.garantiaDias} días de garantía${c.factura.garantiaNoCubre ? ` (no cubre ${corto(c.factura.garantiaNoCubre, 40)})` : ''}` : ''].filter(Boolean).join(' · ')
    case 'desconocido': return (c.desconocido ?? []).map((k, i) => `${i + 1}. ${{ verificar: 'lo verificamos', preguntar: 'preguntar', recomendar: 'recomendar otra', persona: 'una persona' }[k]}`).join(' · ')
    case 'persona': return corto(lista(c.persona ?? []), 90)
    case 'cambios': return [c.cambios?.acepta === 'si' ? 'Sí' : c.cambios?.acepta === 'falla' ? `Solo: ${motivosCambio(c.cambios).map(m => MOTIVOS_CAMBIO[m].texto.split(' (')[0].toLowerCase()).join(', ')}` : c.cambios?.acepta === 'no' ? 'No' : '',
      c.cambios?.dias ? `${c.cambios.dias} días` : '', c.cambios?.envio === 'comprador' ? 'envío lo paga el comprador' : c.cambios?.envio === 'nosotros' ? 'envío lo pagamos' : ''].filter(Boolean).join(' · ')
    case 'negocio': return [c.negocio?.mayor === 'escribir' ? `al mayor${c.negocio.mayorDesde ? ` desde ${c.negocio.mayorDesde} u.` : ''}: que pregunte` : c.negocio?.mayor === 'mismo' ? 'sin precio al mayor' : '',
      c.negocio?.regateo === 'fijo' ? 'precio fijo' : c.negocio?.regateo === 'consultar' ? 'rebaja: lo consultamos' : '',
      c.negocio?.apartar === 'no' ? 'no aparta' : c.negocio?.apartar === 'si' ? `aparta${c.negocio.apartarHoras ? ` ${c.negocio.apartarHoras} h` : ''}` : ''].filter(Boolean).join(' · ')
    case 'atencion': return corto(c.atencion?.horario?.trim() ?? '')
    case 'extras': return c.extrasNoAplica && !c.extras?.length ? 'No hace falta' : corto(lista((c.extras ?? []).map(x => x.siempre ? `${x.titulo} (siempre)` : x.titulo)), 90)
    case 'postventa': return c.postventa?.noAplica ? 'No hace falta nada' : [c.postventa?.pasos?.length ? corto(lista(c.postventa.pasos), 70) : '', c.postventa?.datosPago ? 'con datos de pago' : ''].filter(Boolean).join(' · ')
  }
  return ''
}

const MEDIOS = ['Pago móvil', 'Transferencia', 'Efectivo en divisas', 'Zelle', 'Binance', 'Banesco Panamá']
const AGENCIAS = ['MercadoEnvíos', 'ZOOM', 'TEALCA', 'MRW', 'Domesa', 'Liberty Express', 'PedidosYa', 'Yummy', 'Delivery propio']
const PERSONA = ['Reclamos', 'Ventas al mayor', 'Cambios y devoluciones', 'Pagos con problemas', 'Factura a nombre de empresa', 'Pedidos de otros productos']
const PASOS_PV = ['Llenar el formulario de MercadoLibre', 'Mandar el comprobante de pago por el chat', 'Confirmar el color o la talla']
const DESC = { verificar: 'Decir "lo verificamos y te confirmamos"', preguntar: 'Preguntar el modelo o para qué lo necesita', recomendar: 'Recomendar otra publicación tuya que sí lo cumpla', persona: 'Dejarla para una persona' } as const
type Desc = keyof typeof DESC

const contacto = (s?: string) => !!s && (/\d[\d\s.-]{8,}\d/.test(s) || /@|https?:|www\.|\.com\b|wa\.me|whats?app|instagram|telegram/i.test(s))
const lleno = (c: Config) => PASOS.filter(p => p.lleno(c)).length
const TODOS = PASOS.map((_, i) => i)

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
      <div className="flex gap-2">
        <Chip activo={!!c.oferta && !c.oferta.texto?.trim()} onClick={() => set(c => ({ ...c, oferta: { texto: '' } }))}>No tengo oferta fija</Chip>
      </div>
      <Pregunta t="Algo que quieras decir siempre" ayuda="Por ejemplo: 20% de descuento pagando en divisas.">
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
      </Pregunta>
      <Pregunta t="¿Qué NO cubre la garantía?" ayuda="Lo que la IA aclara si preguntan por la garantía. Déjalo vacío si no hay excepciones.">
        <input value={c.factura?.garantiaNoCubre ?? ''} onChange={e => set(c => ({ ...c, factura: { ...c.factura, garantiaNoCubre: e.target.value } }))}
          placeholder="Ej.: mal uso, golpes ni gastos de envío de la devolución" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
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
    case 'cambios': return <>
      <Pregunta t="¿Aceptas cambios o devoluciones?" ayuda="Lo que cubre MercadoLibre (compra protegida) vale igual.">
        <div className="flex flex-wrap gap-2">
          {([['si', 'Sí, por cualquier motivo'], ['falla', 'Solo en algunos casos'], ['no', 'No']] as const).map(([k, t]) =>
            <Chip key={k} activo={c.cambios?.acepta === k} onClick={() => set(c => ({ ...c, cambios: { ...c.cambios, acepta: k } }))}>{t}</Chip>)}
        </div>
      </Pregunta>
      {c.cambios?.acepta === 'falla' && <Pregunta t="¿En qué casos?" ayuda="Marca todos los que aceptas.">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MOTIVOS_CAMBIO) as MotivoCambio[]).map(k => {
            const sel = motivosCambio(c.cambios ?? {})
            return <Chip key={k} activo={sel.includes(k)} onClick={() => set(c => {
              const act = motivosCambio(c.cambios ?? {})
              const nuevo = act.includes(k) ? act.filter(x => x !== k) : [...act, k]
              return { ...c, cambios: { ...c.cambios, motivos: nuevo.length ? nuevo : act } }
            })}>{MOTIVOS_CAMBIO[k].texto}</Chip>
          })}
        </div>
      </Pregunta>}
      {c.cambios?.acepta && c.cambios.acepta !== 'no' && <>
        <Pregunta t="¿En cuántos días desde que lo recibe?">
          <div className="flex items-center gap-2 text-sm text-neutral-700">
            <input inputMode="numeric" value={c.cambios?.dias ?? ''} onChange={e => set(c => ({ ...c, cambios: { ...c.cambios, dias: e.target.value ? Math.round(num(e.target.value) ?? 0) : null } }))}
              className="w-20 rounded-lg border border-neutral-300 px-2 py-1" /> días
          </div>
        </Pregunta>
        <Pregunta t="¿Quién paga el envío del cambio?"><div className="flex flex-wrap gap-2">
          {([['comprador', 'El comprador'], ['nosotros', 'Nosotros'], ['depende', 'Depende del caso']] as const).map(([k, t]) =>
            <Chip key={k} activo={c.cambios?.envio === k} onClick={() => set(c => ({ ...c, cambios: { ...c.cambios, envio: k } }))}>{t}</Chip>)}
        </div></Pregunta>
      </>}
    </>
    case 'negocio': return <>
      <Pregunta t="¿Vendes al mayor?" ayuda="Igual, los pedidos de muchas unidades siempre los revisa una persona antes de salir.">
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
          <Chip activo={c.negocio?.mayor === 'escribir'} onClick={() => set(c => ({ ...c, negocio: { ...c.negocio, mayor: 'escribir' } }))}>Sí, que pregunte la cantidad</Chip>
          <Chip activo={c.negocio?.mayor === 'mismo'} onClick={() => set(c => ({ ...c, negocio: { ...c.negocio, mayor: 'mismo' } }))}>No, mismo precio</Chip>
          {c.negocio?.mayor === 'escribir' && <>desde <input inputMode="numeric" value={c.negocio.mayorDesde ?? ''} onChange={e => set(c => ({ ...c, negocio: { ...c.negocio, mayorDesde: e.target.value ? Math.round(num(e.target.value) ?? 0) : null } }))}
            className="w-16 rounded-lg border border-neutral-300 px-2 py-1" /> unidades</>}
        </div>
      </Pregunta>
      <Pregunta t="Si piden rebaja"><div className="flex flex-wrap gap-2">
        <Chip activo={c.negocio?.regateo === 'fijo'} onClick={() => set(c => ({ ...c, negocio: { ...c.negocio, regateo: 'fijo' } }))}>El precio es fijo</Chip>
        <Chip activo={c.negocio?.regateo === 'consultar'} onClick={() => set(c => ({ ...c, negocio: { ...c.negocio, regateo: 'consultar' } }))}>Decir que lo consultamos</Chip>
      </div></Pregunta>
      <Pregunta t="¿Apartas productos?">
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
          <Chip activo={c.negocio?.apartar === 'no'} onClick={() => set(c => ({ ...c, negocio: { ...c.negocio, apartar: 'no' } }))}>No, se asegura comprando</Chip>
          <Chip activo={c.negocio?.apartar === 'si'} onClick={() => set(c => ({ ...c, negocio: { ...c.negocio, apartar: 'si' } }))}>Sí</Chip>
          {c.negocio?.apartar === 'si' && <>por <input inputMode="numeric" value={c.negocio.apartarHoras ?? ''} onChange={e => set(c => ({ ...c, negocio: { ...c.negocio, apartarHoras: e.target.value ? Math.round(num(e.target.value) ?? 0) : null } }))}
            className="w-16 rounded-lg border border-neutral-300 px-2 py-1" /> horas</>}
        </div>
      </Pregunta>
    </>
    case 'atencion': return <Pregunta t="¿En qué horario atienden?" ayuda="La IA lo dice si preguntan cuándo responden o escriben fuera de horario.">
      <Opciones valor={c.atencion?.horario} opciones={['de lunes a viernes de 8 am a 5 pm', 'de lunes a sábado de 8 am a 6 pm']} placeholder="Ej.: lunes a viernes de 9 a 6 y sábados hasta la 1"
        onChange={v => set(c => ({ ...c, atencion: { horario: v } }))} />
    </Pregunta>
    case 'extras': {
      const xs = c.extras ?? []
      const setX = (v: NonNullable<Config['extras']>) => set(c => ({ ...c, extras: v, extrasNoAplica: v.length ? false : c.extrasNoAplica }))
      return <>
        <div className="flex gap-2">
          <Chip activo={!!c.extrasNoAplica && !xs.length} onClick={() => set(c => ({ ...c, extras: [], extrasNoAplica: true }))}>No hace falta</Chip>
        </div>
        <p className="text-xs text-neutral-500">Textos largos (garantía detallada, compatibilidades, cómo se usa). La IA lee cada sección <b>solo cuando la pregunta trata de eso</b>: por su título o por las palabras que pongas. Así gasta menos y no se confunde. Las reglas que valen para todo (ej. «respuestas cortas») márcalas <b>Siempre</b>.</p>
        {xs.map((x, i) => (
          <div key={i} className="rounded-lg border border-neutral-200 p-3 space-y-2">
            <div className="flex gap-2">
              <input value={x.titulo} maxLength={60} onChange={e => setX(xs.map((y, j) => j === i ? { ...y, titulo: e.target.value } : y))} placeholder="Título (ej. Compatibilidad)"
                className="flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium" />
              <button type="button" onClick={() => setX(xs.filter((_, j) => j !== i))} className="text-xs text-red-600 px-2">Quitar</button>
            </div>
            <textarea rows={3} maxLength={1500} value={x.texto} onChange={e => setX(xs.map((y, j) => j === i ? { ...y, texto: e.target.value } : y))}
              placeholder="Lo que la IA debe saber de este tema" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
              <span>La IA lo lee:</span>
              <Chip activo={!x.siempre} onClick={() => setX(xs.map((y, j) => j === i ? { ...y, siempre: false } : y))}>Cuando la pregunta trata de eso</Chip>
              <Chip activo={!!x.siempre} onClick={() => setX(xs.map((y, j) => j === i ? { ...y, siempre: true } : y))}>Siempre</Chip>
            </div>
            {!x.siempre && <input value={x.palabras ?? ''} maxLength={200} onChange={e => setX(xs.map((y, j) => j === i ? { ...y, palabras: e.target.value } : y))}
              placeholder="Palabras que la activan, separadas por coma (ej. sirve, compatible, modelo)" className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-xs" />}
            {contacto(x.texto) && <p className="text-xs text-red-700">Tiene un teléfono, correo o link: MercadoLibre borra o sanciona esas respuestas. Quítalo.</p>}
          </div>
        ))}
        {xs.length < 12 && <button type="button" onClick={() => setX([...xs, { titulo: '', texto: '' }])} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm">+ Agregar sección</button>}
      </>
    }
    case 'postventa': return <>
      <div className="flex gap-2">
        <Chip activo={!!c.postventa?.noAplica} onClick={() => set(c => ({ ...c, postventa: c.postventa?.noAplica ? { ...c.postventa, noAplica: false } : { noAplica: true } }))}>No hace falta nada</Chip>
      </div>
      {!c.postventa?.noAplica && <Pregunta t="Después de comprar, ¿qué tiene que hacer el comprador?">
        <Varios valor={c.postventa?.pasos} opciones={PASOS_PV} otroPlaceholder="Otro paso" onChange={v => set(c => ({ ...c, postventa: { ...c.postventa, pasos: v } }))} />
      </Pregunta>}
      {!c.postventa?.noAplica && <Pregunta t="Datos para pagar (si los das por el chat)" ayuda="La IA los copia exactos, sin cambiar nada. Déjalo vacío si el pago va por otro lado.">
        <textarea rows={2} value={c.postventa?.datosPago ?? ''} onChange={e => set(c => ({ ...c, postventa: { ...c.postventa, datosPago: e.target.value } }))}
          placeholder="Ej.: Pago móvil: banco, cédula, teléfono" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
      </Pregunta>}
    </>
  }
  return null
}

// ── Parte C: sugerencia (solo propone) ───────────────────────────────────────
type Sugerencia = { sugerido: Partial<Config>; avisos: string[]; fuentes: { respuestas: number; descripciones: number; bloque: string | null; politicas: boolean }; fecha: string }
const TEMA_DE_CAMPO: Record<string, string> = { tono: 'tono', oferta: 'oferta', pago: 'pago', envio: 'envio', despacho: 'despacho', ubicacion: 'ubicacion', factura: 'factura', desconocido: 'desconocido', persona: 'persona', postventa: 'postventa', cambios: 'cambios', negocio: 'negocio', atencion: 'atencion', extras: 'extras' }
const ddmm = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}` }

/** Mezcla lo sugerido SOLO en los temas que están vacíos; devuelve la config y qué temas vinieron sugeridos. */
function mezclar(c: Config, s: Partial<Config>) {
  const nueva: Config = { ...c }
  const temas: string[] = []
  for (const p of PASOS) {
    const campo = Object.keys(TEMA_DE_CAMPO).find(k => TEMA_DE_CAMPO[k] === p.id) as keyof Config | undefined
    if (!campo || p.lleno(c) || s[campo] === undefined) continue
    const prueba = { ...nueva, [campo]: s[campo] } as Config
    if (!p.lleno(prueba)) continue
    Object.assign(nueva, { [campo]: s[campo] })
    temas.push(p.id)
  }
  return { nueva, temas }
}

// ── Parte D: prueba con preguntas reales ─────────────────────────────────────
type Caso = { id: string; pregunta: string; titulo: string | null; permalink: string | null; tuya: string | null; ia: string; decision: 'sola' | 'revisar'; motivos: string[]; error?: string }

function Prueba({ iaAuto, onEncendida }: { iaAuto: string | null; onEncendida: () => void }) {
  const [casos, setCasos] = useState<Caso[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [marcas, setMarcas] = useState<Record<string, 'bien' | 'mal'>>({})
  const [error, setError] = useState<string | null>(null)
  const [encendiendo, setEncendiendo] = useState(false)
  const probar = async () => {
    setCargando(true); setError(null); setMarcas({})
    const r = await fetch('/api/mi-ia/probar', { method: 'POST' }); const d = await r.json().catch(() => ({}))
    setCargando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo probar'); return }
    setCasos(d.casos)
  }
  const encender = async () => {
    setEncendiendo(true); setError(null)
    const r = await fetch('/api/preguntas/ia-auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'modo', modo: 'real' }) })
    const d = await r.json().catch(() => ({}))
    setEncendiendo(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo encender'); return }
    onEncendida()
  }
  const marcadas = Object.values(marcas)
  const bien = marcadas.filter(m => m === 'bien').length
  const solas = casos?.filter(x => x.decision === 'sola').length ?? 0
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-neutral-900">Pruébala con {casos?.length || 10} preguntas reales</p>
          <p className="text-xs text-neutral-500">Preguntas que tu equipo ya contestó. La IA responde con lo que configuraste. No se publica nada.</p>
        </div>
        <button type="button" onClick={probar} disabled={cargando} className="px-3 py-2 rounded-lg border border-neutral-300 text-sm disabled:opacity-50">
          {cargando ? 'Probando… (puede tardar 1 minuto)' : casos ? 'Probar otra vez' : 'Probar'}</button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {casos && !casos.length && <p className="text-sm text-neutral-500">No hay preguntas contestadas en los últimos 30 días para probar.</p>}
      {casos?.map(x => (
        <div key={x.id} className="rounded-lg border border-neutral-200 p-3 space-y-2 text-sm">
          <p className="text-xs text-neutral-500">{x.titulo ?? ''}</p>
          <p className="font-medium text-neutral-900">{x.pregunta}</p>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg bg-neutral-50 p-2"><p className="text-xs text-neutral-400">Tu equipo</p><p className="text-neutral-700">{x.tuya || '—'}</p></div>
            <div className="rounded-lg bg-sky-50 p-2"><p className="text-xs text-sky-700">IA</p><p className="text-neutral-900">{x.ia || '—'}</p></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${x.decision === 'sola' ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
              {x.decision === 'sola' ? 'Saldría sola' : `Iría a revisión: ${x.motivos.join(' · ')}`}</span>
            {x.ia && <div className="flex gap-1">
              {(['bien', 'mal'] as const).map(m => <Chip key={m} activo={marcas[x.id] === m} onClick={() => setMarcas(v => ({ ...v, [x.id]: m }))}>{m === 'bien' ? 'Bien' : 'Mal'}</Chip>)}
            </div>}
          </div>
        </div>
      ))}
      {casos && casos.length > 0 && (
        <div className="rounded-lg bg-neutral-50 p-3 space-y-2">
          <p className="text-sm text-neutral-700">{solas} de {casos.length} saldrían solas; el resto quedaría escrito para que una persona lo mande.
            {marcadas.length > 0 && ` Marcaste ${bien} de ${marcadas.length} bien.`}</p>
          {marcadas.some(m => m === 'mal') && <p className="text-xs text-neutral-500">Si alguna está mal, revisa el tema en las tarjetas de arriba (o en Lo aprendido) y prueba otra vez.</p>}
          {iaAuto === 'real' ? <p className="text-sm text-green-800">Las respuestas automáticas ya están encendidas.</p>
            : iaAuto !== null ? <button type="button" onClick={encender} disabled={encendiendo}
                className="w-full px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm disabled:opacity-50">
                {encendiendo ? 'Encendiendo…' : 'Encender respuestas automáticas'}</button>
            : <p className="text-xs text-neutral-500">Para que respondan solas, pide que te activen la respuesta automática con IA.</p>}
          {iaAuto !== null && iaAuto !== 'real' && <p className="text-xs text-neutral-500">Solo salen solas las que cumplen todas las reglas; las demás quedan escritas para revisar. Cada respuesta usa 1 crédito de IA.</p>}
        </div>
      )}
    </div>
  )
}

// ── Pasar mis Políticas a Mi IA (08-11) ─────────────────────────────────────
// Un solo lugar: lo de "Políticas para la IA" se reparte en los temas; si choca con lo que ya hay, elige la persona
// (por defecto queda lo de Mi IA). Lo que no encaja en un tema va a Información extra (general = Siempre). Las Políticas quedan vacías.
type Pase = { propuesto: Partial<Config>; politicas: string }
type Fila = { id: string; tema: string; ahora: string; nuevo: string; valor: unknown; estado: 'nuevo' | 'igual' | 'choca' }

function filasPase(c: Config, propuesto: Partial<Config>): Fila[] {
  const out: Fila[] = []
  const prop = propuesto as unknown as Record<string, unknown>, act = c as unknown as Record<string, unknown>
  for (const p of PASOS) {
    if (p.id === 'extras' || prop[p.id] === undefined) continue
    const v = prop[p.id], a = act[p.id]
    const valor = v && typeof v === 'object' && !Array.isArray(v) && a && typeof a === 'object' && !Array.isArray(a) ? { ...a, ...v } : v
    const conNuevo = { ...c, [p.id]: valor } as Config
    const ahora = p.lleno(c) ? resumen(p.id, c) || 'Completo' : ''
    const nuevo = resumen(p.id, conNuevo) || 'Completo'
    out.push({ id: p.id, tema: p.tema, ahora, nuevo, valor, estado: !ahora ? 'nuevo' : ahora === nuevo ? 'igual' : 'choca' })
  }
  return out
}

function PasarPoliticas({ c, pase, onListo, onCerrar }: { c: Config; pase: Pase; onListo: () => void; onCerrar: () => void }) {
  const filas = filasPase(c, pase.propuesto)
  const extras = pase.propuesto.extras ?? []
  const [elige, setElige] = useState<Record<string, 'mi' | 'pol'>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardar = async () => {
    const final = { ...c } as unknown as Record<string, unknown>
    for (const f of filas) if (f.estado === 'nuevo' || (f.estado === 'choca' && elige[f.id] === 'pol')) final[f.id] = f.valor
    if (extras.length) { final.extras = [...(c.extras ?? []), ...extras].slice(0, 12); delete final.extrasNoAplica }
    setGuardando(true); setError(null)
    const r = await fetch('/api/mi-ia/politicas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ miIA: final }) })
    const d = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo guardar'); return }
    onListo()
  }

  const chocan = filas.filter(f => f.estado === 'choca')
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Pasar mis Políticas a Mi IA</h2>
          <p className="text-sm text-neutral-600">Así queda todo en un solo lugar. Revisa y guarda: nada cambia hasta que guardes.</p>
        </div>
        {!filas.length && !extras.length && <p className="text-sm text-neutral-600">No encontré nada de tus Políticas que vaya en los temas de Mi IA.</p>}
        {chocan.length > 0 && <div className="space-y-2">
          <p className="text-sm font-medium text-amber-900">Esto no coincide: elige cuál vale</p>
          {chocan.map(f => (
            <div key={f.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5">
              <p className="text-sm font-medium text-neutral-900">{f.tema}</p>
              {([['mi', 'Lo de Mi IA', f.ahora], ['pol', 'Lo de mis Políticas', f.nuevo]] as const).map(([k, t, v]) => (
                <label key={k} className="flex items-start gap-2 text-sm text-neutral-800 cursor-pointer">
                  <input type="radio" name={`pase-${f.id}`} checked={(elige[f.id] ?? 'mi') === k} onChange={() => setElige(e => ({ ...e, [f.id]: k }))} className="mt-1" />
                  <span><b>{t}:</b> {v}</span>
                </label>
              ))}
            </div>
          ))}
        </div>}
        {filas.some(f => f.estado === 'nuevo') && <div className="space-y-1">
          <p className="text-sm font-medium text-neutral-900">Se agrega a Mi IA</p>
          <ul className="space-y-0.5 text-sm text-neutral-700">{filas.filter(f => f.estado === 'nuevo').map(f => <li key={f.id}><b>{f.tema}:</b> {f.nuevo}</li>)}</ul>
        </div>}
        {extras.length > 0 && <div className="space-y-1">
          <p className="text-sm font-medium text-neutral-900">Se agrega a Información extra</p>
          <ul className="space-y-1 text-sm text-neutral-700">{extras.map((x, i) => <li key={i}>
            <b>{x.titulo}</b> <span className="text-xs text-neutral-500">({x.siempre ? 'la IA lo lee siempre' : `cuando preguntan por ${x.palabras || x.titulo}`})</span>: {x.texto}</li>)}</ul>
        </div>}
        {filas.some(f => f.estado === 'igual') && <p className="text-xs text-neutral-500">Ya estaba igual en Mi IA: {lista(filas.filter(f => f.estado === 'igual').map(f => f.tema))}.</p>}
        <p className="text-xs text-neutral-500">Al guardar, tus Políticas viejas quedan vacías: todo vive en Mi IA. Lo puedes corregir después en cada tarjeta.</p>
        <details className="text-xs text-neutral-500">
          <summary className="cursor-pointer">Ver mis Políticas como estaban</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-neutral-700">{pase.politicas}</pre>
        </details>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="px-3 py-2 rounded-lg text-sm text-neutral-500 hover:text-neutral-800">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar en Mi IA'}</button>
        </div>
      </div>
    </div>
  )
}

// ── componente ───────────────────────────────────────────────────────────────
export default function MiIA() {
  const [datos, setDatos] = useState<{ miIA: Config | null; pais: string; texto: { preguntas: string; mensajes: string } | null; iaAuto: string | null; politicas?: boolean } | null>(null)
  const [c, setC] = useState<Config>({ version: 1 })
  const [sug, setSug] = useState<Sugerencia | null>(null)
  const [sugeridos, setSugeridos] = useState<string[]>([])
  const [sugiriendo, setSugiriendo] = useState(false)
  const sugerir = async (empezar: boolean) => {
    setSugiriendo(true); setError(null)
    const r = await fetch('/api/mi-ia/sugerir', { method: 'POST' }); const d = await r.json().catch(() => ({}))
    setSugiriendo(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo sugerir'); return }
    const { nueva, temas } = mezclar(c, d.sugerido ?? {})
    setSug(d); setC(nueva); setSugeridos(temas)
    // Arranca en el primer tema sugerido (o el primero que falte): revisar y dar Siguiente lo guarda.
    const ruta1 = empezar ? TODOS : PASOS.map((p, i) => temas.includes(p.id) || !p.lleno(nueva) ? i : -1).filter(i => i >= 0)
    if (empezar || temas.length) recorrer(ruta1.length ? ruta1 : TODOS)
  }
  const [paso, setPaso] = useState<number | null>(null)     // null = página; n = pantalla del cuestionario
  const [ruta, setRuta] = useState<number[]>(TODOS)         // las pantallas de este recorrido (todas, o solo las que faltan)
  const recorrer = (r: number[]) => { setRuta(r); setUnaSola(false); setPaso(r[0]) }
  const [unaSola, setUnaSola] = useState(false)              // editando una tarjeta (vuelve a la página al guardar)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [verTexto, setVerTexto] = useState(false)
  const [pase, setPase] = useState<Pase | null>(null)
  const [pasando, setPasando] = useState(false)
  const pasarPoliticas = async () => {
    setPasando(true); setError(null)
    const r = await fetch('/api/mi-ia/politicas', { method: 'POST' }); const d = await r.json().catch(() => ({}))
    setPasando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudieron leer tus Políticas'); return }
    setPase(d)
  }

  const cargar = async () => {
    const r = await fetch('/api/mi-ia'); const d = await r.json()
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
    setDatos(d); if (d.miIA) setC(d.miIA); setSugeridos([])
  }
  useEffect(() => { cargar() }, [])

  const guardar = async () => {
    setGuardando(true); setError(null)
    // Lo sugerido de los temas por los que todavía no pasó (Siguiente/Guardar) NO se guarda: solo se propone.
    const actual = paso !== null ? PASOS[paso].id : null
    const pendientes = sugeridos.filter(t => t !== actual)
    const cuerpo: Config = { ...c }
    for (const t of pendientes) delete (cuerpo as unknown as Record<string, unknown>)[t]
    if (datos?.miIA) for (const t of pendientes) if ((datos.miIA as unknown as Record<string, unknown>)[t] !== undefined) (cuerpo as unknown as Record<string, unknown>)[t] = (datos.miIA as unknown as Record<string, unknown>)[t]
    const r = await fetch('/api/mi-ia', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
    if (r.ok && actual) setSugeridos(s => s.filter(t => t !== actual))
    const d = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo guardar'); return false }
    return true
  }
  const siguiente = async () => {
    if (!(await guardar())) return
    const pos = paso === null ? -1 : ruta.indexOf(paso)
    if (unaSola || pos < 0 || pos === ruta.length - 1) { setPaso(null); setUnaSola(false); cargar() } else setPaso(ruta[pos + 1])
  }

  if (error && !datos) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
  if (!datos) return <p className="text-sm text-neutral-500">Cargando…</p>

  const aviso = <p className="text-xs text-neutral-500">Esto lo usa la IA en <b>Preguntas</b> y en <b>Mensajes</b>.</p>

  // Cuestionario
  if (paso !== null) {
    const p = PASOS[paso]
    const pos = Math.max(0, ruta.indexOf(paso)), ultimo = pos === ruta.length - 1
    return (
      <div className="max-w-2xl rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
        {!unaSola && <div className="h-1 rounded bg-neutral-100"><div className="h-1 rounded bg-neutral-900" style={{ width: `${((pos + 1) / ruta.length) * 100}%` }} /></div>}
        <div>
          <p className="text-xs text-neutral-500">{p.tema}{unaSola ? '' : ` · ${pos + 1} de ${ruta.length}`}</p>
          <h2 className="text-lg font-semibold text-neutral-900">{p.titulo}</h2>
        </div>
        {sugeridos.includes(p.id) && sug && <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Sugerido de lo que ya respondes ({ddmm(sug.fecha)}). Revísalo y cámbialo si hace falta; se guarda al dar {unaSola ? 'Guardar' : 'Siguiente'}.</p>}
        <Pantalla id={p.id} c={c} set={f => setC(f)} pais={datos.pais} />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex gap-2">
            {!unaSola && pos > 0 && <button type="button" onClick={() => setPaso(ruta[pos - 1])} className="px-3 py-2 rounded-lg border border-neutral-300 text-sm">Atrás</button>}
            <button type="button" onClick={() => { if (unaSola) { setPaso(null); setUnaSola(false); if (datos.miIA) setC(datos.miIA) } else if (ultimo) { setPaso(null); cargar() } else setPaso(ruta[pos + 1]) }}
              className="px-3 py-2 rounded-lg text-sm text-neutral-500 hover:text-neutral-800">{unaSola ? 'Cancelar' : 'Saltar'}</button>
          </div>
          <button type="button" onClick={siguiente} disabled={guardando}
            className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm disabled:opacity-50">
            {guardando ? 'Guardando…' : unaSola ? 'Guardar' : ultimo ? 'Terminar' : 'Siguiente →'}</button>
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
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="button" onClick={() => sugerir(true)} disabled={sugiriendo} className="w-full px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm disabled:opacity-50">
        {sugiriendo ? 'Leyendo tus respuestas y descripciones… (unos segundos)' : 'Empezar con lo que ya respondo (recomendado)'}</button>
      <p className="text-xs text-neutral-500 -mt-1">Lee tus últimas respuestas y lo que repites en tus descripciones, y te propone cada tema. Tú lo revisas.</p>
      <button type="button" onClick={() => recorrer(TODOS)} disabled={sugiriendo} className="w-full px-4 py-2 rounded-lg border border-neutral-300 text-sm">Empezar vacío</button>
    </div>
  )

  const avisosSug = sug?.avisos.length ? (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-1">
      <p className="font-medium">Para confirmar (de tus respuestas y descripciones)</p>
      <ul className="list-disc pl-5 space-y-0.5">{sug.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
    </div>
  ) : null

  // Página Mi IA (el título lo pone la página o la pestaña: aquí no se repite)
  const n = lleno(c)
  const faltan = PASOS.map((p, i) => p.lleno(c) ? -1 : i).filter(i => i >= 0)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {aviso}
        <span className={`text-xs px-2 py-1 rounded-full ${n === PASOS.length ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
          {Math.round((n / PASOS.length) * 100)}% completa</span>
      </div>
      {faltan.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">Te {faltan.length === 1 ? 'falta 1 tema' : `faltan ${faltan.length} temas`}: <b>{lista(faltan.map(i => PASOS[i].tema))}</b></p>
          <button type="button" onClick={() => recorrer(faltan)} className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm">Continuar →</button>
        </div>
      )}
      {avisosSug}
      {datos.politicas && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
        <p className="text-sm text-sky-900">Tienes <b>Políticas para la IA</b> escritas aparte. Pásalas aquí para tener todo en un solo lugar: si algo no coincide, eliges tú.</p>
        <button type="button" onClick={pasarPoliticas} disabled={pasando} className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm disabled:opacity-50">
          {pasando ? 'Leyendo tus Políticas…' : 'Pasar mis Políticas a Mi IA'}</button>
      </div>}
      {pase && <PasarPoliticas c={c} pase={pase} onCerrar={() => setPase(null)} onListo={() => { setPase(null); cargar() }} />}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {PASOS.map((p, i) => {
          const ok = p.lleno(c), r = ok ? resumen(p.id, c) : ''
          return <button key={p.id} type="button" onClick={() => { setUnaSola(true); setPaso(i) }}
            className={`text-left rounded-xl border px-4 py-3 hover:border-neutral-400 ${ok ? 'border-neutral-200 bg-white' : 'border-dashed border-amber-300 bg-amber-50/40'}`}>
            <p className="text-sm font-medium text-neutral-900">{p.tema}</p>
            <p className={`text-xs mt-0.5 ${ok ? 'text-neutral-600' : 'text-amber-800'}`}>{ok ? (r || 'Completo') : 'Falta: toca para completarlo'}</p>
          </button>
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button type="button" onClick={() => recorrer(TODOS)} className="text-sm text-sky-700">Revisar todo paso a paso</button>
        {n < PASOS.length && <button type="button" onClick={() => sugerir(false)} disabled={sugiriendo} className="text-sm text-sky-700 disabled:opacity-50">
          {sugiriendo ? 'Leyendo tus respuestas…' : 'Sugerir lo que falta desde mis respuestas'}</button>}
        {datos.texto && <button type="button" onClick={() => setVerTexto(v => !v)} className="text-sm text-neutral-500">{verTexto ? 'Ocultar' : 'Ver'} cómo lo lee la IA (solo tú)</button>}
      </div>
      {sug && !sugeridos.length && <p className="text-xs text-neutral-500">No encontré nada claro para los temas que faltan.</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {verTexto && datos.texto && <pre className="whitespace-pre-wrap rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-700">{datos.texto.mensajes}</pre>}
      <Prueba iaAuto={datos.iaAuto} onEncendida={cargar} />
    </div>
  )
}
