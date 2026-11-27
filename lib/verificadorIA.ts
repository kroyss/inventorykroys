// Verificador de afirmaciones (31-10, meta del dueño: ~95% de acierto en lo que la IA dé por seguro, sin comprometer
// al vendedor con cosas que no sabe). La evaluación de octubre mostró que la confianza "alta" del borrador no alcanza:
// inventaba colores, ciudades y números técnicos con confianza alta. Aquí Haiku separa el borrador en afirmaciones y
// busca cada una en los mismos datos que vio la IA; si alguna no está escrita, o falta contestar una parte, el borrador
// baja a confianza "baja" (lo revisa una persona y nunca saldría solo). Solo se verifican los de confianza alta/media.
import { llamarClaude, MODELO_SIMPLE, type LlamadaIA } from '@/lib/ia'

const SISTEMA = `Verificas un BORRADOR de respuesta a una pregunta de MercadoLibre Venezuela antes de que se publique solo, sin que lo revise una persona. Tu trabajo es encontrar cualquier cosa afirmada que NO esté escrita en los DATOS.

1. Separa el borrador en afirmaciones concretas (hay disponible, color X, mide Y, envío gratis por Z, mínimo N unidades, retiro en tal zona, garantía, plazo, compatibilidad, qué incluye...). Saludos, despedidas y "el precio es el publicado" no son afirmaciones que verificar.
2. Para cada afirmación, busca dónde está escrita y marca respaldada:
   - Datos del producto (color, medida, números, compatibilidad, qué incluye): en el título, ficha técnica, descripción, VARIANTES, notas del vendedor, o en una respuesta anterior del vendedor en ESTA MISMA publicación. El número o el color debe ser el MISMO (75 no es 70; "rojo" no respalda "dorado").
   - Disponibilidad y cantidades: en DISPONIBLE EN MERCADOLIBRE o VARIANTES (una cantidad pedida debe alcanzar).
   - Envío gratis, mínimos, agencias: en la línea ENVÍO GRATIS A ESTE PRECIO, las POLÍTICAS o las RESPUESTAS RÁPIDAS que aplican. Una respuesta anterior NO respalda montos ni mínimos de envío (pueden estar viejos).
   - Ubicación, retiro, garantía, factura, plazos, pagos: en POLÍTICAS o RESPUESTAS RÁPIDAS.
   - Si no la encuentras escrita, respaldada = false. No la deduzcas ni la des por obvia.
3. Separa la pregunta en sus partes y anota en partes_sin_contestar las que el borrador no contesta (o contesta con otra cosa).
4. Anota en mal_entendida = true si la pregunta no se entiende sola (no está claro a qué se refiere) y nada en los datos lo aclara.

Siempre termina llamando a la herramienta verificar.`

const HERRAMIENTA = {
  name: 'verificar',
  description: 'Entrega la verificación del borrador.',
  input_schema: {
    type: 'object',
    properties: {
      afirmaciones: {
        type: 'array',
        items: {
          type: 'object',
          properties: { afirmacion: { type: 'string' }, donde: { type: 'string', description: 'Dónde está escrita, o "ninguna".' }, respaldada: { type: 'boolean' } },
          required: ['afirmacion', 'donde', 'respaldada'],
        },
      },
      partes_sin_contestar: { type: 'array', items: { type: 'string' } },
      mal_entendida: { type: 'boolean' },
    },
    required: ['afirmaciones', 'partes_sin_contestar', 'mal_entendida'],
  },
}

// Versión 2 (07-11): el de arriba frenaba por detalles (el saludo, "colores claros", la conversión a Bs, "dos días" sin decir
// "el lunes"). Esto se suma y manda.
const SISTEMA_V2_EXTRA = `

AJUSTES (mandan sobre lo anterior):
- NO son afirmaciones que verificar: saludos y despedidas, frases de cortesía, "el precio es el publicado", "a tasa BCV", "lo hacemos en el menor tiempo posible", "el despacho se confirma al concretar la compra", "déjanos verificar", ni descripciones obvias de un dato que sí está (blanco o nude son colores claros; si VARIANTES dice 0 de una talla, "no la tenemos" está respaldado).
- Una conversión a bolívares sale de la línea PRECIO EN MERCADOLIBRE AHORA: respaldada.
- Lo que dice una RESPUESTA RÁPIDA del vendedor que aplica, o lo que el vendedor ya respondió igual en ESTA publicación, está respaldado.
- partes_sin_contestar: solo si una parte quedó SIN ninguna respuesta. Una respuesta general correcta o la frase segura de despacho cuenta como contestada ("¿si compro el lunes cuándo llega?" → "normalmente son dos días" está contestada).
- Tampoco son afirmaciones (10-11): recomendar verificarlo con un técnico o en su equipo, "las fotos son referenciales", invitar a ver el CATÁLOGO DE LA TIENDA con su link, "no trabajamos con <medio de pago>" cuando ese medio no está en las POLÍTICAS, y "perfecto, quedo a su orden" a quien no preguntó nada.
- Un plazo de despacho o un dato del producto escrito en DATOS QUE EL VENDEDOR ANOTÓ o en las POLÍTICAS está respaldado.
- Tampoco son afirmaciones (11-11): "quedamos/estaremos atentos a su consulta", "con gusto le respondemos cualquier duda", "podemos confirmarle la compra hoy" (es cortesía, no un plazo).
- "¿Precio?" contestado con "el precio es el publicado (a tasa BCV)" está CONTESTADO: no hace falta la cifra.
- Un mínimo de unidades o de monto para el envío gratis escrito en las POLÍTICAS o en ENVÍO GRATIS A ESTE PRECIO está respaldado (también decir que con 1 unidad no aplica, si el mínimo es 2).
- "Por este medio no se pueden mandar imágenes/fotos" contesta un pedido de fotos: CONTESTADO.
- (11-11) Decir que NO tenemos un dato ("la potencia en W no la tenemos", "el tiempo de llegada no lo tenemos con exactitud") no es una afirmación: no la marques.
- (11-11) En una respuesta condicional ("si su llave tiene chip necesita un bypass; si es de 12V sirve") la condición no se verifica: solo lo que afirma fuera del "si" (p. ej. que es universal para 12V).
- (11-11) Cómo se compra en MercadoLibre (elegir la cantidad o el color antes de comprar, comprar la cantidad que necesite, llenar el formulario) no es una afirmación del producto.
- (11-11) El mínimo de unidades para envío gratis cuenta el TOTAL de la compra en esta publicación, aunque sean colores distintos: "3 unidades (2 rojos y 1 azul) cumplen el mínimo de 2" está respaldado si el mínimo está escrito y cada color tiene disponibles.
- (11-11) La línea ENVÍO GRATIS PARA LA CANTIDAD QUE PIDE respalda el envío gratis de esa cantidad.
- (11-11) Si las RESPUESTAS ANTERIORES se contradicen, decide lo escrito en la ficha, la descripción, las notas o las fotos: si eso respalda el borrador, está respaldado.
- Sigue siendo NO respaldado: colores, tallas, medidas, números, plazos, mínimos, agencias, cobros o compatibilidades que no estén escritos.`

// Versión 3 (11-11, el dueño con 171 marcadas: el verificador frenó 72 y solo 16 eran errores reales). Se clasifica cada
// afirmación por TIPO y solo frenan las de riesgo sin respaldo; "falta contestar" solo si quedó sin respuesta lo PRINCIPAL.
// Lo que respaldaba bien (inventar números, stock, compatibilidad, contradicciones) sigue frenando.
const SISTEMA_V3_EXTRA = `

VERSIÓN 3 (manda sobre todo lo anterior):
- A cada afirmación ponle "tipo":
  · "producto": números, medidas, voltaje, potencia, capacidad, colores, tallas, material, modelo, qué incluye o trae.
  · "compatibilidad": si sirve para un vehículo, equipo o modelo concreto.
  · "stock": hay disponible, cantidades, variantes que hay o no hay.
  · "envio": agencias, envío gratis o cobro a destino, mínimos para envío gratis, plazos de despacho o de llegada, ciudades.
  · "pago": medios de pago, descuentos, factura, garantía, montos o precios con cifra.
  · "otro": todo lo demás: saludos, cortesía, gracias, "quedo a su orden", "el precio es el publicado a tasa BCV", cómo comprar en MercadoLibre (elegir cantidad o color, llenar el formulario), recomendaciones (verificar con un técnico, ver el catálogo), decir que NO tenemos un dato, condiciones ("si su equipo tiene X…"), aclarar cuál es esta publicación.
- Las POLÍTICAS (incluida la sección de Mi IA) son del vendedor: lo que el borrador repite de ahí está respaldado aunque lo diga con otras palabras (mínimo de 2 unidades, envío gratis por ZOOM y TEALCA, un día hábil, retiro).
- "principal_sin_contestar" = true SOLO si lo principal que preguntó quedó sin ninguna respuesta (preguntó si sirve y no dice nada de eso). Un detalle que falta o una respuesta general no cuenta.
- También es "principal_sin_contestar" = true si el SÍ/NO del borrador contesta lo contrario de lo que se preguntó, sobre todo con negaciones: preguntó "¿los tienes SIN protección UV?" y el borrador dice "Sí, tienen protección UV" (debía ser "No, vienen con protección UV"). En "que_falta" pon "El sí/no no corresponde a lo que preguntó".`

export interface Verificacion { ok: boolean; motivo: string | null; llamada: LlamadaIA; sinRespaldo?: { afirmacion: string; tipo?: string }[] }
const TIPOS_RIESGO = ['producto', 'compatibilidad', 'stock', 'envio', 'pago']
const HERRAMIENTA_V3 = {
  ...HERRAMIENTA,
  input_schema: {
    type: 'object',
    properties: {
      afirmaciones: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            afirmacion: { type: 'string' }, donde: { type: 'string', description: 'Dónde está escrita, o "ninguna".' }, respaldada: { type: 'boolean' },
            tipo: { type: 'string', enum: ['producto', 'compatibilidad', 'stock', 'envio', 'pago', 'otro'] },
          },
          required: ['afirmacion', 'donde', 'respaldada', 'tipo'],
        },
      },
      principal_sin_contestar: { type: 'boolean' },
      que_falta: { type: 'string', description: 'Si principal_sin_contestar: qué quedó sin responder (una frase).' },
    },
    required: ['afirmaciones', 'principal_sin_contestar'],
  },
}

/** `datos` = el mismo bloque de contexto que recibió la IA del borrador. */
export async function verificarBorrador(datos: string, pregunta: string, borrador: string, modeloV = MODELO_SIMPLE, v2 = false, v3 = false): Promise<Verificacion> {
  if (v3) return verificarV3(datos, pregunta, borrador, modeloV)
  const { resultado: r, uso, modelo } = await llamarClaude<{
    afirmaciones?: { afirmacion: string; donde: string; respaldada: boolean }[]; partes_sin_contestar?: string[]; mal_entendida?: boolean
  }>({
    para: 'Preguntas: verificador', sistema: SISTEMA + (v2 ? SISTEMA_V2_EXTRA : ''), herramienta: HERRAMIENTA, modelo: modeloV, maxTokens: 700,
    contenido: `DATOS:\n${datos}\n\n────────\nPREGUNTA: ${pregunta}\n\nBORRADOR A VERIFICAR:\n${borrador}`,
  })
  // v2: Haiku a veces igual marca la cortesía o "el precio es el publicado" (07-11, 3 de 30): se descartan aquí.
  // 11-11 (revisión del dueño): también "quedamos/estaremos atentos", "con gusto le respondemos", "podemos confirmarle la compra".
  const CORTESIA = /^([\s¡!.,]*(hola|buenas?( (tardes|noches|d[ií]as))?|saludos|con gusto|quedo a (su|tu) orden|estamos a (su|tu) orden|gracias|oferta con confianza)[\s¡!.,]*)+$|precio (es )?(el )?publicado|tasa bcv|menor tiempo posible|se confirma al concretar|(estaremos|quedamos|estamos) atent|atent[oa]s? a (su|tu) consulta|con gusto le (respond|atend|ayud)|cualquier (otra )?duda|podemos confirmarle la compra/i
  const sinRespaldo = lista(r.afirmaciones).filter(a => (!a.respaldada || /^ninguna/i.test(a.donde ?? '')) && !(v2 && CORTESIA.test((a.afirmacion ?? '').trim())))
  // 11-11: Haiku a veces anota como "sin contestar" una parte y en la misma línea dice que sí se contestó ("…lo cual sí
  // responde la petición"), o pide la cifra cuando "el precio es el publicado" ya contesta. Esas no cuentan.
  const YA_CONTESTADA = /\b(s[ií] (la |lo )?(respond|contest)|lo cual (s[ií] )?(respond|contest)|(queda|quedan|est[aá]|fue) contestad|\(contestada\)|ninguna parte|responde (la|a la) petici[oó]n|es la respuesta correcta|lo cual es correct|\(contestad[oa]:|contestad[oa]: s[ií])/i
  const precioPublicado = /precio (es )?(el )?publicado/i.test(borrador)
  const faltan = (r.partes_sin_contestar ?? []).filter(f => !(v2 && (YA_CONTESTADA.test(f) || (precioPublicado && /^\W*(el )?precio\b/i.test(f) && !/env[ií]o|agencia|bs|bol[ií]var/i.test(f.split(':')[0])))))
  const motivo = sinRespaldo.length ? `No está en los datos: ${sinRespaldo.map(a => a.afirmacion).join('; ')}`
    : faltan.length ? `Falta contestar: ${faltan.join('; ')}`
    : r.mal_entendida ? 'La pregunta no se entiende sola' : null
  return { ok: !motivo, motivo: motivo?.slice(0, 300) ?? null, llamada: { modelo, uso } }
}

async function verificarV3(datos: string, pregunta: string, borrador: string, modeloV: string): Promise<Verificacion> {
  const { resultado: r, uso, modelo } = await llamarClaude<{
    afirmaciones?: { afirmacion: string; donde: string; respaldada: boolean; tipo?: string }[]; principal_sin_contestar?: boolean; que_falta?: string
  }>({
    para: 'Preguntas: verificador', sistema: SISTEMA + SISTEMA_V2_EXTRA + SISTEMA_V3_EXTRA, herramienta: HERRAMIENTA_V3, modelo: modeloV, maxTokens: 900,
    contenido: `DATOS:\n${datos}\n\n────────\nPREGUNTA: ${pregunta}\n\nBORRADOR A VERIFICAR:\n${borrador}`,
  })
  if (!esLista(r.afirmaciones)) return { ok: false, motivo: 'El verificador no respondió bien: lo revisa una persona', llamada: { modelo, uso } }
  const sinRespaldo = lista(r.afirmaciones).filter(a => (!a.respaldada || /^ninguna/i.test(a.donde ?? ''))
    && TIPOS_RIESGO.includes(a.tipo ?? 'producto'))
  const motivo = sinRespaldo.length ? `No está en los datos: ${sinRespaldo.map(a => a.afirmacion).join('; ')}`
    : r.principal_sin_contestar ? `Falta contestar: ${r.que_falta || 'lo principal de la pregunta'}` : null
  return { ok: !motivo, motivo: motivo?.slice(0, 300) ?? null, llamada: { modelo, uso }, sinRespaldo: sinRespaldo.map(a => ({ afirmacion: a.afirmacion, tipo: a.tipo })) }
}

// 11-11: a veces Haiku devuelve las afirmaciones como texto JSON en vez de lista. Se intenta leer; si no se puede, en v3 frena.
function lista<T>(x: T[] | string | undefined | null): T[] {
  if (Array.isArray(x)) return x
  if (typeof x === 'string') { try { const v = JSON.parse(x); if (Array.isArray(v)) return v } catch { /* no es JSON */ } }
  return []
}
function esLista(x: unknown) { return Array.isArray(x) || (typeof x === 'string' && Array.isArray((() => { try { return JSON.parse(x) } catch { return null } })())) }

// ── Verificador de MENSAJES post-venta (21-11, el dueño: «¿por qué Mensajes rinde menos que Preguntas?») ─────────────
// En medición: Mensajes no tenía verificador, así que toda respuesta con confianza media o baja quedaba para una persona
// (304 de 1.373 frenadas solo por eso). Mismo enfoque que v3, con los datos y riesgos propios de después de la compra.
const SISTEMA_MENSAJE = `Verificas un BORRADOR de respuesta a un mensaje POST-VENTA (el comprador YA compró) de un vendedor de MercadoLibre Venezuela, antes de que se envíe solo sin que lo revise una persona. Tu trabajo es encontrar cualquier cosa afirmada que NO esté escrita en los DATOS.

1. Separa el borrador en afirmaciones concretas y ponle a cada una un "tipo":
   · "producto": color, variante, talla, medida, qué incluye, cuántas unidades compró.
   · "estado": que el pago se recibió o la compra está pagada, que tiene guía (y su número), que ya se envió o despachó, en qué paso está la compra.
   · "envio": agencia, envío gratis o cobro a destino, día o plazo de despacho, tiempo de llegada, ciudad, retiro en persona.
   · "pago": montos (Bs o $), datos para pagar (cuentas, pago móvil, teléfonos), adicionales como el embalaje, medios de pago.
   · "compromiso": algo que el vendedor va a hacer distinto de lo normal (cambiar color, mandar junto con otra compra, reservar, reembolsar, enviar fotos, llamar).
   · "otro": saludo, cortesía, gracias, "quedo a su orden", repetir lo que dijo el comprador, explicar cómo completar MercadoEnvíos con el link que ya está en la conversación, decir que el equipo lo revisa, pedirle un dato al comprador, recordar que algo es opcional.
2. Para cada afirmación marca "respaldada" y anota "donde":
   - producto: PRODUCTOS DE LA VENTA (la VARIANTE QUE COMPRÓ manda sobre fotos y ficha), ficha, descripción, fotos, notas del vendedor.
   - estado: las líneas PAGO y ENVÍO, o el aviso automático de guía de MercadoLibre dentro de la CONVERSACIÓN. Que el comprador diga "ya pagué" o mande un adjunto NO respalda "recibimos su pago" ni "su pago está confirmado" (sí respalda "recibimos su mensaje/captura"). Un número de guía tiene que ser EXACTAMENTE el mismo.
   - envio: la línea ENVÍO GRATIS DE ESTA COMPRA, las POLÍTICAS o las RESPUESTAS RÁPIDAS. Un día de despacho ("mañana miércoles", "hoy") tiene que cuadrar con HOY y con los días de despacho escritos en las POLÍTICAS.
   - pago: los datos para pagar solo si están copiados EXACTOS de las POLÍTICAS o de lo que el VENDEDOR ya escribió en la conversación o sus respuestas rápidas; el monto del embalaje u otro adicional, igual; un total en Bs, del TOTAL DE LA VENTA.
   - compromiso: solo si las POLÍTICAS lo permiten o el vendedor ya lo ofreció en esta conversación.
   - Lo que el VENDEDOR ya dijo en esta misma conversación está respaldado. Las POLÍTICAS (incluida Mi IA) también, aunque se digan con otras palabras.
   - Si no la encuentras escrita, respaldada = false. No la deduzcas ni la des por obvia.
3. "principal_sin_contestar" = true SOLO si lo principal de lo ÚLTIMO que escribió el comprador quedó sin ninguna respuesta, o el borrador contesta otra cosa (pidió los datos para pagar y solo le dicen el día de envío). Una respuesta corta a un "ok", "listo" o "gracias" está contestada.

AJUSTES (21-11, primera medición: frenaba frases que el equipo usa siempre; mandan sobre lo anterior):
- Son "otro" (no se verifican): "le avisamos / le confirmamos / le respondemos por aquí (por este chat)", "lo verificamos / lo revisamos con el equipo", "verificamos su pago y el día en que procesamos el envío", "recibimos su mensaje / su comprobante / su captura / su aviso", "el embalaje es opcional y puede agregarlo cuando quiera" (si el vendedor ya lo ofreció), repetir lo que el comprador contó ("me alegra que ya lo haya recibido"), y cualquier frase de cortesía o despedida. Es el proceso normal del vendedor, no una promesa nueva.
- Un saludo ("buenas tardes", "hola") contestado con un saludo cordial y/o el estado de su compra está CONTESTADO.
- 22-11: si pide que le llenemos el formulario de MercadoEnvíos, explicarle que lo llena él desde su cuenta (no tenemos acceso) y guiarlo con el video o los pasos está CONTESTADO, y es "otro". Que debe volver a ofertar con el mínimo de unidades está respaldado si la línea MÍNIMO PARA ENVÍO GRATIS lo dice.
- "El envío sale el próximo día hábil" está respaldado si las POLÍTICAS dicen días de despacho. Un día concreto ("mañana jueves", "el lunes", "hoy") está respaldado si sale de HOY y de esos días (HOY martes y despacho de lunes a viernes → "mañana miércoles" respaldado; HOY sábado → "el lunes"). Solo frena si no cuadra.
- Tiempo de LLEGADA ("tarda 2 a 3 días", "le llega el jueves"): respaldado SOLO si está escrito en las POLÍTICAS. Que el vendedor lo haya dicho en otras conversaciones o en respuestas anteriores NO lo respalda. "El tiempo de la agencia no lo sabemos con exactitud" es "otro".
- Estado del envío ("ya salió", "aún no se ha despachado"): solo con la línea ENVÍO o el aviso de guía que lo diga; tener guía NO quiere decir que ya salió ni que no salió.
- 27-11 (el dueño): si el comprador PIDE los datos para pagar (pago móvil, cuenta), darle los de las POLÍTICAS (copiados exactos) ENCAJA y está respaldado, sea para pagar la compra o el embalaje: el comprador paga al vendedor y sube el comprobante en MercadoEnvíos. No lo frenes por "el pago de la compra va por MercadoEnvíos" ni porque no le sale el formulario.
- Sigue frenando: decir que un pago aparte (embalaje, transferencia, diferencia) ya se RECIBIÓ o está CONFIRMADO; datos para pagar que no estén escritos exactos; un número de guía distinto; decir dónde va el paquete o que llegó sin un dato que lo diga; montos o costos de envío prometidos ("le confirmamos el costo exacto"); compromisos distintos de lo normal (cambiar color, mandar foto de la guía si el vendedor no lo ofrece, reservar, reembolsar); hablar del comprador en tercera persona ("el comprador mandó…").`

// 21-11, 2ª medición (el dueño revisó: fallaban por no entender la situación, no por datos inventados).
const SISTEMA_MENSAJE_ENCAJE = `

¿ENCAJA CON LA CONVERSACIÓN? (campo "no_encaja"; null si encaja). Lee la CONVERSACIÓN completa y lo último del comprador, y anota en una frase si el borrador:
- contradice lo que el comprador acaba de decir o lo que ya pasó en el chat (dice que ya pagó, ya llenó el formulario, ya recibió, o que el paquete está en tránsito, y el borrador le pide hacerlo o dice que no se despachó; ya eligió agencia y el borrador le ofrece otra);
- contesta algo que nadie preguntó en lugar de lo último que escribió (a un "ok" o "gracias" le lista medios de pago, cobros o condiciones que no venían al caso; le habla de cobro a destino cuando ya tiene guía de envío gratis);
- le dice que le manda o le da algo (un link, datos, una foto, un contacto) y no lo incluye;
- le da datos para pagar (cuentas, pago móvil) que el comprador no pidió;
- habla del comprador en tercera persona o comenta el mensaje ("parece un recordatorio", "el comprador mandó…");
- no tiene sentido con lo último que escribió (le agradece "el número" si no mandó ninguno).
Una respuesta corta y cordial que cuadra con lo que pasa ENCAJA aunque no agregue nada.`

const SISTEMA_MENSAJE_FIN = `

Siempre termina llamando a la herramienta verificar.`

const HERRAMIENTA_MENSAJE = {
  ...HERRAMIENTA_V3,
  input_schema: {
    ...HERRAMIENTA_V3.input_schema,
    properties: {
      ...HERRAMIENTA_V3.input_schema.properties,
      afirmaciones: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            afirmacion: { type: 'string' }, donde: { type: 'string', description: 'Dónde está escrita, o "ninguna".' }, respaldada: { type: 'boolean' },
            tipo: { type: 'string', enum: ['producto', 'estado', 'envio', 'pago', 'compromiso', 'otro'] },
          },
          required: ['afirmacion', 'donde', 'respaldada', 'tipo'],
        },
      },
      no_encaja: { type: ['string', 'null'], description: 'Si el borrador no encaja con la conversación: por qué, en una frase. Si encaja, null.' },
    },
    required: ['afirmaciones', 'principal_sin_contestar', 'no_encaja'],
  },
}
const RIESGO_MENSAJE = ['producto', 'estado', 'envio', 'pago', 'compromiso']

/** `datos` = el mismo contexto que vio la IA del borrador (borradorMensaje → contexto). `comprador` = lo último que escribió. */
export async function verificarMensaje(datos: string, comprador: string, borrador: string, modeloV = MODELO_SIMPLE): Promise<Verificacion> {
  const { resultado: r, uso, modelo } = await llamarClaude<{
    afirmaciones?: { afirmacion: string; donde: string; respaldada: boolean; tipo?: string }[]; principal_sin_contestar?: boolean; que_falta?: string
    no_encaja?: string | null
  }>({
    para: 'Mensajes: verificador', sistema: SISTEMA_MENSAJE + SISTEMA_MENSAJE_ENCAJE + SISTEMA_MENSAJE_FIN, herramienta: HERRAMIENTA_MENSAJE, modelo: modeloV, maxTokens: 900,
    contenido: `DATOS:\n${datos}\n\n────────\nLO ÚLTIMO QUE ESCRIBIÓ EL COMPRADOR: ${comprador || '(solo mandó un adjunto)'}\n\nBORRADOR A VERIFICAR:\n${borrador}`,
  })
  if (!esLista(r.afirmaciones)) return { ok: false, motivo: 'El verificador no respondió bien: lo revisa una persona', llamada: { modelo, uso } }
  const sinRespaldo = lista(r.afirmaciones).filter(a => (!a.respaldada || /^ninguna/i.test(a.donde ?? '')) && RIESGO_MENSAJE.includes(a.tipo ?? 'producto'))
  const noEncaja = typeof r.no_encaja === 'string' && r.no_encaja.trim() && !/^(null|ninguno|encaja)\b/i.test(r.no_encaja.trim()) ? r.no_encaja.trim() : null
  const motivo = sinRespaldo.length ? `No está en los datos: ${sinRespaldo.map(a => a.afirmacion).join('; ')}`
    : r.principal_sin_contestar ? `Falta contestar: ${r.que_falta || 'lo principal del mensaje'}`
    : noEncaja ? `No encaja con la conversación: ${noEncaja}` : null
  return { ok: !motivo, motivo: motivo?.slice(0, 300) ?? null, llamada: { modelo, uso }, sinRespaldo: sinRespaldo.map(a => ({ afirmacion: a.afirmacion, tipo: a.tipo })) }
}
