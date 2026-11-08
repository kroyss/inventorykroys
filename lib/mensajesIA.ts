// Borrador de respuesta con IA para los mensajes POST-VENTA (Automatizaciones → Mensajes).
//
// La IA lee la conversación completa y los datos de la venta (productos y stock real, nota de
// ML, estado en el sistema, guía si ya se despachó) más lo que el vendedor respondió antes a
// mensajes parecidos (su voz). Solo propone: la persona revisa y envía.
import { politicasIA } from '@/lib/miIA'
import { leerMensajesRapidos } from '@/lib/mensajesRapidos'
import type { Pool } from 'pg'
import { llamarClaude, MODELO_SIMPLE, type UsoIA } from '@/lib/ia'
import { itemsDeVenta, envioML, leerHilo, sugerenciasMensaje, textoPlano } from '@/lib/mensajesML'
import { leerNotas } from '@/lib/notasML'
import { mlFetch } from '@/lib/ml'
import { fichasActivas } from '@/lib/fichasIA'
import { COUNTRY_TZ } from '@/lib/tz'
import { contextoFotos, fichaDeAtributos, lineasFotos, type FotoML } from '@/lib/fotosIA'

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
2. El comprador completa el formulario y paga en MercadoEnvíos (checkout.mercadoenvios.com.ve).
3. ML genera la guía y manda el aviso automático "El número de guía para tu envío es…". Desde ahí la compra YA está pagada.
4. Opcional: el comprador paga aparte el embalaje u otro adicional (eso sí lo verifica el equipo).
5. El vendedor despacha el paquete.

Antes de responder, piensa: ¿en qué paso está?, ¿qué quiere decir con lo último que escribió según lo que pasó justo antes? Ejemplos: "Listo" después del link de MercadoEnvíos = "ya lo completé/pagué"; "Listo" o "gracias" después de la guía = recibido, no pide nada; "¿cuánto es en Bs?" antes de pagar = quiere el monto.

Cómo responder:
- Responde a lo ÚLTIMO que escribió el comprador, teniendo en cuenta toda la conversación, la nota de la venta y su estado.
- Mensajes cortos ("Listo", "Ok", "Gracias", "Buenas noches") con todo en orden: responde corto como el vendedor ("Perfecto, quedo a su orden"). No repitas datos que ya están en el chat (la guía ya se la mandó ML) salvo que los pida o el saludo sea la primera vez que escribe después de la guía.
- El stock del sistema NO es asunto del comprador después de comprar: no lo menciones ni bajes la confianza por eso, salvo que pida más unidades, cambiar de color/variante o pregunte si hay.
- Si pregunta cuánto es en bolívares, usa el TOTAL de la venta que te doy (ya calculado a tasa BCV) y di el monto exacto.
- Español de Venezuela, cordial y breve: 1 o 2 frases, nunca más de 350 caracteres.
- Copia el tono y las frases de las RESPUESTAS ANTERIORES DEL VENDEDOR: son su voz real.
- Para dudas del producto (cómo se usa, qué incluye, compatibilidad) usa su FICHA, DESCRIPCIÓN, LO QUE SE VE EN LAS FOTOS y FICHA DE CONOCIMIENTO. Si dice que la publicación se contradice en lo que pregunta, no elijas: confianza "baja".
- En Venezuela MercadoLibre no tiene carrito de compras: no lo menciones.
- Las POLÍTICAS DEL VENDEDOR son lo vigente: si una respuesta anterior o la ficha de conocimiento dicen otra cosa (montos o mínimos para envío gratis, agencias, formas de pago, retiro), manda lo que dicen las POLÍTICAS.
- Usa SOLO los datos que te doy. Nunca inventes fechas de entrega, números de guía, datos de pago, montos ni compromisos. Si el dato no está, dilo en "falta_dato" y deja una respuesta prudente (o vacía) con confianza "baja".
- Si hay GUÍA de envío, puedes darla. Si no la hay, no digas que ya se envió.
- Si dice "PAGO: ya pagó en MercadoEnvíos", la compra YA está pagada: nunca digas que el pago no aparece.
- Cuándo sale el envío: con HOY y los días de despacho de las POLÍTICAS di el día concreto ("el lunes", "mañana martes"). Si las POLÍTICAS no dicen días de despacho, no prometas un día.
- No repitas datos que ya están en el chat (la guía que mandó ML, montos ya dados) salvo que los pida. Si ya tiene guía y solo saluda o dice "listo": dile que verifican su pago y el día en que procesan el envío.
- Datos para pagar (cuentas, pago móvil, Zelle…): SOLO los de "Datos para pagar" de las POLÍTICAS, copiados exactos. Si no están ahí y el comprador los pide, deja la respuesta VACÍA con confianza "baja" y falta_dato "Pide datos de pago: los da el equipo".
- Adicionales OPCIONALES que el vendedor ofrece en sus mensajes o respuestas rápidas (p. ej. embalaje): el monto sale de ahí, nunca uno fijo. Son opcionales: si dice que ya lo pagó, responde corto ("Perfecto, quedo a su orden") y el día de envío, sin decir que se verifica; si pregunta si es obligatorio o qué pasa si no lo paga, di que es opcional y que puede agregarlo cuando quiera; si ya tiene guía y no lo agregó, puedes sugerirlo una vez.
- Otro pago aparte que NO es un adicional opcional (una diferencia, otro producto): ese lo verifica el equipo.
- Monto: desglose "cantidad × precio = subtotal" con el TOTAL de la venta; si el vendedor ofrece un adicional opcional, súmalo aparte como opcional ("si desea agregar el embalaje de X, total Y").
- Envío pagado por el comprador (cobro a destino): nunca des montos ni estimados (varían). Confirma la agencia entre las de cobro a destino de las POLÍTICAS; cuando la elija, pídele nombre completo, cédula, teléfono, dirección, ciudad y estado. Si las POLÍTICAS piden un mínimo de unidades para el envío gratis y el producto entra ahí, recomienda comprar ese mínimo: le sale más barato que el cobro a destino.
- Si pregunta algo que depende del equipo y no está en los datos (cuándo sale el paquete, desde qué oficina, un problema con el pago o el formulario), no lo inventes: responde que lo verifican con el equipo y le avisan por este chat, con confianza "baja" y el dato en "falta_dato".
- Si el comprador solo manda un emoji o un "ok", no hace falta responder: deja la respuesta vacía con confianza "alta".
- Si el comprador solo saluda o agradece, responde corto y amable.
- Nada de correos, redes sociales ni links que no sean de MercadoLibre.
- PEDIDO ESPECIAL (08-11): si en lo que escribió AHORA el comprador pide algo DISTINTO a lo que compró —otro color, talla, modelo o variante; mezclar variantes ("compré 2 rojos, quiero 1 rojo y 1 azul"); más o menos unidades; cambiar o agregar otro producto— pon en "pedido_especial" un resumen corto con lo que compró y lo que quiere (ej. "Compró 2 rojos, quiere 1 rojo y 1 azul"). En ese caso el borrador NO confirma el cambio: di que lo verifican y le confirman por aquí. NO es pedido especial (deja null): preguntar de qué color o modelo le llega, confirmar que es el que compró, preguntar si hay otros colores ANTES de decidir algo, reclamos por algo que llegó mal, ni dudas de uso.
- RECLAMO (08-11): si pide devolución, garantía, reemplazo o reembolso, o dice que le llegó dañado, defectuoso, que no funciona, incompleto o un producto/color/modelo distinto al que compró, pon en "reclamo" un resumen corto (ej. "Le llegó azul, compró rojo; pide cambio"). El borrador NO promete devolución, reemplazo ni reembolso: di que lo revisan con el equipo y le responden por aquí. Si no es eso, null.

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
    },
    required: ['respuesta', 'confianza', 'falta_dato', 'pedido_especial', 'reclamo'],
  },
}

export interface BorradorMensaje { respuesta: string; confianza: 'alta' | 'media' | 'baja'; falta_dato: string | null; pedido_especial?: string | null; reclamo?: string | null }

// conInventario = false: la empresa trabaja "todo desde MercadoLibre" (sin ventas cargadas): el
// estado sale de la venta en ML y NO se le dice a la IA que "no está cargada" (sería falso).
export async function borradorMensaje(db: Pool, conexionId: number, sellerId: number, pack: string, country: string,
  conInventario = true): Promise<BorradorMensaje & { uso: UsoIA; modelo: string; ejemplos: number }> {
  const [hilo, venta, notas, ejemplos] = await Promise.all([
    leerHilo(db, conexionId, pack, sellerId, false),
    itemsDeVenta(db, conexionId, pack).catch(() => null),
    leerNotas(db, conexionId, pack).catch(() => ({ notas: [] })),
    sugerenciasMensaje(db, pack, 6).catch(() => ({ consulta: null, sugerencias: [] })),
  ])
  if (!hilo.mensajes.length) throw new Error('La conversación no tiene mensajes')

  const L: string[] = []
  if (venta?.items.length) {
    const codigos = venta.items.map(i => i.id.replace(/^[A-Z]{3}/, ''))
    const { rows: stock } = await db.query(
      `SELECT split_part(m.ml_code, ':', 1) AS ml_code,
              COALESCE((array_agg(COALESCE(i.quantity, 0)) FILTER (WHERE m.ml_code NOT LIKE '%:%'))[1],
                       SUM(COALESCE(i.quantity, 0)) FILTER (WHERE m.ml_code LIKE '%:%'))::int AS stock
       FROM product_ml_codes m JOIN products p ON p.id = m.product_id LEFT JOIN inventory i ON i.product_id = p.id
       WHERE split_part(m.ml_code, ':', 1) = ANY($1::text[]) AND p.is_active
       GROUP BY 1`, [codigos])   // el de la publicación como siempre; si solo hay productos por variante, la suma
    L.push('PRODUCTOS DE LA VENTA:')
    for (const it of venta.items) {
      const s = stock.find(x => x.ml_code === it.id.replace(/^[A-Z]{3}/, ''))
      const precio = it.precio != null ? ` · ${it.precio} ${it.moneda ?? ''} c/u` : ''
      L.push(`- ${it.cantidad} × ${it.titulo}${it.variante ? ` — variante: ${it.variante}` : ''}${precio}${s ? ` (stock en el sistema: ${s.stock}; solo importa si pide más o cambiar)` : ''}`)
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
    if (!cat?.ficha && !fc?.texto && !desc && !lf.length) continue
    L.push(`\nPRODUCTO "${it.titulo}":`)
    if (cat?.ficha) L.push(`Ficha: ${cat.ficha}`)
    if (desc) L.push(`Descripción: ${desc.slice(0, 2500)}`)
    L.push(...lf)
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
  if (country === 'VE') {
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
  if (conInventario) {
    L.push(s ? `ESTADO EN EL SISTEMA: ${ESTADO_VENTA[s.status] ?? s.status}` : 'ESTADO EN EL SISTEMA: la venta todavía no está cargada en el sistema.')
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
  if (textoNotas.length) L.push(`NOTA DE LA VENTA: ${[...new Set(textoNotas)].join(' · ')}`)
  // Mi IA (06-11, lib/miIA.ts, con la parte post-venta) + el texto libre de siempre.
  const pol = await politicasIA(db, 'mensajes', hilo.mensajes.slice(-6).filter(m => !m.propio).map(m => m.texto).join('\n'))
  if (pol.texto) L.push(`\nPOLÍTICAS DEL VENDEDOR:\n${pol.texto}`)
  // Respuestas rápidas de Mensajes (06-11): cómo escribe el vendedor post-venta. Las reglas mandan las POLÍTICAS.
  const { rows: [mr] } = await db.query(`SELECT value FROM app_settings WHERE key = 'mensajes_plantillas'`)
  const rapidos = leerMensajesRapidos(mr?.value)
  if (rapidos.length) L.push(`\nRESPUESTAS RÁPIDAS DEL VENDEDOR PARA MENSAJES (su forma de escribir; si alguna aplica a lo que pregunta, úsala casi tal cual; si un dato choca con las POLÍTICAS, mandan las POLÍTICAS; lo que está entre llaves como {nombre}, {producto} o {precio} NUNCA va tal cual: cámbialo por el dato real de esta venta o sácalo):\n${rapidos.slice(0, 15).map(r => `- [${r.titulo}]: ${r.texto}`).join('\n')}`)
  if (ejemplos.sugerencias.length) {
    L.push('\nRESPUESTAS ANTERIORES DEL VENDEDOR A MENSAJES PARECIDOS (otras ventas):')
    L.push(ejemplos.sugerencias.map(x => `Comprador: ${x.pregunta}\nVendedor: ${x.respuesta}`).join('\n\n'))
  }
  // Hoy (07-11): para decir el día de envío según los días de despacho de las POLÍTICAS.
  const tz = COUNTRY_TZ[country as 'VE' | 'CO'] ?? COUNTRY_TZ.VE
  L.push(`\nHOY: ${new Intl.DateTimeFormat('es-VE', { timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date())}`)
  L.push('\nCONVERSACIÓN (de la más vieja a la más nueva):')
  for (const m of hilo.mensajes.slice(-30)) {
    const t = textoPlano(m.texto).slice(0, 600)
    L.push(`${m.propio ? 'Vendedor' : 'Comprador'} (${m.fecha.slice(0, 16).replace('T', ' ')}): ${t}${m.adjuntos.length ? ' [mandó un adjunto]' : ''}`)
  }

  // 08-11 (el dueño): Haiku 5.5 escribe los mensajes (antes Sonnet, ~20× más caro). Un reintento si falla.
  const llamar = () => llamarClaude<BorradorMensaje>({ sistema: SISTEMA, contenido: L.join('\n'), herramienta: HERRAMIENTA, modelo: MODELO_SIMPLE })
  const { resultado: b, uso, modelo } = await llamar().catch(() => llamar())
  return {
    respuesta: String(b.respuesta ?? '').trim().slice(0, 350),
    confianza: ['alta', 'media', 'baja'].includes(b.confianza) ? b.confianza : 'baja',
    falta_dato: b.falta_dato || null,
    pedido_especial: typeof b.pedido_especial === 'string' && b.pedido_especial.trim() ? b.pedido_especial.trim().slice(0, 200) : null,
    reclamo: typeof b.reclamo === 'string' && b.reclamo.trim() ? b.reclamo.trim().slice(0, 200) : null,
    uso, modelo, ejemplos: ejemplos.sugerencias.length,
  }
}
