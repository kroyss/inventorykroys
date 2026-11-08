// Mi IA (06-11-2026, plan acordado con el dueño): las REGLAS DEL NEGOCIO que usa la IA en Preguntas y en Mensajes,
// contestadas en un cuestionario paso a paso (núcleo de 10 pantallas) en vez de un texto libre.
//
// Tres cajones (cada dato vive en uno solo):
//   1. Mi IA (esto)                  → reglas del negocio: envío, pago, tono, límites. Manda en lo del negocio.
//   2. Respuestas rápidas / Al comprar → textos listos de cada módulo (ejemplo de cómo escribe el vendedor).
//   3. Lo de cada producto           → descripción, ficha, lo aprendido. Manda en lo del producto.
//
// Se guarda en app_settings.mi_ia (JSON, por empresa). Las "Políticas para la IA" (preguntas_politicas, texto libre)
// siguen valiendo: van después como "otras indicaciones". Sin mi_ia guardado, todo funciona como antes.
// En prueba solo con el módulo 'mi_ia' (SolucionesMC); la IA lo lee si está guardado.
import type { Pool } from 'pg'

export type Agencia = { nombre: string; gratis: boolean }

export interface MiIA {
  version: 1
  actualizado?: string
  tono?: { saludo?: string; despedida?: string; trato?: 'tu' | 'usted' }
  oferta?: { texto?: string; cuando?: 'siempre' | 'primera' | 'precio' }
  pago?: { tasa?: string; medios?: string[]; divisas?: { pct: number; medios?: string[] } | null }
  envio?: { agencias?: Agencia[]; minimo?: { precioMenor: number; unidades: number } | null }
  despacho?: { dias?: string; corte?: string | null; sabados?: boolean }
  ubicacion?: { zona?: string; decir?: boolean; retiro?: 'no' | 'acuerdo' | 'horario'; retiroHorario?: string }
  factura?: { tipo?: 'fiscal' | 'nota' | 'no'; garantiaDias?: number | null; garantiaNoCubre?: string }
  /** Qué hace si no sabe un dato técnico, en orden de preferencia. */
  desconocido?: ('verificar' | 'preguntar' | 'recomendar' | 'persona')[]
  /** Temas que van siempre a una persona. */
  persona?: string[]
  postventa?: { pasos?: string[]; datosPago?: string; noAplica?: boolean }   // noAplica: "no hace falta nada" (cuenta como completo)
  // 07-11 (Fase 2 de docs/analisis-mercasist.md): temas que en VE se preguntan mucho y no tenían dónde ir.
  cambios?: { acepta?: 'si' | 'falla' | 'no'; dias?: number | null; envio?: 'comprador' | 'nosotros' | 'depende' }
  negocio?: { mayor?: 'escribir' | 'mismo'; mayorDesde?: number | null; regateo?: 'fijo' | 'consultar'; apartar?: 'no' | 'si'; apartarHoras?: number | null }
  atencion?: { horario?: string }
  /** Información extra por secciones: la IA la recibe SOLO si la pregunta o el mensaje trata de eso (título o palabras). */
  extras?: { titulo: string; texto: string; palabras?: string }[]
  extrasNoAplica?: boolean
}

export const MI_IA_KEY = 'mi_ia'

export function leerMiIA(json: string | null | undefined): MiIA | null {
  try {
    const v = JSON.parse(json ?? '')
    return v && typeof v === 'object' && v.version === 1 ? v as MiIA : null
  } catch { return null }
}

/** Teléfono, correo o link (MercadoLibre borra o sanciona las respuestas que los tienen). */
export const datoDeContacto = (s?: string | null) =>
  !!s && (/\d[\d\s.-]{8,}\d/.test(s) || /@|https?:|www\.|\.com\b|wa\.me|whats?app|instagram|telegram/i.test(s))

const lista = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`
const limpio = (s?: string | null) => (s ?? '').trim()

const DESCONOCIDO: Record<NonNullable<MiIA['desconocido']>[number], string> = {
  verificar: 'decir que lo verificamos y le confirmamos',
  preguntar: 'preguntarle el modelo o para qué lo necesita',
  recomendar: 'recomendar otra publicación nuestra que sí lo cumpla (solo si cumple con certeza)',
  persona: 'dejarla para una persona (confianza "baja")',
}

/** Mi IA escrita como políticas para la IA. `modulo` decide si va la parte post-venta. */
const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** ¿La sección extra trata de lo que preguntan? Sus palabras (separadas por coma) o las palabras de 4+ letras del título. */
export function extraAplica(x: { titulo: string; palabras?: string }, consulta: string) {
  const q = sinTildes(consulta)
  const claves = [...(x.palabras ?? '').split(','), ...x.titulo.split(/\s+/)].map(w => sinTildes(w.trim())).filter(w => w.length >= 4)
  return claves.some(w => q.includes(w))
}

/** Mi IA escrita como políticas para la IA. `modulo` decide si va la parte post-venta. `consulta` (la pregunta o el mensaje)
 *  elige las secciones de información extra; sin ella van todas. */
export function textoMiIA(c: MiIA, modulo: 'preguntas' | 'mensajes', consulta?: string): string {
  const S: string[] = []
  const sec = (titulo: string, ls: (string | number | null | false | undefined)[]) => {
    const l = ls.filter((x): x is string => typeof x === "string" && !!x)
    if (l.length) S.push(`${titulo}\n${l.map(x => `- ${x}`).join('\n')}`)
  }
  const t = c.tono ?? {}
  sec('CÓMO RESPONDER', [
    limpio(t.saludo) && `Empieza con "${limpio(t.saludo)}".`,
    limpio(t.despedida) && `Termina con "${limpio(t.despedida)}".`,
    t.trato && (t.trato === 'usted' ? 'Trata al comprador de usted.' : 'Tutea al comprador.'),
    'Sin emojis.',
  ])
  const o = c.oferta
  if (limpio(o?.texto)) sec('MENCIONAR SIEMPRE', [
    `"${limpio(o!.texto)}" — ` + (o!.cuando === 'primera' ? 'solo en la primera respuesta a ese comprador.'
      : o!.cuando === 'precio' ? 'solo si pregunta por precio o pago.' : 'en todas las respuestas, en pocas palabras.'),
  ])
  const p = c.pago ?? {}
  sec('PRECIO Y PAGO', [
    limpio(p.tasa) && `El precio es el publicado, a ${limpio(p.tasa)}.`,
    p.medios?.length && `Medios de pago: ${lista(p.medios)}.`,
    p.divisas && p.divisas.pct > 0 && `Descuento de ${p.divisas.pct}% pagando en divisas${p.divisas.medios?.length ? ` (${lista(p.divisas.medios)})` : ''}.`,
  ])
  const e = c.envio ?? {}
  const gratis = (e.agencias ?? []).filter(a => a.gratis).map(a => a.nombre)
  const destino = (e.agencias ?? []).filter(a => !a.gratis).map(a => a.nombre)
  const d = c.despacho ?? {}
  sec('ENVÍOS', [
    gratis.length && `Envío gratis por ${lista(gratis)}, al llenar el formulario de MercadoLibre.`,
    destino.length && `${lista(destino)}: cobro a destino.`,
    e.minimo && `Productos de menos de $${e.minimo.precioMenor}: mínimo ${e.minimo.unidades} unidades para que se active el envío gratis. Dilo SIEMPRE al confirmar disponibilidad, precio o envío de esos productos, aunque no lo pregunten.`,
    limpio(d.dias) && `Despachamos ${limpio(d.dias)}${d.sabados === false ? ' (los sábados no)' : ''}.`,
    d.corte ? `Si paga y llena el formulario antes de las ${d.corte}, sale el mismo día; si no, al siguiente día hábil.` : null,
  ])
  const u = c.ubicacion ?? {}
  sec('UBICACIÓN Y RETIRO', [
    limpio(u.zona) && (u.decir === false ? 'No digas dónde estamos (ni ciudad ni zona).' : `Estamos en ${limpio(u.zona)}. Nunca des la dirección exacta.`),
    u.retiro === 'no' ? 'No hay retiro personal: solo envíos.'
      : u.retiro === 'acuerdo' ? 'Retiro personal disponible previo acuerdo; al comprar recibe nuestros datos.'
      : u.retiro === 'horario' ? `Retiro personal${limpio(u.retiroHorario) ? ` en este horario: ${limpio(u.retiroHorario)}` : ''}; al comprar recibe nuestros datos.` : null,
  ])
  const f = c.factura ?? {}
  sec('FACTURA Y GARANTÍA', [
    f.tipo === 'fiscal' ? 'Sí emitimos factura fiscal.' : f.tipo === 'nota' ? 'Emitimos nota de entrega (no factura fiscal).' : f.tipo === 'no' ? 'No emitimos factura.' : null,
    f.garantiaDias ? `Garantía de ${f.garantiaDias} días${limpio(f.garantiaNoCubre) ? `; no cubre ${limpio(f.garantiaNoCubre)}` : ''}.` : null,
  ])
  if (c.desconocido?.length) sec('SI NO SABES UN DATO DEL PRODUCTO', [
    `En este orden de preferencia: ${c.desconocido.map(x => DESCONOCIDO[x]).join('; si no aplica, ')}.`,
    'Nunca inventes el dato.',
  ])
  if (c.persona?.length) sec('SIEMPRE LO RESPONDE UNA PERSONA', [
    `${lista(c.persona).replace(/^./, x => x.toUpperCase())}: no lo respondas tú, deja confianza "baja".`,
  ])
  const cb = c.cambios ?? {}
  sec('CAMBIOS Y DEVOLUCIONES', [
    cb.acepta === 'si' ? `Aceptamos cambios o devoluciones${cb.dias ? ` dentro de ${cb.dias} días de recibido` : ''}.`
      : cb.acepta === 'falla' ? `Solo cambiamos por falla de fábrica${cb.dias ? ` (dentro de ${cb.dias} días de recibido)` : ''}.`
      : cb.acepta === 'no' ? 'No aceptamos cambios ni devoluciones, salvo lo que cubre MercadoLibre.' : null,
    cb.acepta && cb.acepta !== 'no' && cb.envio ? (cb.envio === 'comprador' ? 'El envío del cambio o la devolución lo paga el comprador.'
      : cb.envio === 'nosotros' ? 'El envío del cambio o la devolución lo pagamos nosotros.' : 'Quién paga el envío del cambio se ve en cada caso.') : null,
  ])
  const ng = c.negocio ?? {}
  sec('AL MAYOR, REBAJAS Y APARTADOS', [
    ng.mayor === 'escribir' ? `Ventas al mayor${ng.mayorDesde ? ` (desde ${ng.mayorDesde} unidades)` : ''}: dile que con gusto, que pregunte por la cantidad que necesita y lo coordinamos.`
      : ng.mayor === 'mismo' ? 'No hay precio al mayor: el precio es el mismo por unidad.' : null,
    ng.regateo === 'fijo' ? 'El precio es fijo: no hay rebaja. Nunca inventes descuentos.'
      : ng.regateo === 'consultar' ? 'Si pide rebaja, no prometas ninguna: dile que lo consultamos.' : null,
    ng.apartar === 'no' ? 'No apartamos productos: se asegura comprando.'
      : ng.apartar === 'si' ? `Se puede apartar un producto${ng.apartarHoras ? ` por ${ng.apartarHoras} horas` : ''}.` : null,
  ])
  if (limpio(c.atencion?.horario)) sec('HORARIO DE ATENCIÓN', [
    `Atendemos ${limpio(c.atencion!.horario)}. Si preguntan cuándo respondemos o escriben fuera de ese horario, dilo.`,
  ])
  const ex = (c.extras ?? []).filter(x => limpio(x.titulo) && limpio(x.texto) && (consulta === undefined || extraAplica(x, consulta)))
  if (ex.length) S.push(`INFORMACIÓN EXTRA DEL VENDEDOR (úsala solo si responde lo que preguntan)\n${ex.map(x => `- ${limpio(x.titulo)}: ${limpio(x.texto)}`).join('\n')}`)
  if (modulo === 'mensajes') {
    const pv = c.postventa ?? {}
    sec('DESPUÉS DE LA COMPRA', [
      pv.pasos?.length && `Lo que tiene que hacer el comprador: ${lista(pv.pasos)}.`,
      limpio(pv.datosPago) && `Datos para pagar (cópialos EXACTOS, sin cambiar nada): ${limpio(pv.datosPago)}`,
    ])
  }
  return S.join('\n\n')
}

/** Lo que la IA recibe como POLÍTICAS DEL VENDEDOR: Mi IA (si está guardada) + el texto libre de siempre. */
export async function politicasIA(db: Pick<Pool, 'query'>, modulo: 'preguntas' | 'mensajes', consulta?: string): Promise<{ texto: string; miIA: MiIA | null }> {
  const { rows } = await db.query(`SELECT key, value FROM app_settings WHERE key = ANY($1)`, [[MI_IA_KEY, 'preguntas_politicas']])
  const libre = limpio(rows.find(r => r.key === 'preguntas_politicas')?.value)
  const miIA = leerMiIA(rows.find(r => r.key === MI_IA_KEY)?.value)
  const estructurado = miIA ? textoMiIA(miIA, modulo, consulta) : ''
  const texto = !estructurado ? libre
    : `${estructurado}${libre ? `\n\nOTRAS INDICACIONES DEL VENDEDOR (si chocan con lo de arriba, manda lo de arriba):\n${libre}` : ''}`
  return { texto, miIA }
}
