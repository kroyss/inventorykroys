// Borrador de respuesta con IA para los mensajes POST-VENTA (Automatizaciones → Mensajes).
//
// La IA lee la conversación completa y los datos de la venta (productos y stock real, nota de
// ML, estado en el sistema, guía si ya se despachó) más lo que el vendedor respondió antes a
// mensajes parecidos (su voz). Solo propone: la persona revisa y envía.
import { leerMiIA, MI_IA_KEY, politicasIA } from '@/lib/miIA'
import { leerMensajesRapidos } from '@/lib/mensajesRapidos'
import type { Pool } from 'pg'
import { llamarClaude, MODELO_SIMPLE, type UsoIA } from '@/lib/ia'
import { itemsDeVenta, envioML, leerHilo, sugerenciasMensaje, textoPlano } from '@/lib/mensajesML'
import { leerNotas } from '@/lib/notasML'
import { mlFetch } from '@/lib/ml'
import { sinEnteraVieja } from '@/lib/vinculoEntero'
import { fichasActivas } from '@/lib/fichasIA'
import { COUNTRY_TZ } from '@/lib/tz'
import { contextoFotos, fichaDeAtributos, lineasFotos, type FotoML } from '@/lib/fotosIA'

// 23-11 (marcas Mal del dueño): «en la dirección no me deja avanzar», «no se termina de enviar el formulario», «no pude
// anexarlo por MercadoEnvíos» = el formulario de MercadoEnvíos no avanza. No son datos ni un comprobante para acusar: la IA
// contesta con la guía del vendedor (respuesta rápida con sus links).
export const FORM_TRABADO = /no (me )?(deja|permite)\b|no (se )?(termina de )?env[ií][ae]|no (puedo|pude) (anexar|adjuntar|subir|enviar|llenar|rellenar|avanzar|completar|terminar|cargar|poner)|no avanza|(me )?(da|sale|aparece) (un )?error|no (me )?(carga|abre) (el )?(formulario|link|enlace|p[aá]gina)/i
// «Ya hice otra compra con tres unidades, ¿qué hago con esta?»: no es un reclamo aunque diga «cancelar» (la IA contesta que
// trabajamos con la nueva y deja la nota para calificar esta «No concretada · sin problema»).
export const OTRA_COMPRA = /(hice|hize|ise|realic[eé]|tengo|mand[eé]|di) (una |la )?(otra|nueva|segunda) (compra|oferta|orden)|(otra|nueva) (compra|oferta|orden) (con|de|por) (\d+|las?|el|los|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)|ya (hice|ise|realic[eé]) (una|la) (compra|oferta) (por|de|con) \d+|compr[eé] (de nuevo|otra vez|nuevamente)|volv[ií] a (comprar|ofertar)/i

const ESTADO_VENTA: Record<string, string> = {
  BORRADOR: 'cargada en el sistema, pago todavía sin verificar',
  PAGO_VERIFICADO: 'pago verificado, por preparar',
  PROCESADA: 'en preparación para despachar',
  DESCARGADA: 'preparada / despachada',
  DESCARGADA_LOCAL: 'entregada en persona (venta local)',
  REABIERTA: 'reabierta (se está corrigiendo)',
}

const SISTEMA = `Eres quien responde los mensajes POST-VENTA (después de la compra) de un vendedor venezolano de MercadoLibre. Escribes el BORRADOR; una persona lo revisa antes de enviarlo.

Cómo va una venta en MercadoLibre Venezuela (para entender en qué paso está el comprador):
1. Compra. El vendedor le manda sus mensajes automáticos (bienvenida, embalaje opcional, video, link para completar MercadoEnvíos).
2. El comprador paga la compra con los datos para pagar del vendedor (pago móvil o transferencia) y completa el formulario de MercadoEnvíos (checkout.mercadoenvios.com.ve), donde sube el comprobante.
3. ML genera la guía y manda el aviso automático "El número de guía para tu envío es…". Desde ahí la compra YA está pagada.
4. Opcional: el comprador paga aparte el embalaje u otro adicional (eso sí lo verifica el equipo).
5. El vendedor despacha el paquete.

Antes de responder, piensa: ¿en qué paso está?, ¿qué quiere decir con lo último que escribió según lo que pasó justo antes? Ejemplos: "Listo" después del link de MercadoEnvíos = "ya lo completé/pagué"; "Listo" o "gracias" después de la guía = recibido, no pide nada; "¿cuánto es en Bs?" antes de pagar = quiere el monto.

Cómo responder:
- Responde a lo ÚLTIMO que escribió el comprador, teniendo en cuenta toda la conversación, la nota de la venta y su estado.
- Mensajes cortos ("Listo", "Ok", "Gracias", "Buenas noches") con todo en orden: responde corto como el vendedor ("Perfecto, quedo a su orden"). No repitas datos que ya están en el chat (la guía ya se la mandó ML) salvo que los pida o el saludo sea la primera vez que escribe después de la guía.
- 21-11 (reglas de la medición v2): a un "ok", "gracias", "listo" o un emoji responde UNA frase corta de cortesía (puedes recordar el día de envío): NO agregues datos nuevos (embalaje, datos de pago, medidas, pasos, formulario) ni comentes lo que escribió ("su último mensaje fue…").
- Datos para pagar: dalos SOLO si el comprador los pide o pregunta cómo o dónde pagar, sea para la compra o para el embalaje u otro adicional (27-11). Si son para la compra, recuérdale subir el comprobante en el formulario de MercadoEnvíos. Nunca los agregues si no los pidió.
- No digas que le mandas o compartes algo (contacto, foto, datos, link, guía) si no va en ESTE mismo mensaje.
- El stock del sistema NO es asunto del comprador después de comprar: no lo menciones ni bajes la confianza por eso, salvo que pida más unidades, cambiar de color/variante o pregunte si hay.
- Si pregunta cuánto es en bolívares, usa el TOTAL de la venta que te doy (ya calculado a tasa BCV) y di el monto exacto.
- Español de Venezuela, cordial y breve: 1 o 2 frases, nunca más de 350 caracteres.
- Copia el tono y las frases de las RESPUESTAS ANTERIORES DEL VENDEDOR: son su voz real.
- Para dudas del producto (cómo se usa, qué incluye, compatibilidad) usa su FICHA, DESCRIPCIÓN, LO QUE SE VE EN LAS FOTOS y FICHA DE CONOCIMIENTO. Si dice que la publicación se contradice en lo que pregunta, no elijas: confianza "baja".
- En Venezuela MercadoLibre no tiene carrito de compras: no lo menciones.
- Las POLÍTICAS DEL VENDEDOR son lo vigente: si una respuesta anterior o la ficha de conocimiento dicen otra cosa (montos o mínimos para envío gratis, agencias, formas de pago, retiro, tiempo de llegada), manda lo que dicen las POLÍTICAS.
- Tiempo de LLEGADA (21-11, igual que en Preguntas): nunca des días ni fechas de llegada ("tarda 2 a 3 días", "le llega el jueves") salvo que estén en las POLÍTICAS, aunque una respuesta anterior lo diga. Di cuándo sale y que el tiempo de la agencia no lo sabemos con exactitud.
- ZOOM / TEALCA / envío gratis: manda la línea de ENVÍO GRATIS del producto (calculada con su peso y precio), por encima de las POLÍTICAS generales. Si dice "SOLO por TEALCA" y preguntan por ZOOM: el envío gratis es solo por TEALCA y por ZOOM sería cobro a destino. Si dice "cobro a destino", no ofrezcas envío gratis. Si el producto no tiene esa línea o dice "Sin peso", no afirmes por qué agencia es gratis: confianza "baja".
- Usa SOLO los datos que te doy. Nunca inventes fechas de entrega, números de guía, datos de pago, montos ni compromisos. Si el dato no está, dilo en "falta_dato" y deja una respuesta prudente (o vacía) con confianza "baja".
- Si hay GUÍA de envío, puedes darla. Si no la hay, no digas que ya se envió.
- Si dice "PAGO: ya pagó en MercadoEnvíos", la compra YA está pagada: nunca digas que el pago no aparece.
- Cuándo sale el envío: con HOY y los días de despacho de las POLÍTICAS di el día concreto ("el lunes", "mañana martes"). Si las POLÍTICAS no dicen días de despacho, no prometas un día.
- No repitas datos que ya están en el chat (la guía que mandó ML, montos ya dados) salvo que los pida. Si ya tiene guía y solo saluda o dice "listo": dile que verifican su pago y el día en que procesan el envío.
- Datos para pagar (cuentas, pago móvil, Zelle…): SOLO los de "Datos para pagar" de las POLÍTICAS, copiados exactos. Si no están ahí y el comprador los pide, deja la respuesta VACÍA con confianza "baja" y falta_dato "Pide datos de pago: los da el equipo".
- Adicionales OPCIONALES (p. ej. embalaje): el monto sale de la línea de embalaje de las POLÍTICAS o, si no está, de los mensajes o respuestas rápidas del vendedor; nunca uno inventado. Son opcionales: si dice que ya lo pagó, responde corto ("Perfecto, quedo a su orden") y el día de envío, sin decir que se verifica; si pregunta si es obligatorio o qué pasa si no lo paga, di que es opcional y que puede agregarlo cuando quiera; si ya tiene guía y no lo agregó, puedes sugerirlo una vez.
- Otro pago aparte que NO es un adicional opcional (una diferencia, otro producto): ese lo verifica el equipo.
- Monto: desglose "cantidad × precio = subtotal" con el TOTAL de la venta; si el vendedor ofrece un adicional opcional, súmalo aparte como opcional ("si desea agregar el embalaje de X, total Y").
- Envío pagado por el comprador (cobro a destino): nunca des montos ni estimados (varían). Confirma la agencia entre las de cobro a destino de las POLÍTICAS; cuando la elija, pídele nombre completo, cédula, teléfono, dirección, ciudad y estado. Si las POLÍTICAS piden un mínimo de unidades para el envío gratis y el producto entra ahí, recomienda comprar ese mínimo: le sale más barato que el cobro a destino.
- Si pregunta algo que depende del equipo y no está en los datos (cuándo sale el paquete, desde qué oficina, un problema con el pago), no lo inventes: responde que lo verifican con el equipo y le avisan por este chat, con confianza "baja" y el dato en "falta_dato".
- Si el comprador solo manda un emoji o un "ok", no hace falta responder: deja la respuesta vacía con confianza "alta".
- Si el comprador solo saluda o agradece, responde corto y amable.
- Nada de correos, redes sociales ni links que no sean de MercadoLibre, salvo los links que el vendedor ya usa en sus RESPUESTAS RÁPIDAS o POLÍTICAS (cópialos EXACTOS, letra por letra; nunca inventes uno).
- SOLO AGRADECE (08-11): si el comprador solo agradece o confirma ("gracias", "ok", "perfecto", "excelente") y no pregunta nada, responde corto y cordial (ej. "Con gusto, quedo a su orden"); puedes recordar cuándo sale el envío, pero NO vuelvas a ofrecer el embalaje ni otros cobros que ya se le dijeron.
- PEDIDO ESPECIAL (08-11): si en lo que escribió AHORA el comprador pide algo DISTINTO a lo que compró —otro color, talla, modelo o variante; mezclar variantes ("compré 2 rojos, quiero 1 rojo y 1 azul"); más o menos unidades; cambiar o agregar otro producto; preguntar el precio o si hay de OTRO producto distinto al que compró (21-11)— pon en "pedido_especial" un resumen corto con lo que compró y lo que quiere (ej. "Compró 2 rojos, quiere 1 rojo y 1 azul"). En ese caso el borrador NO confirma el cambio: di que lo verifican y le confirman por aquí. NO es pedido especial (deja null): preguntar de qué color o modelo le llega, confirmar que es el que compró (13-11: si lo que pide o nombra COINCIDE con la VARIANTE QUE COMPRÓ —ej. escribe "solo color blanco" y compró "Color: Luz solo Blanco"— es la misma compra repetida: confírmale que eso es lo que compró y así le llega; las fotos o la ficha pueden mostrar OTRA variante de la publicación y eso NO cambia lo que compró), preguntar si hay otros colores ANTES de decidir algo, reclamos por algo que llegó mal, ni dudas de uso.
- RECLAMO (08-11): si pide devolución, garantía, reemplazo o reembolso, o dice que le llegó dañado, defectuoso, que no funciona, incompleto o un producto/color/modelo distinto al que compró, pon en "reclamo" un resumen corto (ej. "Le llegó azul, compró rojo; pide cambio"). El borrador NO promete devolución, reemplazo ni reembolso: di que lo revisan con el equipo y le responden por aquí. Si no es eso, null.

- PENDIENTE (22-11, el dueño: «todo lo que deje pendiente debe ir a notas»): si tu respuesta deja algo para que el equipo lo haga o lo verifique ("lo revisamos con el equipo", "le confirmamos por aquí", "le avisamos"), pon en "pendiente" lo que pidió el comprador con los datos EXACTOS que dio (nombre, razón social, RIF, cédula, dirección, cantidad…) y en "pendiente_tema" el tema: FACTURA (pide factura o datos fiscales), CAMBIO (cambiar algo de la compra o del envío que no es pedido especial ni reclamo), PAGO (dice que pagó, pagó otro monto u otra cantidad, comprobantes), DATOS (manda datos de envío o personales), ENVIO (pide algo del despacho: agencia, oficina, fecha) u OTRO. Ej.: FACTURA · "a nombre de Cami Farma 4:19, C.A RIF J506862611". Si no deja nada pendiente, los dos en null. El pedido especial y el reclamo van en sus campos, no aquí.
- FORMULARIO DE MERCADOENVÍOS (22-11): lo llena el comprador desde SU cuenta; nosotros no tenemos acceso y no podemos llenarlo por él (ni con los datos que nos pase por aquí). Si pide que se lo llenemos, explícaselo con amabilidad, guíalo con el video o el paso a paso de la conversación y ofrécele aclarar por aquí cualquier campo que no entienda. Eso SÍ contesta lo que pidió.
- FORMULARIO QUE NO AVANZA (23-11, el dueño): si dice que el formulario de MercadoEnvíos no le deja avanzar, no se envía, da error, no le deja poner la dirección o no pudo subir el comprobante ahí, NO lo dejes para el equipo: contéstale tú con la guía del vendedor (la respuesta rápida sobre problemas con MercadoEnvíos, con sus links EXACTOS: ingreso a MercadoEnvíos, video de cómo agendar, cómo borrar la caché y probar desde una computadora), resumida para que entre en el mensaje, con confianza "alta". El comprobante se sube en el formulario de MercadoEnvíos, no por aquí. Si también pregunta otra cosa, contéstala igual.
- OTRA COMPRA (23-11, el dueño): si dice que YA hizo otra compra (con la cantidad o el producto correcto) y pregunta qué hace con esta, contesta tú: "Perfecto, trabajamos con la nueva compra; esta no tiene que pagarla, nosotros la cerramos", con confianza "alta". No es pedido especial ni reclamo. Pon en "pendiente" "Hizo otra compra: calificar esta «No concretada · sin problema»" con tema OTRO.
- FACTURA (23-11): si pide factura o pregunta si emiten y las POLÍTICAS dicen que sí emiten factura fiscal, contéstalo y pídele de una vez que mande por aquí la razón social o nombre, el RIF o cédula y la dirección fiscal (confianza "alta"; no digas "le confirmamos luego"). Si ya mandó esos datos, dile que los recibimos para su factura y ponlos en "pendiente" (FACTURA).

Siempre termina llamando a la herramienta proponer_respuesta.`

const HERRAMIENTA = {
  name: 'proponer_respuesta',
  description: 'Entrega el borrador de respuesta (máximo 350 caracteres) para que el vendedor lo revise.',
  input_schema: {
    type: 'object',
    properties: {
      respuesta: { type: 'string', description: 'Mensaje listo para enviar, máximo 350 caracteres (vacío si no se puede responder sin inventar).' },
      confianza: { type: 'string', enum: ['alta', 'media', 'baja'], description: 'alta = todo sale de los datos dados; baja = falta información.' },
      falta_dato: { type: ['string', 'null'], description: 'Qué dato faltó para responder bien, o null.' },
      pedido_especial: { type: ['string', 'null'], description: 'Si pide algo distinto a lo que compró (otro color/talla/variante, mezclar variantes, otra cantidad u otro producto): resumen corto "Compró X, quiere Y". Si no, null.' },
      reclamo: { type: ['string', 'null'], description: 'Si es devolución, garantía, reemplazo, reembolso, producto dañado/defectuoso, incompleto o envío equivocado: resumen corto. Si no, null.' },
      pendiente: { type: ['string', 'null'], description: 'Si la respuesta deja algo pendiente para el equipo: lo que pidió el comprador con sus datos exactos (máx. 160 caracteres). Si no, null.' },
      pendiente_tema: { type: ['string', 'null'], enum: ['FACTURA', 'CAMBIO', 'PAGO', 'DATOS', 'ENVIO', 'OTRO', null], description: 'Tema del pendiente, o null.' },
    },
    required: ['respuesta', 'confianza', 'falta_dato', 'pedido_especial', 'reclamo', 'pendiente', 'pendiente_tema'],
  },
}

export type TemaPendiente = 'FACTURA' | 'CAMBIO' | 'PAGO' | 'DATOS' | 'ENVIO' | 'OTRO'
export interface BorradorMensaje { respuesta: string; confianza: 'alta' | 'media' | 'baja'; falta_dato: string | null; pedido_especial?: string | null; reclamo?: string | null
  /** 22-11: lo que la respuesta deja pendiente para el equipo (va a la nota de la venta). */
  pendiente?: string | null; pendiente_tema?: TemaPendiente | null }

// conInventario = false: la empresa trabaja "todo desde MercadoLibre" (sin ventas cargadas): el
// estado sale de la venta en ML y NO se le dice a la IA que "no está cargada" (sería falso).
// hasta (09-11, prueba de Mi IA): la conversación solo hasta ese mensaje del comprador (lo que el equipo ya contestó
// no se le muestra), y HOY = ese momento.
// 12-11 (corrector): `correccion` = el borrador anterior frenado y por qué; la IA escribe uno nuevo que lo corrija.
const CORRECCION_MENSAJE = `

CORRECCIÓN: al final te paso TU BORRADOR ANTERIOR y por qué no se pudo enviar. Escribe uno NUEVO:
- Solo lo que está en la conversación, la venta, las notas y las POLÍTICAS. Lo que no está, en una frase corta, sin explicar por qué.
- No prometas verificar, confirmar ni avisar después si no lo dicen las POLÍTICAS.
- Si con lo que hay ya respondes bien, confianza "alta". Si de verdad hace falta una persona, deja confianza "baja".`
// 21-11 (medición, el dueño): `opciones` (apagadas por defecto, nada cambia en el automático):
//   preguntasPrevias = suma lo que este comprador preguntó antes de comprar (como Preguntas, que ya lo tiene);
//   historico = con `hasta`, la guía y el pago salen solo de la conversación hasta ese momento (no del envío de HOY).
//   ejemplos = cómo se eligen las respuestas anteriores del vendedor (lib/mensajesML.ts sugerenciasMensaje: sin la IA, por paso).
export interface OpcionesMensaje { preguntasPrevias?: boolean; historico?: boolean; ejemplos?: { sinIA?: boolean; porPaso?: boolean } }
export async function borradorMensaje(db: Pool, conexionId: number, sellerId: number, pack: string, country: string,
  conInventario = true, hasta?: string, correccion?: { anterior: string; problemas: string[] }, opciones: OpcionesMensaje = {}): Promise<BorradorMensaje & { uso: UsoIA; modelo: string; ejemplos: number; contexto: string }> {
  const historico = !!(opciones.historico && hasta)
  const [hiloEntero, venta, notas, ejemplos] = await Promise.all([
    leerHilo(db, conexionId, pack, sellerId, false),
    itemsDeVenta(db, conexionId, pack).catch(() => null),
    leerNotas(db, conexionId, pack).catch(() => ({ notas: [] })),
    sugerenciasMensaje(db, pack, 6, { ...(opciones.historico && hasta ? { hasta } : {}), ...(opciones.ejemplos ?? {}) })
      .catch(() => ({ consulta: null, sugerencias: [] as Awaited<ReturnType<typeof sugerenciasMensaje>>['sugerencias'] })),
  ])
  const corte = hasta ? Date.parse(hasta) + 1000 : null
  const hilo = corte ? { ...hiloEntero, mensajes: hiloEntero.mensajes.filter(m => Date.parse(m.fecha) <= corte) } : hiloEntero
  if (!hilo.mensajes.length) throw new Error('La conversación no tiene mensajes')

  const L: string[] = []
  if (venta?.items.length) {
    const codigos = venta.items.map(i => i.id.replace(/^[A-Z]{3}/, ''))
    const { rows: stock } = await db.query(
      `SELECT split_part(m.ml_code, ':', 1) AS ml_code,
              COALESCE(MIN(FLOOR(GREATEST(COALESCE(i.quantity, 0), 0)::numeric / GREATEST(COALESCE(m.unidades, 1), 1))) FILTER (WHERE m.kit AND m.ml_code NOT LIKE '%:%'),   -- 24-11 kit: los que se arman
                       (array_agg(COALESCE(i.quantity, 0)) FILTER (WHERE m.ml_code NOT LIKE '%:%'))[1],
                       SUM(COALESCE(i.quantity, 0)) FILTER (WHERE m.ml_code LIKE '%:%'))::int AS stock
       FROM product_ml_codes m JOIN products p ON p.id = m.product_id LEFT JOIN inventory i ON i.product_id = p.id
       WHERE split_part(m.ml_code, ':', 1) = ANY($1::text[]) AND p.is_active AND m.is_active AND ${sinEnteraVieja('m')}
       GROUP BY 1`, [codigos])   // el de la publicación como siempre; si solo hay productos por variante, la suma
    const { rows: [mi] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [MI_IA_KEY])
    const minimoEnvio = leerMiIA(mi?.value)?.envio?.minimo ?? null
    L.push('PRODUCTOS DE LA VENTA:')
    for (const it of venta.items) {
      const s = stock.find(x => x.ml_code === it.id.replace(/^[A-Z]{3}/, ''))
      const precio = it.precio != null ? ` · ${it.precio} ${it.moneda ?? ''} c/u` : ''
      // 13-11: la variante elegida en ML es LO QUE COMPRÓ y manda sobre fotos/ficha (que pueden mostrar otra variante).
      L.push(`- ${it.cantidad} × ${it.titulo}${it.variante ? ` — VARIANTE QUE COMPRÓ: ${it.variante} (la eligió en ML; manda sobre fotos, ficha y descripción)` : ''}${precio}${s ? ` (stock en el sistema: ${s.stock}; solo importa si pide más o cambiar)` : ''}`)
      // 08-11 (el dueño): el envío gratis de ESTA compra (lo que la pantalla muestra como "Gratis SOLO TEALCA").
      if (it.envio) L.push(`  ENVÍO GRATIS DE ESTA COMPRA (según peso y precio pagado): ${it.envio.estado === 'sin_peso' ? 'Sin peso: no se sabe' : it.envio.texto}${it.envio.conflicto ? ' (dudoso: vinculada a productos de distinto peso)' : ''}`)
      // 22-11 (el dueño): por debajo del mínimo de Mi IA (ej. menos de 2 unidades de un producto de menos de $3) MercadoEnvíos
      // no activa el envío gratis con esa compra: tiene que volver a ofertar con el mínimo.
      if (minimoEnvio && it.usd != null && it.usd < minimoEnvio.precioMenor && it.cantidad < minimoEnvio.unidades)
        L.push(`  MÍNIMO PARA ENVÍO GRATIS: compró ${it.cantidad} y este producto pide mínimo ${minimoEnvio.unidades} unidades (cuesta menos de $${minimoEnvio.precioMenor}). Con esta compra MercadoEnvíos NO activa el envío gratis: si pregunta por el envío o el formulario no le funciona, dile que debe volver a ofertar (comprar de nuevo) mínimo ${minimoEnvio.unidades} unidades de este producto para que se active. Si dice que pagó otra cantidad (ej. "ya pagué 3"), contéstale tú con confianza "alta": esta compra quedó por ${it.cantidad} y así MercadoEnvíos no activa el envío gratis; debe volver a ofertar (una compra nueva) mínimo ${minimoEnvio.unidades} unidades para que se active (no es pedido especial). Lo que dice que pagó va en "pendiente" (PAGO).`)
    }
    // Total de la venta en USD y Bs a tasa BCV (07-11): "¿cuánto sería en Bs?".
    if (country === 'VE' && venta.items.every(i => i.precio != null)) {
      const { rows: [t] } = await db.query(
        `SELECT official_rate::float AS r FROM venezuela_exchange_rates ORDER BY rate_date DESC, created_at DESC LIMIT 1`)
      const ves = venta.items.every(i => i.moneda === 'VES')
      const totalUsd = venta.items.reduce((a, i) => a + (i.usd ?? (i.moneda === 'USD' ? i.precio! : 0)) * i.cantidad, 0)
      const totalBs = ves ? venta.items.reduce((a, i) => a + i.precio! * i.cantidad, 0) : t?.r ? totalUsd * t.r : null
      const f = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      L.push(`TOTAL DE LA VENTA (productos, sin embalaje): ${totalUsd ? `${f(totalUsd)}` : ''}${totalBs ? ` = Bs ${f(totalBs)}` : ''}${t?.r && !ves ? ` (tasa BCV ${f(t.r)})` : ''}`)
    }
  }
  // Producto: ficha técnica (catálogo), descripción (ML) y ficha de conocimiento (lo que el
  // vendedor ya respondió). Para preguntas post-venta de uso, contenido o compatibilidad.
  for (const it of (venta?.items ?? []).slice(0, 3)) {
    const { rows: [cat] } = await db.query(`SELECT ficha FROM ml_catalogo WHERE item_id = $1`, [it.id])
    const { rows: [fc] } = fichasActivas()
      ? await db.query(`SELECT texto FROM ml_item_fichas WHERE item_id = $1`, [it.id])
      : { rows: [] }
    // Fichas POR USO (migración 063): se pidió IA sobre este producto.
    await db.query(`UPDATE ml_catalogo SET ia_usada_at = NOW() WHERE item_id = $1`, [it.id]).catch(() => {})
    const desc = await mlFetch<{ plain_text?: string }>(db, conexionId, `/items/${it.id}/description`)
      .then(d => d.plain_text?.trim() || null).catch(() => null)
    // Fotos (mig 146): una vez por publicación; misma huella que Preguntas (ficha de los atributos en vivo).
    const pub = await mlFetch<{ attributes?: { name: string; value_name: string | null }[]; pictures?: FotoML[] }>(
      db, conexionId, `/items/${it.id}?attributes=attributes,pictures`).catch(() => null)
    const fotos = pub ? await contextoFotos(db, conexionId, it.id,
      { titulo: it.titulo, ficha: fichaDeAtributos(pub.attributes), descripcion: desc, fotos: pub.pictures ?? [] }) : null
    const lf = lineasFotos(fotos)
    const { rows: notasItem } = await db.query(`SELECT texto FROM ml_item_notas WHERE item_id = $1 ORDER BY created_at DESC LIMIT 20`, [it.id])
    if (!cat?.ficha && !fc?.texto && !desc && !lf.length && !notasItem.length) continue
    L.push(`\nPRODUCTO "${it.titulo}":`)
    if (it.variante) L.push(`(Las fotos, la ficha y la descripción son de TODA la publicación y pueden mostrar otras variantes; este comprador compró: ${it.variante}.)`)
    if (cat?.ficha) L.push(`Ficha: ${cat.ficha}`)
    if (desc) L.push(`Descripción: ${desc.slice(0, 2500)}`)
    L.push(...lf)
    if (notasItem.length) L.push(`DATOS QUE EL VENDEDOR ANOTÓ DE ESTE PRODUCTO (mandan sobre la ficha, la descripción y las fotos):\n- ${notasItem.map(n => n.texto).join('\n- ')}`)
    if (fc?.texto) L.push(`Ficha de conocimiento (lo que el vendedor ya respondió de este producto):\n${fc.texto}`)
  }
  if (venta?.comprador.nombre || venta?.comprador.nick) L.push(`COMPRADOR: ${[venta.comprador.nombre, venta.comprador.nick].filter(Boolean).join(' · ')}`)
  const { rows: [s] } = await db.query(`SELECT status, notes FROM sales WHERE ml_order_number = $1`, [pack])
  // Guía y pago (06-11): en MLV la guía de MercadoEnvíos sale cuando el comprador COMPLETA el pago en
  // checkout.mercadoenvios; ML lo avisa con un mensaje automático en el chat. Fuente: el envío en ML;
  // respaldo: ese aviso. Que la venta no esté cargada en Ventas NO quiere decir que no pagó.
  const avisoGuia = [...hilo.mensajes].reverse()
    .map(m => /n[uú]mero de gu[ií]a para tu env[ií]o es:?\s*([A-Z0-9-]{5,})/i.exec(textoPlano(m.texto))?.[1]).find(Boolean) ?? null
  let g: { carrier?: string; guia?: string; jornada?: string } | undefined
  let ml: Awaited<ReturnType<typeof envioML>> = null
  if (country === 'VE' && !historico) {
    ({ rows: [g] } = await db.query(
      `SELECT e.carrier, COALESCE(e.guia_final, e.guia) AS guia, j.status AS jornada, j.closed_at
       FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id JOIN despacho_jornadas j ON j.id = l.jornada_id
       WHERE e.venta = $1 AND e.impresa AND l.status = 'GENERADO' ORDER BY e.id DESC LIMIT 1`, [pack]))
    // Sin Despachos: la guía y el estado que da MercadoEnvíos (31-10).
    ml = venta?.envioId ? await envioML(db, conexionId, venta.envioId).catch(() => null) : null
  }
  const guiaME = ml?.guia || avisoGuia
  const pagadoME = !!(g || guiaME)
  const lineaPago = pagadoME ? `PAGO: ya pagó en MercadoEnvíos (la compra está pagada${guiaME ? `, guía ${guiaME}` : ''}).` : null
  if (historico) { /* el estado de HOY no es el de ese momento: no se muestra */ }
  else if (conInventario) {
    L.push(s ?`ESTADO EN EL SISTEMA: ${ESTADO_VENTA[s.status] ?? s.status}` : 'ESTADO EN EL SISTEMA: la venta todavía no está cargada en el sistema.')
  } else {
    const { rows: [o] } = await db.query(`SELECT estado FROM ml_ordenes WHERE id::text = $1 OR pack_id::text = $1 LIMIT 1`, [pack])
    if (o?.estado === 'cancelled') L.push('ESTADO DE LA VENTA: cancelada en MercadoLibre.')
  }
  if (lineaPago) L.push(lineaPago)
  if (country === 'VE') {
    if (g) L.push(`ENVÍO: guía ${g.carrier} ${g.guia}` + (g.jornada === 'CERRADA' ? ' (paquete entregado al transportista)' : ' (etiqueta impresa, el paquete todavía no salió)'))
    else if (guiaME) L.push(`ENVÍO (MercadoEnvíos): guía ${ml?.guia ? [ml.transportista, ml.guia].filter(Boolean).join(' ') : guiaME}${ml?.estado ? ` · estado en ML: ${ml.estado}` : ''} (guía generada; el paquete todavía no se despachó si no dice lo contrario)`)
    else L.push('ENVÍO: todavía no tiene guía (no se ha despachado).')
  }
  const textoNotas = [...notas.notas.map(n => n.texto), s?.notes].filter((x): x is string => !!x?.trim())
  // 13-11: las notas «PEDIDO ESPECIAL / RECLAMO - verificar» las escribió la IA misma (lib/mensajesIAPrueba.ts): se marcan
  // como suposición para que no se repita un error suyo (dijo que compró otra variante y lo volvió a leer como dato).
  const deLaIA = (t: string) => /^(PEDIDO ESPECIAL|RECLAMO|PAGO|DATOS|ARCHIVO|FACTURA|CAMBIO|ENV[IÍ]O|PENDIENTE|VARIAS SOLICITUDES)\b[^:]{0,80} - (verificar|pendiente):/i.test(t.trim())
  const unicas = [...new Set(textoNotas)]
  const delEquipo = unicas.filter(t => !deLaIA(t)), propias = unicas.filter(deLaIA)
  if (delEquipo.length) L.push(`NOTA DE LA VENTA: ${delEquipo.join(' · ')}`)
  if (propias.length) L.push(`AVISO AUTOMÁTICO QUE DEJÓ LA IA ANTES (suposición, puede estar equivocado; compáralo con la VARIANTE QUE COMPRÓ y la conversación): ${propias.join(' · ')}`)
  // Mi IA (06-11, lib/miIA.ts, con la parte post-venta) + el texto libre de siempre.
  const pol = await politicasIA(db, 'mensajes', hilo.mensajes.slice(-6).filter(m => !m.propio).map(m => m.texto).join('\n'))
  if (pol.texto) L.push(`\nPOLÍTICAS DEL VENDEDOR:\n${pol.texto}`)
  // Respuestas rápidas de Mensajes (06-11): cómo escribe el vendedor post-venta. Las reglas mandan las POLÍTICAS.
  const { rows: [mr] } = await db.query(`SELECT value FROM app_settings WHERE key = 'mensajes_plantillas'`)
  const rapidos = leerMensajesRapidos(mr?.value)
  // 23-11 (marcas Mal del dueño): lo que escribió el comprador desde la última respuesta del vendedor (y los últimos
  // mensajes suyos, para «ya hice otra compra» seguido de un «gracias»). Las dos reglas van como DATOS del vendedor
  // para que el verificador no las tome por inventadas.
  const ultimoVendedor = hilo.mensajes.map(m => m.propio).lastIndexOf(true)
  const recienComprador = hilo.mensajes.slice(ultimoVendedor + 1).map(m => textoPlano(m.texto)).join('\n')
  const ultimosComprador = hilo.mensajes.filter(m => !m.propio).slice(-6).map(m => textoPlano(m.texto)).join('\n')
  const guia = FORM_TRABADO.test(recienComprador) ? rapidos.find(r => /checkout\.mercadoenvios|youtu/i.test(r.texto)) : undefined
  if (guia) L.push(`\nEL FORMULARIO DE MERCADOENVÍOS NO LE AVANZA: contesta con esta guía del vendedor, resumida, con los links EXACTOS (el comprobante también se sube ahí, no por aquí):\n${guia.texto}`)
  if (OTRA_COMPRA.test(ultimosComprador)) L.push('\nREGLA DEL VENDEDOR (otra compra): si el comprador ya hizo otra compra con la cantidad o el producto correcto, trabajamos con la nueva; esta no tiene que pagarla y la cerramos nosotros (se califica «No concretada · sin problema»).')
  if (rapidos.length) L.push(`\nRESPUESTAS RÁPIDAS DEL VENDEDOR PARA MENSAJES (su forma de escribir; si alguna aplica a lo que pregunta, úsala casi tal cual; si un dato choca con las POLÍTICAS, mandan las POLÍTICAS; lo que está entre llaves como {nombre}, {producto} o {precio} NUNCA va tal cual: cámbialo por el dato real de esta venta o sácalo):\n${rapidos.slice(0, 15).map(r => `- [${r.titulo}]: ${r.texto}`).join('\n')}`)
  if (ejemplos.sugerencias.length) {
    L.push('\nRESPUESTAS ANTERIORES DEL VENDEDOR A MENSAJES PARECIDOS (otras ventas):')
    L.push(ejemplos.sugerencias.map(x => `Comprador: ${x.pregunta}\nVendedor: ${x.respuesta}`).join('\n\n'))
  }
  // Hoy (07-11): para decir el día de envío según los días de despacho de las POLÍTICAS.
  const tz = COUNTRY_TZ[country as 'VE' | 'CO'] ?? COUNTRY_TZ.VE
  L.push(`\nHOY: ${new Intl.DateTimeFormat('es-VE', { timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(hasta ? new Date(hasta) : new Date())}`)
  if (opciones.preguntasPrevias) {
    const tope = hasta ? new Date(Date.parse(hasta) + 1000).toISOString() : new Date().toISOString()
    const { rows: previas } = await db.query(
      `SELECT p.texto AS p, p.respuesta AS r, p.item_titulo AS t, to_char(p.fecha, 'DD-MM HH24:MI') AS fecha
       FROM ml_preguntas p JOIN ml_conversaciones c ON c.pack_id::text = $1 AND c.comprador_id = p.comprador_id
       WHERE p.fecha < $2::timestamptz AND p.fecha > $2::timestamptz - interval '30 days'
       ORDER BY p.fecha DESC LIMIT 6`, [pack, tope]).catch(() => ({ rows: [] as { p: string; r: string | null; t: string | null; fecha: string }[] }))
    if (previas.length) {
      L.push('\nPREGUNTAS QUE ESTE COMPRADOR HIZO ANTES EN LAS PUBLICACIONES (antes de comprar; para entender a qué se refiere ahora):')
      L.push(previas.reverse().map(x => `${x.fecha}${x.t ? ` [${String(x.t).slice(0, 60)}]` : ''} P: ${String(x.p).slice(0, 300)}${x.r ? `\n      R: ${String(x.r).slice(0, 300)}` : ' (sin responder)'}`).join('\n'))
    }
  }
  L.push('\nCONVERSACIÓN (de la más vieja a la más nueva):')
  for (const m of hilo.mensajes.slice(-30)) {
    const t = textoPlano(m.texto).slice(0, 600)
    L.push(`${m.propio ? 'Vendedor' : 'Comprador'} (${m.fecha.slice(0, 16).replace('T', ' ')}): ${t}${m.adjuntos.length ? ' [mandó un adjunto]' : ''}`)
  }

  // 08-11 (el dueño): Haiku 5.5 escribe los mensajes (antes Sonnet, ~20× más caro). Un reintento si falla.
  if (correccion) L.push(`\n────────\nTU BORRADOR ANTERIOR:\n${correccion.anterior || '(vacío)'}\n\nPOR QUÉ NO SE ENVIÓ:\n- ${correccion.problemas.join('\n- ')}`)
  const llamar = () => llamarClaude<BorradorMensaje>({ para: correccion ? 'Mensajes: corrector' : 'Mensajes: respuesta', sistema: SISTEMA + (correccion ? CORRECCION_MENSAJE : ''), contenido: L.join('\n'), herramienta: HERRAMIENTA, modelo: MODELO_SIMPLE })
  const { resultado: b, uso, modelo } = await llamar().catch(() => llamar())
  return {
    respuesta: String(b.respuesta ?? '').trim().slice(0, 350),
    confianza: ['alta', 'media', 'baja'].includes(b.confianza) ? b.confianza : 'baja',
    falta_dato: b.falta_dato || null,
    pedido_especial: typeof b.pedido_especial === 'string' && b.pedido_especial.trim() ? b.pedido_especial.trim().slice(0, 200) : null,
    reclamo: typeof b.reclamo === 'string' && b.reclamo.trim() ? b.reclamo.trim().slice(0, 200) : null,
    pendiente: typeof b.pendiente === 'string' && b.pendiente.trim() ? b.pendiente.trim().slice(0, 200) : null,
    pendiente_tema: (['FACTURA', 'CAMBIO', 'PAGO', 'DATOS', 'ENVIO', 'OTRO'] as const).find(t => t === b.pendiente_tema) ?? null,
    uso, modelo, ejemplos: ejemplos.sugerencias.length,
    contexto: L.slice(0, correccion ? L.length - 1 : L.length).join('\n'),
  }
}
