// Borrador de respuesta con IA para los mensajes POST-VENTA (Automatizaciones → Mensajes).
//
// La IA lee la conversación completa y los datos de la venta (productos y stock real, nota de
// ML, estado en el sistema, guía si ya se despachó) más lo que el vendedor respondió antes a
// mensajes parecidos (su voz). Solo propone: la persona revisa y envía.
import type { Pool } from 'pg'
import { llamarClaude, type UsoIA } from '@/lib/ia'
import { itemsDeVenta, leerHilo, sugerenciasMensaje, textoPlano } from '@/lib/mensajesML'
import { leerNotas } from '@/lib/notasML'
import { mlFetch } from '@/lib/ml'

const ESTADO_VENTA: Record<string, string> = {
  BORRADOR: 'cargada en el sistema, pago todavía sin verificar',
  PAGO_VERIFICADO: 'pago verificado, por preparar',
  PROCESADA: 'en preparación para despachar',
  DESCARGADA: 'preparada / despachada',
  DESCARGADA_LOCAL: 'entregada en persona (venta local)',
  REABIERTA: 'reabierta (se está corrigiendo)',
}

const SISTEMA = `Eres quien responde los mensajes POST-VENTA (después de la compra) de un vendedor venezolano de MercadoLibre. Escribes el BORRADOR; una persona lo revisa antes de enviarlo.

Cómo responder:
- Responde a lo ÚLTIMO que escribió el comprador, teniendo en cuenta toda la conversación, la nota de la venta y su estado.
- Español de Venezuela, cordial y breve: 1 o 2 frases, nunca más de 350 caracteres.
- Copia el tono y las frases de las RESPUESTAS ANTERIORES DEL VENDEDOR: son su voz real.
- Para dudas del producto (cómo se usa, qué incluye, compatibilidad) usa su FICHA, DESCRIPCIÓN y FICHA DE CONOCIMIENTO.
- En Venezuela MercadoLibre no tiene carrito de compras: no lo menciones.
- Usa SOLO los datos que te doy. Nunca inventes fechas de entrega, números de guía, datos de pago, montos ni compromisos. Si el dato no está, dilo en "falta_dato" y deja una respuesta prudente (o vacía) con confianza "baja".
- Si hay GUÍA de envío, puedes darla. Si no la hay, no digas que ya se envió.
- Si el comprador solo saluda o agradece, responde corto y amable.
- Nada de correos, redes sociales ni links que no sean de MercadoLibre.

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
    },
    required: ['respuesta', 'confianza', 'falta_dato'],
  },
}

export interface BorradorMensaje { respuesta: string; confianza: 'alta' | 'media' | 'baja'; falta_dato: string | null }

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
      `SELECT m.ml_code, p.name, COALESCE(i.quantity, 0)::int AS stock
       FROM product_ml_codes m JOIN products p ON p.id = m.product_id LEFT JOIN inventory i ON i.product_id = p.id
       WHERE m.ml_code = ANY($1::text[]) AND p.is_active`, [codigos])
    L.push('PRODUCTOS DE LA VENTA:')
    for (const it of venta.items) {
      const s = stock.find(x => x.ml_code === it.id.replace(/^[A-Z]{3}/, ''))
      L.push(`- ${it.cantidad} × ${it.titulo}${s ? ` (stock real en el sistema: ${s.stock})` : ''}`)
    }
  }
  // Producto: ficha técnica (catálogo), descripción (ML) y ficha de conocimiento (lo que el
  // vendedor ya respondió). Para preguntas post-venta de uso, contenido o compatibilidad.
  for (const it of (venta?.items ?? []).slice(0, 3)) {
    const { rows: [cat] } = await db.query(`SELECT ficha FROM ml_catalogo WHERE item_id = $1`, [it.id])
    const { rows: [fc] } = await db.query(`SELECT texto FROM ml_item_fichas WHERE item_id = $1`, [it.id])
    const desc = await mlFetch<{ plain_text?: string }>(db, conexionId, `/items/${it.id}/description`)
      .then(d => d.plain_text?.trim() || null).catch(() => null)
    if (!cat?.ficha && !fc?.texto && !desc) continue
    L.push(`\nPRODUCTO "${it.titulo}":`)
    if (cat?.ficha) L.push(`Ficha: ${cat.ficha}`)
    if (desc) L.push(`Descripción: ${desc.slice(0, 2500)}`)
    if (fc?.texto) L.push(`Ficha de conocimiento (lo que el vendedor ya respondió de este producto):\n${fc.texto}`)
  }
  if (venta?.comprador.nombre || venta?.comprador.nick) L.push(`COMPRADOR: ${[venta.comprador.nombre, venta.comprador.nick].filter(Boolean).join(' · ')}`)
  const { rows: [s] } = await db.query(`SELECT status, notes FROM sales WHERE ml_order_number = $1`, [pack])
  if (conInventario) {
    L.push(s ? `ESTADO EN EL SISTEMA: ${ESTADO_VENTA[s.status] ?? s.status}` : 'ESTADO EN EL SISTEMA: la venta todavía no está cargada (el pago no se ha registrado).')
  } else {
    const { rows: [o] } = await db.query(`SELECT estado FROM ml_ordenes WHERE id::text = $1 OR pack_id::text = $1 LIMIT 1`, [pack])
    if (o?.estado === 'cancelled') L.push('ESTADO DE LA VENTA: cancelada en MercadoLibre.')
  }
  if (country === 'VE') {
    const { rows: [g] } = await db.query(
      `SELECT e.carrier, COALESCE(e.guia_final, e.guia) AS guia, j.status AS jornada, j.closed_at
       FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id JOIN despacho_jornadas j ON j.id = l.jornada_id
       WHERE e.venta = $1 AND e.impresa AND l.status = 'GENERADO' ORDER BY e.id DESC LIMIT 1`, [pack])
    if (g) L.push(`ENVÍO: guía ${g.carrier} ${g.guia}` + (g.jornada === 'CERRADA' ? ' (paquete entregado al transportista)' : ' (etiqueta impresa, el paquete todavía no salió)'))
    else L.push('ENVÍO: todavía no tiene guía impresa (no se ha despachado).')
  }
  const textoNotas = [...notas.notas.map(n => n.texto), s?.notes].filter((x): x is string => !!x?.trim())
  if (textoNotas.length) L.push(`NOTA DE LA VENTA: ${[...new Set(textoNotas)].join(' · ')}`)
  const { rows: [pol] } = await db.query(`SELECT value FROM app_settings WHERE key = 'preguntas_politicas'`)
  if (pol?.value?.trim()) L.push(`\nPOLÍTICAS DEL VENDEDOR:\n${pol.value.trim()}`)
  if (ejemplos.sugerencias.length) {
    L.push('\nRESPUESTAS ANTERIORES DEL VENDEDOR A MENSAJES PARECIDOS (otras ventas):')
    L.push(ejemplos.sugerencias.map(x => `Comprador: ${x.pregunta}\nVendedor: ${x.respuesta}`).join('\n\n'))
  }
  L.push('\nCONVERSACIÓN (de la más vieja a la más nueva):')
  for (const m of hilo.mensajes.slice(-30)) {
    const t = textoPlano(m.texto).slice(0, 600)
    L.push(`${m.propio ? 'Vendedor' : 'Comprador'} (${m.fecha.slice(0, 16).replace('T', ' ')}): ${t}${m.adjuntos.length ? ' [mandó un adjunto]' : ''}`)
  }

  const { resultado: b, uso, modelo } = await llamarClaude<BorradorMensaje>({ sistema: SISTEMA, contenido: L.join('\n'), herramienta: HERRAMIENTA })
  return {
    respuesta: String(b.respuesta ?? '').trim().slice(0, 350),
    confianza: ['alta', 'media', 'baja'].includes(b.confianza) ? b.confianza : 'baja',
    falta_dato: b.falta_dato || null,
    uso, modelo, ejemplos: ejemplos.sugerencias.length,
  }
}
