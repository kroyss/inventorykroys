// Sugerencias de la burbuja de ayuda por pantalla (30-10-2026): preguntas frecuentes con la respuesta YA escrita,
// sin IA (gratis). Salen del manual (docs/ayuda/sistema.md): si cambia el manual, revisar estas también.
// `video` = título del video de la Central de aprendizaje que conviene ver (se busca por título).
export interface Sugerencia { pregunta: string; respuesta: string; video?: string }

const S: Record<string, Sugerencia[]> = {
  '/automatizaciones': [
    { pregunta: '¿Por dónde empiezo?', video: 'Así trabajas desde hoy',
      respuesta: '1. Mira los videos de **Aprendizaje** (son cortos).\n2. Conecta tu cuenta en **Cuentas de MercadoLibre**.\n3. Empieza por **Preguntas** y **Mensajes**: ahí entra lo de todas tus cuentas.' },
    { pregunta: '¿Cómo conecto mi cuenta de MercadoLibre?', video: 'Conectar tu cuenta de MercadoLibre',
      respuesta: 'En **Cuentas de MercadoLibre** toca **Conectar cuenta**, entra a ML con esa cuenta y acepta. Para otra cuenta, cierra sesión en ML (o usa otra ventana) y repite.' },
  ],
  '/cuentas-ml': [
    { pregunta: '¿Cómo conecto otra cuenta?', video: 'Conectar tu cuenta de MercadoLibre',
      respuesta: 'Cierra sesión en MercadoLibre (o abre otra ventana / perfil de Chrome), toca **Conectar cuenta** y entra con la otra cuenta. Si no cierras sesión, ML vuelve a conectar la misma.' },
    { pregunta: 'Mi cuenta dice desconectada', respuesta: 'Pasa si cambiaste la clave de ML o venció el permiso. Toca **Reconectar** y entra de nuevo: mientras tanto no entra nada de esa cuenta.' },
  ],
  '/preguntas': [
    { pregunta: '¿Cuánto gasta «Proponer con IA»?',
      respuesta: 'Cada **Proponer con IA** usa 1 crédito. **Buscar en internet** usa 1 más 1 por búsqueda (hasta 4). Las respuestas rápidas, las parecidas y lo aprendido son gratis. Los créditos se renuevan el día 1.' },
    { pregunta: '¿Cómo hago que la IA responda mejor?', video: 'Preguntas con IA',
      respuesta: 'Escribe tus **Políticas para la IA** (envíos, pagos, garantía, horarios) y, cuando respondas algo que no sabía, usa **Anotar dato del producto**: la próxima vez lo usa.' },
    { pregunta: '¿Se responden solas?', respuesta: 'No. Cuando una pregunta se parece a otra ya respondida, la respuesta aparece escrita y tú la envías (también varias con «Enviar las sugeridas»). Siempre la envía una persona.' },
  ],
  '/mensajes': [
    { pregunta: '¿Por qué sigue sin leer en MercadoLibre?', respuesta: 'Leer aquí no lo marca como leído en ML: se marca cuando respondes o tocas el sobre.' },
    { pregunta: '¿Cómo mando una foto o un PDF?', video: 'Mensajes',
      respuesta: 'Toca el clip para adjuntar (JPG, PNG o PDF) o pega la imagen con **Ctrl+V** en el cuadro de texto. **Ctrl+Enter** envía.' },
    { pregunta: '¿Para qué es la nota de la venta?', respuesta: 'Es una nota interna que se guarda en MercadoLibre; el comprador **no la ve**. Sirve para dejar dicho, por ejemplo, «cambia a talla L».' },
  ],
  '/alertas-stock': [
    { pregunta: '¿Cómo actualizo el stock en ML?', video: 'Calificaciones y Stock',
      respuesta: 'Escribe el stock nuevo en cada fila (✎) y toca **Actualizar en MercadoLibre**. Solo cambia la cantidad disponible, nada más.' },
    { pregunta: '¿Cada cuánto se revisa?', respuesta: 'Sola cada hora. Con **Revisar ahora** buscas en el momento (cada 10 minutos como máximo).' },
  ],
  '/pagos-me': [
    { pregunta: '¿Cómo conecto MercadoEnvíos?', video: 'Conéctate con Mercadoenvios',
      respuesta: '1. Descarga el programa en la PC de las guías e instálalo.\n2. Toca **Genera tu código** y pégalo en el programa.\n3. Agrega el **Asistente de envíos** a Chrome (en el perfil con la sesión de MercadoEnvíos).\n4. Ábrelo y pega el mismo código: debe decir «Conectado al sistema».' },
    { pregunta: 'Dice «PC sin señal»', respuesta: 'La PC está apagada o el programa no corre. Préndela: no se pierde nada, al tocar **Traer pagos y guías** trae lo que faltaba.' },
    { pregunta: '¿Cómo comparo con el banco?', respuesta: 'En **Comprobar con el banco** sube los estados de cuenta descargados de tu banco: el sistema cruza referencia, monto y fecha, y los que coinciden quedan como «Pago correcto».' },
  ],
  '/despachos': [
    { pregunta: '¿Cómo imprimo las etiquetas?', video: 'Despachos',
      respuesta: 'Arrastra los PDFs de MercadoEnvíos (o pégalos con Ctrl+V), revisa el lote y genera el PDF. Imprime a **Tamaño real (100%)**, no «Ajustar a la página».' },
    { pregunta: '¿Cómo saco el manifiesto?', respuesta: 'Al final del día toca **Cerrar jornada → Manifiesto**: sale uno por transportista (ZOOM / TEALCA) con todos los envíos de la jornada.' },
    { pregunta: 'Un paquete no debe salir hoy', respuesta: 'Apártalo: **En espera** (no sale ni se reporta hasta que toques «Sale en el próximo manifiesto») o **Cancelar envío** (nunca sale; no se deshace).' },
  ],
  '/reportador': [
    { pregunta: '¿Cómo incluyo una guía en el reporte?', video: 'Reportador',
      respuesta: 'La guía tiene que pasar por **Despachos**: súbela, imprímela en un lote y **cierra la jornada**. Si es TEALCA, además escribe la guía final en «Guías Tealca». Las apartadas no se reportan.' },
    { pregunta: '¿Por qué no se habilita «Reportar»?', respuesta: 'Antes del primer reporte revisa el **Mensaje al comprador** y toca «Usar este mensaje». Después se habilita.' },
  ],
  '/calificaciones': [
    { pregunta: '¿Cómo sabe cuáles se concretaron?', video: 'Calificaciones y Stock',
      respuesta: 'Las cruza con **Despachos** y el **Reportador**: si su guía salió y se reportó, se concretó. Sin Despachos decides tú cada una (las canceladas en ML salen como no concretadas).' },
    { pregunta: '¿Se puede deshacer una calificación?', respuesta: 'Son públicas y salen a tu nombre. Desde aquí no se deshacen, pero puedes **Corregir mi calificación** en la venta.' },
  ],
  '/reputacion': [
    { pregunta: '¿Cómo pido que cambien una negativa?', respuesta: 'Toca **Pedir cambio**: se abre en MercadoLibre (entra con esa cuenta). ML deja pedirlo una sola vez por venta y hasta 30 días después de recibirla.' },
  ],
  '/mis-avisos': [
    { pregunta: '¿Cómo conecto Telegram?', respuesta: 'Toca **Conecta tu Telegram**, se abre el bot y tocas **Iniciar**. Después elige qué avisos quieres recibir.' },
  ],
  '/usuarios': [
    { pregunta: '¿Cómo agrego a alguien de mi equipo?', respuesta: 'Toca **+ Nuevo usuario**, pon nombre, usuario y contraseña inicial, y pásale su contraseña. Con **Permisos** eliges qué ve y qué puede hacer.' },
    { pregunta: 'Un empleado olvidó su contraseña', respuesta: 'En su fila toca **Cambiar contraseña** y pásale la nueva. Sus sesiones abiertas se cierran.' },
  ],
  '/aprendizaje': [
    { pregunta: '¿En qué orden veo los videos?', respuesta: 'En el orden de la lista: primero la serie de Automatizaciones (del 1 al 7) y, si usas Pagos ME, la de MercadoEnvíos.' },
  ],
}

const GENERALES: Sugerencia[] = [
  { pregunta: '¿Qué hace cada sección?', respuesta: 'En **Automatizaciones** atiendes lo de MercadoLibre (preguntas, mensajes, stock, despachos, guías y calificaciones). En **Inventario** (si lo tienes) llevas productos, ventas y compras. Pregúntame por cualquiera.' },
  { pregunta: 'Olvidé mi contraseña', respuesta: 'El administrador de tu empresa te pone una nueva en **Usuarios → Cambiar contraseña**. Si el olvido es del administrador, escríbenos a Soporte.' },
]

/** Las sugerencias de la pantalla actual (la ruta más específica que coincida) + las generales. */
export function sugerenciasDe(ruta: string): Sugerencia[] {
  const clave = Object.keys(S).filter(k => ruta === k || ruta.startsWith(k + '/')).sort((a, b) => b.length - a.length)[0]
  return [...(clave ? S[clave] : []), ...GENERALES].slice(0, 4)
}

/** Nombre corto de la pantalla, para el contexto de la IA y del soporte. */
export function nombrePantalla(ruta: string) {
  return ruta.split('?')[0] || '/'
}
