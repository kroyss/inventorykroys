'use client'
import { useEffect, useRef, useState } from 'react'
import { usePrimera } from '@/lib/primera'
import type { MiIA as Config, Agencia, MotivoCambio } from '@/lib/miIA'
import { MOTIVOS_CAMBIO, motivosCambio, TEMAS_MI_IA } from '@/lib/miIA'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { FrenosIA } from '@/components/preguntas/FrenosIA'
import { ResponderTodo } from '@/components/ia/ResponderTodo'
import { useVistoNuevo } from '@/components/ui/Nuevo'

// Mi IA (06-11, lib/miIA.ts): cuestionario paso a paso (una pantalla por tema) + página con una tarjeta por tema.
// La misma en Preguntas → Configuración, en Mensajes y en el menú de usuario (/mi-ia). Guarda en cada "Siguiente".

type Paso = { id: string; titulo: string; tema: string; lleno: (c: Config) => boolean }
// Cuándo cuenta cada tema como completo: lib/miIA.ts (TEMAS_MI_IA), la misma regla que frena el encendido en el servidor.
const LLENO = (id: string) => TEMAS_MI_IA.find(t => t.id === id)!.lleno
const PASOS: Paso[] = [
  { id: 'tono', tema: 'Tono', titulo: '¿Cómo le hablas al comprador?', lleno: LLENO('tono') },
  { id: 'oferta', tema: 'Oferta fija', titulo: '¿Hay algo que siempre quieras mencionar?', lleno: LLENO('oferta') },
  { id: 'pago', tema: 'Pago', titulo: '¿Cómo te pagan?', lleno: LLENO('pago') },
  { id: 'envio', tema: 'Envío', titulo: '¿Por dónde envías?', lleno: LLENO('envio') },
  { id: 'despacho', tema: 'Despacho', titulo: '¿Cuándo despachas?', lleno: LLENO('despacho') },
  { id: 'ubicacion', tema: 'Ubicación y retiro', titulo: '¿Dónde estás y se puede retirar?', lleno: LLENO('ubicacion') },
  { id: 'factura', tema: 'Factura y garantía', titulo: 'Factura y garantía', lleno: LLENO('factura') },
  { id: 'cambios', tema: 'Cambios y devoluciones', titulo: '¿Aceptas cambios o devoluciones?', lleno: LLENO('cambios') },
  { id: 'negocio', tema: 'Al mayor, rebajas y apartados', titulo: 'Al mayor, rebajas y apartados', lleno: LLENO('negocio') },
  { id: 'atencion', tema: 'Horario de atención', titulo: '¿En qué horario atienden?', lleno: LLENO('atencion') },
  { id: 'desconocido', tema: 'Si no sabe algo', titulo: 'Si la IA no sabe un dato técnico, ¿qué hace?', lleno: LLENO('desconocido') },
  { id: 'persona', tema: 'Siempre una persona', titulo: '¿Qué temas responde siempre una persona?', lleno: LLENO('persona') },
  { id: 'extras', tema: 'Información extra', titulo: 'Información extra (opcional)', lleno: LLENO('extras') },
  { id: 'postventa', tema: 'Después de la compra', titulo: 'Después de la compra (Mensajes)', lleno: LLENO('postventa') },
]

/** Lo guardado en una línea (la tarjeta lo muestra para verificar sin entrar). */
const lista = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`
const corto = (s: string, n = 60) => s.length > n ? s.slice(0, n - 1) + '…' : s
function resumen(id: string, c: Config): string {
  switch (id) {
    case 'tono': return [c.tono?.saludo && `«${c.tono.saludo}»`, c.tono?.despedida && `«${c.tono.despedida}»`, c.tono?.trato === 'usted' ? 'de usted' : c.tono?.trato === 'tu' ? 'tuteo' : '', c.tono?.persona === 'yo' ? 'como «yo»' : ''].filter(Boolean).join(' · ')
    case 'oferta': return c.oferta?.texto?.trim() ? corto(c.oferta.texto.trim()) : c.oferta ? 'No tengo oferta fija' : ''
    case 'pago': return [c.pago?.tasa, c.pago?.medios?.length ? corto(lista(c.pago.medios), 70) : '', c.pago?.divisas ? `${c.pago.divisas.pct}% menos en divisas` : ''].filter(Boolean).join(' · ')
    case 'envio': {
      const ags = c.envio?.agencias ?? []
      const g = ags.filter(a => a.gratis).map(a => a.nombre), d = ags.filter(a => !a.gratis).map(a => a.nombre)
      return [g.length ? `${lista(g)} gratis` : '', d.length ? `${lista(d)} cobro a destino` : '',
        c.envio?.minimo ? `mínimo ${c.envio.minimo.unidades} u. bajo $${c.envio.minimo.precioMenor}` : ''].filter(Boolean).join(' · ')
    }
    case 'despacho': return [c.despacho?.dias, c.despacho?.corte ? `mismo día antes de las ${c.despacho.corte}` : c.despacho?.plazo === 0 ? 'sale el mismo día' : c.despacho?.plazo === 1 ? 'sale al siguiente día hábil' : c.despacho?.plazo ? `sale a los ${c.despacho.plazo} días hábiles` : 'falta: ¿cuándo sale?'].filter(Boolean).join(' · ')
    case 'ubicacion': return [c.ubicacion?.zona, c.ubicacion?.decir === false ? 'no decirlo' : '',
      c.ubicacion?.retiro === 'no' ? 'sin retiro' : c.ubicacion?.retiro === 'acuerdo' ? 'retiro previo acuerdo' : c.ubicacion?.retiro === 'horario' ? `retiro ${c.ubicacion.retiroHorario ?? ''}`.trim() : ''].filter(Boolean).join(' · ')
    case 'factura': return [c.factura?.tipo === 'fiscal' ? 'Factura fiscal' : c.factura?.tipo === 'nota' ? 'Nota de entrega' : c.factura?.tipo === 'no' ? 'Sin factura' : '',
      c.factura?.garantiaDias ? `${c.factura.garantiaDias} días de garantía${c.factura.garantiaNoCubre ? ` (no cubre ${corto(c.factura.garantiaNoCubre, 40)})` : ''}` : ''].filter(Boolean).join(' · ')
    case 'desconocido': return [(c.desconocido ?? []).map((k, i) => `${i + 1}. ${{ verificar: 'verificarlo con un técnico', preguntar: 'preguntar', recomendar: 'recomendar otra', persona: 'una persona' }[k]}`).join(' · '), c.catalogo === false ? 'sin catálogo' : 'catálogo ante la duda'].filter(Boolean).join(' · ')
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
const DESC = { verificar: 'Decir lo que sabe y recomendar verificarlo con un técnico o en su equipo', preguntar: 'Preguntar el modelo o para qué lo necesita', recomendar: 'Recomendar otra publicación tuya que sí lo cumpla', persona: 'Dejarla para una persona' } as const
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
      <Pregunta t="¿Cómo habla de ti?" ayuda="Nunca como alguien de afuera («según la descripción…»).">
        <div className="flex flex-wrap gap-2">
          <Chip activo={c.tono?.persona !== 'yo'} onClick={() => set(c => ({ ...c, tono: { ...c.tono, persona: 'nosotros' } }))}>Como equipo («tenemos»)</Chip>
          <Chip activo={c.tono?.persona === 'yo'} onClick={() => set(c => ({ ...c, tono: { ...c.tono, persona: 'yo' } }))}>Como persona («tengo»)</Chip>
        </div>
      </Pregunta>
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
      {!c.despacho?.corte && <Pregunta t="¿Cuándo sale el pedido?" ayuda="Después de confirmado el pago y llenado el formulario. La IA lo dice cuando preguntan cuánto tarda.">
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
          {([[0, 'El mismo día'], [1, 'Al siguiente día hábil'], [2, 'A los 2 días hábiles']] as const).map(([k, t]) =>
            <Chip key={k} activo={c.despacho?.plazo === k} onClick={() => set(c => ({ ...c, despacho: { ...c.despacho, plazo: k } }))}>{t}</Chip>)}
          <label className="flex items-center gap-1">Otro: <input inputMode="numeric" value={c.despacho?.plazo != null && c.despacho.plazo > 2 ? c.despacho.plazo : ''}
            onChange={e => set(c => ({ ...c, despacho: { ...c.despacho, plazo: num(e.target.value) === null ? null : Math.min(30, Math.round(num(e.target.value)!)) } }))}
            className="w-14 rounded-lg border border-neutral-300 px-2 py-1" /> días hábiles</label>
        </div>
      </Pregunta>}
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
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${i >= 0 ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-400'}`}>{i >= 0 ? i + 1 : ''}</span>
              <span>{DESC[k]}{k === 'persona' && <span className="block text-xs text-neutral-500">Solo en Modo Seguro. En Modo Total también salen solas.</span>}</span>
            </button>
          })}
        </div>
        <div className="pt-2 space-y-1">
          <p className="text-sm text-neutral-800">Si no tiene el producto que piden o no sabe cuál es, ¿invita a ver tu catálogo?</p>
          <p className="text-xs text-neutral-500">Pone el link a todas tus publicaciones en MercadoLibre (lo arma solo).</p>
          <div className="flex gap-2">
            <Chip activo={c.catalogo !== false} onClick={() => set(c => ({ ...c, catalogo: true }))}>Sí</Chip>
            <Chip activo={c.catalogo === false} onClick={() => set(c => ({ ...c, catalogo: false }))}>No</Chip>
          </div>
        </div>
      </Pregunta>
    }
    case 'persona': return <Pregunta t="Marca los temas" ayuda="En Modo Seguro esas preguntas y mensajes nunca salen solos: van a revisión. En Modo Total también salen solas.">
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
        {xs.length < 12 && <button type="button" onClick={() => setX([...xs, { titulo: '', texto: '' }])} className="btn-secondary !px-3 !py-1.5">+ Agregar sección</button>}
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
type Sugerencia = { sugerido: Partial<Config>; avisos: { tema: string; texto: string }[]; fuentes: { respuestas: number; descripciones: number; bloque: string | null; politicas: boolean }; fecha: string }
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

// ── Parte D: prueba con casos reales (Preguntas y, desde el 09-11, Mensajes) ─────────────────────────────────────
// 09-11 (el dueño): al marcar «Mal» se elige qué estuvo mal y se recomienda qué mejorar (completar un tema de Mi IA,
// la descripción, la ficha o las fotos…). Las marcas no se guardan: son para que el cliente decida si la enciende.
type Caso = { id: string; texto: string; titulo: string | null; permalink?: string | null; itemId?: string | null; tuya: string | null; ia: string; decision: 'sola' | 'revisar' | 'nada'; motivos: string[]; error?: string }
type Error_ = 'falta' | 'dato' | 'regla' | 'tono' | 'persona' | 'otro'
const ERRORES: { id: Error_; t: string }[] = [
  { id: 'falta', t: 'Le faltó un dato del producto' },
  { id: 'dato', t: 'Dio un dato equivocado' },
  { id: 'regla', t: 'No siguió cómo trabajo (pago, envío, despacho…)' },
  { id: 'tono', t: 'El tono o la forma' },
  { id: 'persona', t: 'Esto lo debía ver una persona' },
  { id: 'otro', t: 'Otra cosa' },
]
function recomendacion(e: Error_, tipo: 'preguntas' | 'mensajes'): { texto: string; tema?: string; boton?: string } {
  switch (e) {
    case 'falta': return { texto: tipo === 'preguntas'
      ? 'Agrega ese dato a la descripción de la publicación en MercadoLibre (o anótalo con «Anotar dato del producto» desde la pregunta). La IA responde con la ficha técnica, la descripción y las fotos de cada publicación.'
      : 'Agrega ese dato a la descripción de la publicación en MercadoLibre. Si es algo de cómo trabajas después de la compra, complétalo en «Después de la compra».',
      ...(tipo === 'mensajes' ? { tema: 'postventa', boton: 'Abrir «Después de la compra»' } : {}) }
    case 'dato': return { texto: 'Revisa esa publicación en MercadoLibre: que la ficha técnica, la descripción y las fotos digan lo mismo (voltaje, medidas, qué incluye). Si se contradicen, la IA puede tomar el dato equivocado.' }
    case 'regla': return { texto: 'Revisa en Mi IA el tema que corresponda (Pago, Envío, Despacho, Ubicación…). Lo que escribas ahí manda sobre todo lo demás.', tema: '*', boton: 'Revisar Mi IA paso a paso' }
    case 'tono': return { texto: 'Ajusta el tema Tono (saludo y despedida) y revisa tus Respuestas rápidas: la IA copia tu forma de escribir.', tema: 'tono', boton: 'Abrir Tono' }
    case 'persona': return { texto: 'Agrega ese tema en «Siempre una persona»: así esas respuestas nunca salen solas y quedan escritas para tu equipo.', tema: 'persona', boton: 'Abrir «Siempre una persona»' }
    default: return { texto: 'Corrige lo que haga falta en Mi IA o en la publicación y prueba otra vez.' }
  }
}

const TEXTOS = {
  preguntas: { titulo: 'preguntas reales', sub: 'Preguntas que tu equipo ya contestó. La IA responde con lo que configuraste. No se publica nada.',
    url: '/api/mi-ia/probar', vacio: 'No hay preguntas contestadas en los últimos 30 días para probar.', equipo: 'Tu equipo',
    encender: 'Encender respuestas automáticas en Preguntas', encendido: 'Respuestas automáticas en Preguntas: encendidas.' },
  mensajes: { titulo: 'mensajes reales', sub: 'Mensajes de compradores que tu equipo ya contestó. La IA ve la conversación hasta ese mensaje y responde. No se manda nada.',
    url: '/api/mi-ia/probar-mensajes', vacio: 'No hay mensajes contestados en los últimos 30 días para probar.', equipo: 'Tu equipo',
    encender: 'Encender respuestas automáticas en Mensajes', encendido: 'Respuestas automáticas en Mensajes: encendidas.' },
} as const

const ACEPTO = 'La IA responde en tu nombre.\n\nSolo salen solas las respuestas en que está segura. Lo delicado siempre pasa a una persona: reclamos, pagos, datos personales, cuando dice que no hay y los temas que marcaste en «Siempre una persona». Esas quedan escritas para que tu equipo las revise y las mande (Modo Seguro). Después puedes pasar a Modo Total, que responde todo.\n\nCada respuesta usa 1 crédito de IA. La apagas cuando quieras desde aquí.'

// 10-11 (el dueño): la tarjeta de cada lado (Preguntas / Mensajes) es corta: encender, el modo y probar. La prueba se abre
// en su propia pantalla, con el historial de pruebas anteriores y sus correcciones (mig 164, lib/miIAPruebas.ts). Lo que el
// usuario corrige se aprende: dato del producto → Datos del producto; regla → Mi IA «Correcciones de mi equipo».
type MarcaCaso = { marca: 'bien' | 'mal' | null; error?: string | null; correccion?: string | null; aprendido?: { producto?: string; regla?: string } | null }
type PruebaG = { id: string | null; creado_at: string; casos: Caso[]; marcas: Record<string, MarcaCaso> }
const aCaso = (x: Caso & { pregunta?: string; mensaje?: string }): Caso => ({ ...x, texto: x.texto ?? x.pregunta ?? x.mensaje ?? '' })
const fechaPrueba = (s: string) => new Date(s).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function Prueba({ tipo, encendida, todo = false, onCambio, abrir, quedan: quedanAl, faltan }: { tipo: 'preguntas' | 'mensajes'; encendida: boolean | null; todo?: boolean; onCambio: () => void; abrir: (tema: string) => void
  quedan: number | null; faltan: string[] }) {
  const [usadas, setUsadas] = useState(0)
  const quedan = quedanAl === null ? null : Math.max(0, quedanAl - usadas)
  const confirm = useConfirm()
  const T = TEXTOS[tipo]
  const [error, setError] = useState<string | null>(null)
  const [cambiando, setCambiando] = useState(false)
  const [pantalla, setPantalla] = useState<null | 'probar' | 'historial'>(null)
  const cambiar = async (encender: boolean) => {
    if (encender && !(await confirm({ title: T.encender, message: ACEPTO, confirmText: 'Acepto, encender' }))) return
    if (!encender && !(await confirm({ title: 'Apagar respuestas automáticas', message: 'La IA deja de responder sola. Puedes seguir usando «Proponer con IA».', confirmText: 'Apagar' }))) return
    setCambiando(true); setError(null)
    const r = tipo === 'preguntas'
      ? await fetch('/api/preguntas/ia-auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'modo', modo: encender ? 'real' : 'apagado' }) })
      : await fetch('/api/mensajes/ia-prueba', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto: encender }) })
    const d = await r.json().catch(() => ({}))
    setCambiando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo cambiar'); return }
    onCambio()
  }
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-neutral-900">{tipo === 'preguntas' ? 'Preguntas' : 'Mensajes'}</p>
        {encendida !== null && <span className={`text-xs px-2 py-0.5 rounded-full ${encendida ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-600'}`}>
          {encendida ? `Encendida · ${todo ? 'Modo Total' : 'Modo Seguro'}` : 'Apagada'}</span>}
      </div>

      {encendida === null && <div className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
        Las respuestas automáticas vienen con los planes <b>Automatizaciones</b> y <b>Completo</b>. <a href="/mi-plan" className="text-sky-700">Ver Mi plan →</a></div>}

      {encendida === false && faltan.length > 0 && <p className="text-xs text-amber-900 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
        Para encenderla, primero completa Mi IA. Te {faltan.length === 1 ? 'falta 1 tema' : `faltan ${faltan.length} temas`}: <b>{faltan.join(', ')}</b>.</p>}
      {encendida === false && faltan.length === 0 && <button type="button" onClick={() => cambiar(true)} disabled={cambiando}
        className="w-full px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm disabled:opacity-50">{cambiando ? 'Encendiendo…' : T.encender}</button>}

      {encendida && <div className="space-y-2">
        <ResponderTodo tipo={tipo} todo={todo} onCambio={onCambio} />
        <button type="button" onClick={() => cambiar(false)} disabled={cambiando} className="text-xs text-neutral-500 hover:text-red-700 disabled:opacity-50">
          {cambiando ? 'Apagando…' : `Apagar respuestas automáticas en ${tipo === 'preguntas' ? 'Preguntas' : 'Mensajes'}`}</button>
      </div>}

      {encendida !== null && <p className="text-xs text-neutral-500">En los dos modos cada {tipo === 'preguntas' ? 'pregunta' : 'mensaje'} usa 1 crédito, salga {tipo === 'preguntas' ? 'sola' : 'solo'} o quede escrit{tipo === 'preguntas' ? 'a' : 'o'} para revisar.</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-100 pt-3">
        <button type="button" onClick={() => setPantalla('probar')} disabled={quedan === 0}
          className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm disabled:opacity-50">
          {quedan === 0 ? 'Puedes volver a probar mañana' : `Probar con 10 ${T.titulo}`}</button>
        <button type="button" onClick={() => setPantalla('historial')} className="text-sm text-sky-700">Pruebas anteriores</button>
        <span className="w-full text-xs text-neutral-500">Opcional y gratis{quedan !== null ? ` · ${quedan === 1 ? 'te queda 1 prueba hoy' : `te quedan ${quedan} pruebas hoy`}` : ''}. No se publica ni se manda nada.</span>
      </div>

      {pantalla && <PantallaPruebas tipo={tipo} probarAlAbrir={pantalla === 'probar'} quedan={quedan}
        onProbada={() => setUsadas(u => u + 1)} onCerrar={() => setPantalla(null)} abrir={t => { setPantalla(null); abrir(t) }} />}
    </div>
  )
}

function PantallaPruebas({ tipo, probarAlAbrir, quedan, onProbada, onCerrar, abrir }: {
  tipo: 'preguntas' | 'mensajes'; probarAlAbrir: boolean; quedan: number | null; onProbada: () => void; onCerrar: () => void; abrir: (tema: string) => void
}) {
  const T = TEXTOS[tipo]
  const [pruebas, setPruebas] = useState<PruebaG[] | null>(null)
  const [sel, setSel] = useState<number>(0)
  const [probando, setProbando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [arrancada, setArrancada] = useState(false)
  const cargar = async () => {
    const r = await fetch(`/api/mi-ia/pruebas?tipo=${tipo}`).catch(() => null)
    const d = await r?.json().catch(() => null)
    const ps: PruebaG[] = r?.ok ? (d.pruebas as PruebaG[]).map(p => ({ ...p, casos: (p.casos ?? []).map(aCaso), marcas: p.marcas ?? {} })) : []
    return ps
  }
  const probar = async () => {
    setProbando(true); setError(null)
    const r = await fetch(T.url, { method: 'POST' }); const d = await r.json().catch(() => ({}))
    setProbando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo probar'); return }
    onProbada()
    const nueva: PruebaG = { id: d.id ?? null, creado_at: new Date().toISOString(), casos: (d.casos as Caso[]).map(aCaso), marcas: {} }
    const ps = await cargar()
    setPruebas([nueva, ...ps.filter(p => p.id !== nueva.id)]); setSel(0)
  }
  useEffect(() => {
    const t = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', esc)
    return () => { document.body.style.overflow = t; window.removeEventListener('keydown', esc) }
  }, [onCerrar])
  useEffect(() => {
    if (arrancada) return
    setArrancada(true)
    if (probarAlAbrir) { setPruebas([]); probar() } else cargar().then(setPruebas)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const p = pruebas?.[sel] ?? null
  const marcar = (casoId: string, m: MarcaCaso) => setPruebas(ps => ps && ps.map((x, i) => i === sel ? { ...x, marcas: { ...x.marcas, [casoId]: m } } : x))
  const resumenDe = (x: PruebaG) => {
    const solas = x.casos.filter(c => c.decision === 'sola').length
    const ms = Object.values(x.marcas).filter(m => m.marca)
    return `${solas} de ${x.casos.length} solas${ms.length ? ` · ${ms.filter(m => m.marca === 'bien').length} de ${ms.length} bien` : ''}`
  }
  // «Para mejorar»: una recomendación por tipo de error marcado en esta prueba (las más repetidas primero).
  const cuenta = new Map<Error_, number>()
  for (const m of Object.values(p?.marcas ?? {})) if (m.marca === 'mal' && m.error) cuenta.set(m.error as Error_, (cuenta.get(m.error as Error_) ?? 0) + 1)
  const recs = [...cuenta.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch justify-center p-0 sm:p-4" onClick={onCerrar}>
      <div className="bg-neutral-50 w-full max-w-6xl sm:rounded-xl shadow-xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="font-semibold text-neutral-900">Prueba de Mi IA · {tipo === 'preguntas' ? 'Preguntas' : 'Mensajes'}</p>
            <p className="text-xs text-neutral-500">{T.sub}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={probar} disabled={probando || quedan === 0} className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-sm disabled:opacity-50">
              {probando ? 'Probando… (puede tardar 1 minuto)' : quedan === 0 ? 'Vuelve a probar mañana' : 'Probar otra vez'}</button>
            <button type="button" onClick={onCerrar} className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-sm">Cerrar</button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <aside className="md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-neutral-200 bg-white overflow-x-auto md:overflow-y-auto">
            <p className="hidden md:block px-4 pt-3 pb-1 text-xs font-medium text-neutral-500">Pruebas</p>
            <div className="flex md:flex-col gap-1 p-2">
              {pruebas === null && <p className="px-2 py-1 text-sm text-neutral-500">Cargando…</p>}
              {pruebas?.length === 0 && !probando && <p className="px-2 py-1 text-sm text-neutral-500">Todavía no hay pruebas.</p>}
              {probando && <p className="px-2 py-1 text-sm text-neutral-500 whitespace-nowrap">Probando…</p>}
              {pruebas?.map((x, i) => (
                <button key={x.id ?? i} type="button" onClick={() => setSel(i)}
                  className={`text-left shrink-0 rounded-lg px-3 py-2 text-sm ${i === sel ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100 text-neutral-800'}`}>
                  <span className="block whitespace-nowrap">{fechaPrueba(x.creado_at)}</span>
                  <span className={`block text-xs whitespace-nowrap ${i === sel ? 'text-neutral-300' : 'text-neutral-500'}`}>{resumenDe(x)}</span>
                </button>
              ))}
            </div>
          </aside>
          <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-3">
            {error && <p className="text-sm text-red-700">{error}</p>}
            {probando && <p className="text-sm text-neutral-600">La IA está respondiendo {T.titulo} que tu equipo ya contestó…</p>}
            {p && !p.casos.length && <p className="text-sm text-neutral-500">{T.vacio}</p>}
            {p && p.casos.length > 0 && <p className="text-sm text-neutral-700">
              {p.casos.filter(c => c.decision === 'sola').length} de {p.casos.length} saldrían solas en Modo Seguro; el resto quedaría escrito para revisar.
              Marca cada una y, si está mal, escribe qué debió decir: <b>la IA lo aprende</b>.</p>}
            {recs.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-900">Para mejorar</p>
              {recs.map(([e, n]) => {
                const r = recomendacion(e, tipo)
                return <div key={e} className="text-sm text-amber-900 space-y-1">
                  <p><b>{ERRORES.find(x => x.id === e)?.t}</b>{n > 1 ? ` (${n})` : ''}: {r.texto}</p>
                  {r.tema && r.boton && <button type="button" onClick={() => abrir(r.tema!)} className="text-sm text-sky-700">{r.boton} →</button>}
                </div>
              })}
            </div>}
            {p?.casos.map(x => <CasoPrueba key={x.id} x={x} pruebaId={p.id} m={p.marcas[x.id]} equipo={T.equipo} onMarca={m => marcar(x.id, m)} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function CasoPrueba({ x, pruebaId, m, equipo, onMarca }: { x: Caso; pruebaId: string | null; m?: MarcaCaso; equipo: string; onMarca: (m: MarcaCaso) => void }) {
  const [error, setError] = useState<Error_ | null>((m?.error as Error_) ?? null)
  const [texto, setTexto] = useState(m?.correccion ?? '')
  const [estado, setEstado] = useState<'' | 'guardando' | string>('')
  const guardar = async (n: MarcaCaso) => {
    onMarca({ ...n, aprendido: m?.aprendido ?? null })
    if (!pruebaId) return
    setEstado('guardando')
    const r = await fetch('/api/mi-ia/pruebas', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pruebaId, caso: x.id, marca: n.marca, error: n.error ?? null, correccion: n.correccion ?? null }) }).catch(() => null)
    const d = await r?.json().catch(() => null)
    if (!r?.ok) { setEstado(d?.error ?? 'No se pudo guardar'); return }
    setEstado(''); onMarca(d.marca)
  }
  const ap = m?.aprendido
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 space-y-2 text-sm">
      {x.titulo && (x.permalink ? <a href={x.permalink} target="_blank" rel="noreferrer" className="block text-xs text-sky-700 truncate">{x.titulo}</a>
        : <p className="text-xs text-neutral-500 truncate">{x.titulo}</p>)}
      <p className="font-medium text-neutral-900 whitespace-pre-line">{x.texto}</p>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-lg bg-neutral-50 p-2"><p className="text-xs text-neutral-400">{equipo}</p><p className="text-neutral-700 whitespace-pre-line">{x.tuya || '—'}</p></div>
        <div className="rounded-lg bg-sky-50 p-2"><p className="text-xs text-sky-700">IA</p><p className="text-neutral-900 whitespace-pre-line">{x.ia || (x.decision === 'nada' ? '(no hace falta responder)' : '—')}</p></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${x.decision === 'revisar' ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>
          {x.decision === 'sola' ? 'Saldría sola' : x.decision === 'nada' ? 'No hace falta responder' : `En Modo Seguro iría a revisar: ${x.motivos.join(' · ')}`}</span>
        {x.ia && <div className="flex gap-1">
          <Chip activo={m?.marca === 'bien'} onClick={() => guardar({ marca: m?.marca === 'bien' ? null : 'bien' })}>Bien</Chip>
          <Chip activo={m?.marca === 'mal'} onClick={() => onMarca({ ...(m ?? {}), marca: 'mal' })}>Mal</Chip>
        </div>}
      </div>
      {m?.marca === 'mal' && <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
        <p className="text-xs text-neutral-600">¿Qué estuvo mal?</p>
        <div className="flex flex-wrap gap-1">
          {ERRORES.map(e => <Chip key={e.id} activo={error === e.id} onClick={() => setError(e.id)}>{e.t}</Chip>)}
        </div>
        <p className="text-xs text-neutral-600"><b>¿Qué debió decir?</b> Escríbelo como se lo dirías a tu equipo. La IA lo guarda como dato del producto o como regla para todas.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <textarea rows={2} value={texto} onChange={e => setTexto(e.target.value)} maxLength={500}
            placeholder="Ej.: Sirve para cualquier vehículo, no solo Twingo. / Si piden Cashea, di que no y nombra nuestros medios de pago."
            className="flex-1 min-w-0 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white" />
          <button type="button" disabled={estado === 'guardando'} onClick={() => guardar({ marca: 'mal', error, correccion: texto.trim() || null })}
            className="sm:self-start px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-sm disabled:opacity-50">{estado === 'guardando' ? 'Aprendiendo…' : 'Guardar'}</button>
        </div>
        {estado && estado !== 'guardando' && <p className="text-xs text-red-700">{estado}</p>}
        {m?.correccion && !estado && (ap?.producto || ap?.regla
          ? <div className="text-xs text-green-800 space-y-0.5">
              {ap.producto && <p>✓ Aprendido en <b>Datos del producto</b>: {ap.producto}</p>}
              {ap.regla && <p>✓ Aprendido como <b>regla para todas</b> (Mi IA → Información extra → «Correcciones de mi equipo»): {ap.regla}</p>}
            </div>
          : <p className="text-xs text-neutral-500">Guardado. No había un dato nuevo para recordar (o ya estaba anotado).</p>)}
      </div>}
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
export default function MiIA({ inicial = null, frenosInicial = null }: { inicial?: unknown; frenosInicial?: unknown }) {
  useVistoNuevo('mi_ia')   // al entrar se quita la marca «Nuevo» de los menús
  const [datos, setDatos] = useState<{ miIA: Config | null; pais: string; texto: { preguntas: string; mensajes: string } | null; iaAuto: string | null; msgAuto?: boolean | null; msgPronto?: boolean; iaTodo?: boolean; msgTodo?: boolean; politicas?: boolean; pruebas?: { preguntas: number; mensajes: number } | null } | null>(null)
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
  const [, setUnaSola] = useState(false)   // (11-11: ya no cambia la pantalla; se navega igual entre todos los temas)
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

  const primera = usePrimera(inicial as any)   // eslint-disable-line @typescript-eslint/no-explicit-any -- 12-11 (rapidez): la primera carga viene en el HTML
  const cargar = async () => {
    let d = primera()
    if (!d) {
      const r = await fetch('/api/mi-ia'); d = await r.json()
      if (!r.ok) { setError(d!.error ?? 'No se pudo cargar'); return }
    }
    setDatos(d); if (d.miIA) setC(d.miIA); setSugeridos([])
    ultimoGuardado.current = d.miIA ? JSON.stringify(d.miIA) : null
  }
  useEffect(() => { cargar() }, [])
  // Desde las recomendaciones de la prueba (09-11): abre el tema de Mi IA que hay que mejorar ('*' = todos).
  const abrirTema = (id: string) => {
    if (id === '*') recorrer(TODOS)
    else { const i = PASOS.findIndex(p => p.id === id); if (i >= 0) { setRuta(TODOS); setUnaSola(true); setPaso(i) } }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 11-11 (el dueño: "demora al pasar de tema"): sin cambios no se guarda nada, y los guardados van en fila (uno detrás
  // de otro) para que uno lento no pise al siguiente.
  const ultimoGuardado = useRef<string | null>(null)
  const [dir, setDir] = useState<'adelante' | 'atras'>('adelante')
  const [guardadoOk, setGuardadoOk] = useState(false)
  const timerOk = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tarjeta = useRef<HTMLDivElement>(null)
  const colaGuardar = useRef<Promise<boolean>>(Promise.resolve(true))
  // 12-11 (BUG: «llené Pago, Envío… y siguen faltando»): el tema por el que se pasa deja de ser «sugerido» AL INSTANTE
  // (ref), no cuando termina de guardarse. Antes, pasando rápido de tema, el guardado siguiente todavía lo veía como
  // sugerido sin revisar y lo borraba. El ref evita además leer una lista vieja desde un render anterior.
  const sugeridosRef = useRef<string[]>([])
  sugeridosRef.current = sugeridos
  const guardar = (): Promise<boolean> => {
    // Lo sugerido de los temas por los que todavía no pasó (Siguiente/Guardar) NO se guarda: solo se propone.
    const actual = paso !== null ? PASOS[paso].id : null
    if (actual && sugeridosRef.current.includes(actual)) {
      sugeridosRef.current = sugeridosRef.current.filter(t => t !== actual)
      setSugeridos(sugeridosRef.current)
    }
    const pendientes = sugeridosRef.current
    const cuerpo: Config = { ...c }
    for (const t of pendientes) delete (cuerpo as unknown as Record<string, unknown>)[t]
    if (datos?.miIA) for (const t of pendientes) if ((datos.miIA as unknown as Record<string, unknown>)[t] !== undefined) (cuerpo as unknown as Record<string, unknown>)[t] = (datos.miIA as unknown as Record<string, unknown>)[t]
    const json = JSON.stringify(cuerpo)
    if (json === ultimoGuardado.current) return colaGuardar.current
    setGuardando(true); setError(null)
    const p = colaGuardar.current.then(async () => {
      const r = await fetch('/api/mi-ia', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json }).catch(() => null)
      const d = await r?.json().catch(() => ({}))
      setGuardando(false)
      if (!r?.ok) { setError(d?.error ?? 'No se pudo guardar (revisa tu conexión)'); return false }
      ultimoGuardado.current = json
      setGuardadoOk(true)
      if (timerOk.current) clearTimeout(timerOk.current)
      timerOk.current = setTimeout(() => setGuardadoOk(false), 1800)
      return true
    })
    colaGuardar.current = p
    return p
  }
  // 11-11 (el dueño): moverse entre temas con un toque (barra de temas, Anterior / Siguiente con su nombre). Al moverse se
  // guarda el tema actual; null = volver a la página de Mi IA.
  // Entre temas se pasa al instante y se guarda por detrás; si no se pudo guardar, vuelve al tema con el aviso.
  // 12-11 (el dueño: "no debería dejarlo salir hasta que revise y complete los temas"): con temas que llenó el sistema y
  // nadie revisó NO se sale (lo lleva al primero); con temas vacíos avisa cuáles y deja «Salir igual» (para volver otro día).
  const [freno, setFreno] = useState<{ tipo: 'revisar' | 'vacios'; temas: string[] } | null>(null)
  const ir = async (destino: number | null, salirIgual = false) => {
    if (destino === null) {
      const actualId = paso !== null ? PASOS[paso].id : null
      const sinRevisar = sugeridosRef.current.filter(t => t !== actualId)
      if (sinRevisar.length) {
        setFreno({ tipo: 'revisar', temas: sinRevisar })
        return ir(PASOS.findIndex(p => p.id === sinRevisar[0]))
      }
      const vacios = PASOS.filter(p => !p.lleno(c)).map(p => p.id)
      if (vacios.length && !salirIgual) {
        setFreno({ tipo: 'vacios', temas: vacios })
        if (paso !== null && !vacios.includes(PASOS[paso].id)) return ir(PASOS.findIndex(p => p.id === vacios[0]))
        return
      }
      setFreno(null)
      if (!(await guardar())) return
      setPaso(null); setUnaSola(false); cargar()
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const desde = paso
    const g = guardar()
    const r = ruta.includes(destino) ? ruta : TODOS
    if (r !== ruta) setRuta(r)
    setDir(desde === null || r.indexOf(destino) > r.indexOf(desde) ? 'adelante' : 'atras')
    setPaso(destino)
    // Solo sube si el comienzo del tema quedó fuera de la vista (no salta cuando ya se ve).
    requestAnimationFrame(() => {
      const top = tarjeta.current?.getBoundingClientRect().top
      if (top !== undefined && top < 8) tarjeta.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
    if (!(await g) && desde !== null) { setDir('atras'); setPaso(desde) }
  }
  useEffect(() => {
    if (paso !== null) document.getElementById(`tema-${PASOS[paso].id}`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [paso])
  // Si cierra la pestaña con temas sugeridos sin revisar, el navegador pregunta (esos temas todavía no están guardados).
  useEffect(() => {
    if (paso === null || !sugeridos.length) return
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [paso, sugeridos.length])
  // El aviso de freno se va solo cuando ya no queda nada de lo que avisaba.
  useEffect(() => {
    if (!freno) return
    const quedan = freno.tipo === 'revisar' ? freno.temas.filter(t => sugeridos.includes(t)) : freno.temas.filter(t => !PASOS.find(p => p.id === t)!.lleno(c))
    if (!quedan.length) setFreno(null)
    else if (quedan.length !== freno.temas.length) setFreno({ ...freno, temas: quedan })
  }, [freno, sugeridos, c])

  if (error && !datos) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
  if (!datos) return <p className="text-sm text-neutral-500">Cargando…</p>

  const aviso = <p className="text-xs text-neutral-500">Esto lo usa la IA en <b>Preguntas</b> y en <b>Mensajes</b>.</p>

  // Cuestionario
  if (paso !== null) {
    const p = PASOS[paso]
    const pos = Math.max(0, ruta.indexOf(paso)), ultimo = pos === ruta.length - 1
    const anterior = pos > 0 ? ruta[pos - 1] : null, proximo = ultimo ? null : ruta[pos + 1]
    const recorrido = ruta.length < PASOS.length   // «Continuar» con solo los que faltan
    // 11-11 (el dueño): sin «Cancelar» (confundía: solo descartaba el tema actual). Si cambió algo de este tema y se
    // arrepiente, «Deshacer cambios de este tema» lo deja como está guardado.
    const guardadoTema = (() => { try { return ultimoGuardado.current ? (JSON.parse(ultimoGuardado.current) as Record<string, unknown>)[p.id] : undefined } catch { return undefined } })()
    const actualTema = (c as unknown as Record<string, unknown>)[p.id]
    const cambiado = !sugeridos.includes(p.id) && JSON.stringify(actualTema ?? null) !== JSON.stringify(guardadoTema ?? null)
    const deshacer = () => setC(prev => {
      const n = { ...prev } as unknown as Record<string, unknown>
      if (guardadoTema === undefined) delete n[p.id]; else n[p.id] = guardadoTema
      return n as unknown as Config
    })
    return (
      <div className="max-w-3xl space-y-3">
        {/* Todos los temas a la vista: tocar uno guarda el actual y salta a ese. */}
        <nav aria-label="Temas de Mi IA" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {PASOS.map((t, i) => {
            // 12-11: lo que llenó el sistema y nadie revisó NO sale con ✓: punto azul «por revisar».
            const revisar = sugeridos.includes(t.id) && !(i === paso)
            const ok = t.lleno(c) && !revisar, actual = i === paso
            return (
              <button key={t.id} id={`tema-${t.id}`} type="button" onClick={() => !actual && ir(i)}
                aria-current={actual ? 'step' : undefined} title={revisar ? 'Lo llené con lo que ya respondes: pasa por aquí para revisarlo' : undefined}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
                  actual ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
                  : revisar ? 'border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100'
                  : ok ? 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'
                  : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'}`}>
                {ok || (actual && t.lleno(c)) ? <span className={actual ? 'text-emerald-300' : 'text-emerald-600'}>✓</span>
                  : revisar ? <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-label="por revisar" />
                  : <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="falta" />}
                {t.tema}
              </button>
            )
          })}
        </nav>
        {sugeridos.filter(t => t !== p.id).length > 0 && !freno && (
          <p className="flex items-center gap-1.5 text-xs text-sky-800"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden="true" />
            Los temas en azul los llené con lo que ya respondes: pasa por cada uno para revisarlo y guardarlo.</p>
        )}
        {freno && (
          <div role="alert" className={`aparecer flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 text-sm ${freno.tipo === 'revisar' ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            <span className="min-w-0 flex-1">
              {freno.tipo === 'revisar'
                ? <>Antes de salir revisa {freno.temas.length === 1 ? 'el tema' : `los ${freno.temas.length} temas`} que llené con lo que ya respondes: <b>{freno.temas.map(t => PASOS.find(x => x.id === t)!.tema).join(', ')}</b>. Si está bien, solo pasa al siguiente.</>
                : <>Te {freno.temas.length === 1 ? 'falta 1 tema' : `faltan ${freno.temas.length} temas`} para poder encender la IA: <b>{freno.temas.map(t => PASOS.find(x => x.id === t)!.tema).join(', ')}</b>.</>}
            </span>
            {freno.tipo === 'vacios' && (
              <button type="button" onClick={() => ir(null, true)} className="shrink-0 text-xs font-medium underline underline-offset-2">Salir igual y completar después</button>
            )}
          </div>
        )}
        <div ref={tarjeta} className="scroll-mt-4 overflow-x-clip rounded-xl border border-neutral-200 bg-white shadow-sm">
          {/* Avance: una rayita por tema del recorrido (la actual más oscura); se llena con transición. */}
          <div className="flex gap-1 px-5 pt-4" aria-hidden="true">
            {ruta.map((t, i) => (
              <span key={t} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i < pos ? 'bg-neutral-400' : i === pos ? 'bg-neutral-900' : 'bg-neutral-200'}`} />
            ))}
          </div>
          <div className="space-y-4 p-5 pt-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-neutral-500">{p.tema} · {pos + 1} de {ruta.length}{recorrido ? ' que faltan' : ''}</p>
              <span className="h-4 shrink-0 text-xs" aria-live="polite">
                {guardando ? <span className="aparecer text-neutral-400">Guardando…</span>
                  : guardadoOk ? <span className="aparecer text-emerald-600">Guardado ✓</span> : null}
              </span>
            </div>
            <div key={paso} className={`space-y-4 ${dir === 'adelante' ? 'tema-adelante' : 'tema-atras'}`}>
              <h2 className="-mt-3 text-lg font-semibold text-neutral-900">{p.titulo}</h2>
              {sugeridos.includes(p.id) && sug && <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
                Sugerido de lo que ya respondes ({ddmm(sug.fecha)}). Revísalo y cámbialo si hace falta; se guarda al pasar a otro tema.</p>}
              {/* 12-11: la diferencia entre fuentes que la IA ya resolvió, solo en su tema y en una línea. */}
              {sugeridos.includes(p.id) && sug?.avisos.filter(a => a.tema === p.id).map((a, i) => (
                <p key={i} className="-mt-2 flex gap-1.5 text-xs text-neutral-500"><span aria-hidden="true">ℹ︎</span><span>{a.texto}</span></p>
              ))}
              <Pantalla id={p.id} c={c} set={f => setC(f)} pais={datos.pais} />
            </div>
            {error && <p className="aparecer rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {cambiado && (
              <button type="button" onClick={deshacer}
                className="aparecer inline-flex items-center gap-1 text-xs text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline">
                <span aria-hidden="true">↺</span> Deshacer cambios de este tema</button>
            )}
          </div>
          {/* Botones siempre a mano: quedan pegados abajo de la pantalla mientras el tema es largo. */}
          <div className="sticky bottom-0 z-10 flex items-center gap-2 rounded-b-xl border-t border-neutral-100 bg-white/95 px-3 py-3 backdrop-blur sm:px-5">
            {anterior !== null ? (
              <button type="button" onClick={() => ir(anterior)} title={`Volver a ${PASOS[anterior].tema}`}
                className="inline-flex h-10 min-w-0 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.98]">
                <span aria-hidden="true">←</span><span className="hidden truncate sm:inline">{PASOS[anterior].tema}</span><span className="sm:hidden">Atrás</span></button>
            ) : <span className="hidden sm:block" />}
            <div className="ml-auto flex min-w-0 items-center gap-2">
              {proximo !== null && (
                <button type="button" onClick={() => ir(null)} disabled={guardando} title="Guarda lo que cambiaste y vuelve a Mi IA"
                  className="h-10 shrink-0 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.98] disabled:opacity-50">
                  <span className="hidden sm:inline">Guardar y salir</span><span className="sm:hidden">Salir</span></button>
              )}
              <button type="button" onClick={() => ir(proximo)}
                className="inline-flex h-10 min-w-0 items-center gap-1.5 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white transition hover:bg-neutral-800 active:scale-[0.98]">
                {proximo !== null ? <><span className="truncate">{PASOS[proximo].tema}</span><span aria-hidden="true">→</span></> : 'Guardar y terminar'}</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Primera vez
  if (!datos.miIA) return (
    <div className="max-w-xl rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-3">
      <h2 className="text-lg font-semibold text-neutral-900">Configura tu IA</h2>
      <p className="text-sm text-neutral-600">Unos 4 minutos: {PASOS.length} pantallas cortas sobre cómo trabajas (envío, pago, tono, límites). Con eso la IA responde como tú en Preguntas y en Mensajes.</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="button" onClick={() => sugerir(true)} disabled={sugiriendo} className="w-full px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm disabled:opacity-50">
        {sugiriendo ? 'Leyendo tus respuestas y descripciones… (unos segundos)' : 'Empezar con lo que ya respondo (recomendado)'}</button>
      <p className="text-xs text-neutral-500 -mt-1">Lee tus últimas respuestas y lo que repites en tus descripciones, y te propone cada tema. Tú lo revisas.</p>
      <button type="button" onClick={() => recorrer(TODOS)} disabled={sugiriendo} className="w-full px-4 py-2 rounded-lg border border-neutral-300 text-sm">Empezar vacío</button>
    </div>
  )


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
      {pase && <PasarPoliticas c={c} pase={pase} onCerrar={() => setPase(null)} onListo={() => { setPase(null); cargar() }} />}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {PASOS.map((p, i) => {
          const ok = p.lleno(c), r = ok ? resumen(p.id, c) : ''
          return <button key={p.id} type="button" onClick={() => { setRuta(TODOS); setUnaSola(true); setPaso(i) }}
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
      <div className="grid gap-4 lg:grid-cols-2 items-start">
      <Prueba tipo="preguntas" encendida={datos.iaAuto === null ? null : datos.iaAuto === 'real'} todo={!!datos.iaTodo} onCambio={cargar} abrir={abrirTema}
        quedan={datos.pruebas ? datos.pruebas.preguntas : null} faltan={faltan.map(i => PASOS[i].tema)} />
      {datos.msgPronto ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 p-4 space-y-2" aria-disabled="true">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-neutral-500">Mensajes</p>
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">Próximamente</span>
          </div>
          <p className="text-sm text-neutral-500">Las respuestas automáticas en Mensajes (después de la venta) las estamos afinando. Por ahora la IA responde sola en <b>Preguntas</b>; en Mensajes puedes seguir usando «Proponer con IA».</p>
          <button type="button" disabled className="w-full cursor-not-allowed rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-400">Encender en Mensajes</button>
        </div>
      ) : (
      <Prueba tipo="mensajes" encendida={datos.msgAuto ?? null} todo={!!datos.msgTodo} onCambio={cargar} abrir={abrirTema}
        quedan={datos.pruebas ? datos.pruebas.mensajes : null} faltan={faltan.map(i => PASOS[i].tema)} />
      )}
      </div>
      {(datos.iaAuto !== null || datos.msgAuto != null) && <FrenosIA inicial={frenosInicial} preguntas={datos.iaAuto !== null} mensajes={datos.msgAuto != null} />}
    </div>
  )
}
