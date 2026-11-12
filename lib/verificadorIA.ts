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
