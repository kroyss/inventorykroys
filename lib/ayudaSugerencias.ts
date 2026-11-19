// Sugerencias de la burbuja de ayuda por pantalla (30-10-2026): preguntas frecuentes con la respuesta YA escrita,
// sin IA (gratis). Salen del manual (docs/ayuda/sistema.md): si cambia el manual, revisar estas también.
// `video` = título del video de la Central de aprendizaje que conviene ver (se busca por título).
export interface Sugerencia { pregunta: string; respuesta: string; video?: string }

const S: Record<string, Sugerencia[]> = {
  '/automatizaciones': [
    { pregunta: '¿Por dónde empiezo?', video: 'Así trabajas desde hoy',
      respuesta: '1. Lee el **Manual de Automatizaciones** en **Aprendizaje** (cada capítulo trae su video corto).\n2. Conecta tu cuenta en **Cuentas de MercadoLibre**.\n3. Empieza por **Preguntas** y **Mensajes**: ahí entra lo de todas tus cuentas.' },
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
      respuesta: 'Cada **Proponer con IA** usa 1 crédito. **Buscar en internet** usa 1 más 1 por búsqueda (hasta 4). Las respuestas rápidas, las parecidas y lo aprendido son gratis. Los de la prueba son para toda la prueba; los del plan se renuevan cada mes en el día en que se activó, y los que no uses no se acumulan. Las recargas compradas no vencen.' },
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
  '/inventario/stock-ml': [
    { pregunta: '¿Cómo corrijo con qué publicaciones está vinculado un producto?', respuesta: 'Toca **🔗 N vínculos** debajo del nombre del producto: se abre Vincular con ML de ese producto en un panel. Vincula, desvincula o cambia «trae N u.» y toca **Listo**: el producto se recalcula sin perder dónde estabas. **Se acabó** ahora está en el botón **⋯**.' },
    { pregunta: '¿Qué es «Desde N u. pierde envío gratis» y Crear pack?', respuesta: 'Al comprar varias, MercadoLibre suma el peso del paquete y pide el mínimo de ese peso. El sistema revisa **cada cantidad** hasta 20 (con la promo si tiene): si alguna queda sin envío gratis lo avisa en la publicación. **Crear pack** copia la publicación como «Pack xN» con un precio que llega al envío gratis, la deja **pausada** y vinculada «trae N u.»; registras su peso en el portal de MercadoEnvíos y la activas. Si dice «✓ Envío gratis aunque lleve hasta N u.», puedes subir el stock sin miedo.' },
    { pregunta: '¿Dónde quedó Vincular y MercadoEnvíos?', respuesta: 'En **Mis publicaciones** (la primera pestaña de Publicaciones), botones de arriba: **Vincular** y **Pesos y envío gratis**; el numerito gris dice cuánto falta. Cada publicación sin vincular o sin peso también lo dice en su fila. Lo que se manda a ML en segundo plano está en **Historial de tareas** (a la derecha).' },
    { pregunta: '¿Por qué dice «va por la cola de MercadoLibre»?', respuesta: 'Cuando arreglas o pausas **más de 10 publicaciones** juntas, van por la cola (60 por minuto) para que ML no las rechace. Arriba ves el avance y sigue aunque cierres la pantalla; cada una toma el stock del momento en que le toca.' },
    { pregunta: '¿Cómo está ordenada Stock en ML?', respuesta: 'Arriba hay 3 tarjetas: **Vende de más** (rojo, riesgo de reclamo), **Tienes y no vendes** (celeste, ventas perdidas) y **Por ajustar** (ámbar). Cada producto está en un solo grupo. **Arreglar N productos** te muestra la lista de cambios antes de aplicar. Lo que el sistema no resuelve solo está en **Para decidir**; la configuración, en **⚙ Ajustes**.' },
    { pregunta: '¿Qué es «Tienes y no vendes»?', respuesta: 'Es el revés de «Vende de más»: productos con unidades en el inventario que ninguna publicación activa ofrece (pausadas o en 0). Toca **Aplicar en ML** para ponerles stock y reactivarlas; si alguna la pausaste a mano a propósito, déjala así.' },
    { pregunta: '¿Qué significa «Compartida con COD-…»?',
      respuesta: 'Esa publicación está vinculada a varios productos (por ejemplo, un mismo anuncio con varios modelos). ML muestra la **suma** de lo que aporta cada uno; «aporta N» es la parte de este producto. Toca el **código MLV** para ver la publicación aquí mismo y confirmar que todos son de verdad de ese anuncio.' },
    { pregunta: '¿Cómo pauso o activo varias a la vez?',
      respuesta: 'Marca los productos y toca abajo **Pausar N publicaciones** (pausa sus activas). Para activar, en el selector de estado elige **Pausadas en ML**, marca y toca **Activar N publicaciones**: solo funciona con las que tienen stock en ML; las demás iguálalas primero.' },
    { pregunta: '¿Qué es «desactivados que siguen publicados»?',
      respuesta: 'Productos desactivados con publicaciones activas en ML: el sistema ya no les controla el stock. Toca **Revisar**: si el título de la publicación no es de ese producto, está mal vinculada → **Desvincular** y vincúlala al correcto; si coincide → **Pausar**; si fue un error → **Reactivar producto**.' },
    { pregunta: '¿Cómo pauso una publicación sin tocar el inventario?',
      respuesta: 'En la publicación toca **Pausar** (puedes escribir el motivo). Queda «Pausada a mano», no entra al reparto y «Poner en ML lo que hay» no la reactiva; para volver a venderla toca **Activar**. Si el producto no está en bodega, mejor **Se acabó**: pone 0 en todas sus publicaciones y avisa al admin para que ajuste el inventario.' },
    { pregunta: '¿Dónde veo quién cambió el stock en ML?',
      respuesta: 'Arriba en **Historial**, o **Ver cambios** en cada producto: quién, cuándo, qué publicación, antes → después, pausas y reactivaciones. El admin ve los de todos y filtra por persona.' },
    { pregunta: '¿Qué hago con «Hay 2 y MercadoLibre ofrece 3»?',
      respuesta: 'Toca **Aplicar en ML** en ese producto: deja lo que muestra la sugerencia (baja primero las pausadas y la cuenta que más muestra). Si prefieres otro reparto, toca **Cambiar a mano**, pon cuántas muestra cada cuenta y **Guardar en ML**.' },
    { pregunta: '¿Qué es «Dividir por variantes»?',
      respuesta: 'La publicación está vinculada entera pero tiene variantes, y el sistema no sabe qué variante es cada producto: solo la baja (a 0 si todos sus productos están en 0). Toca **Dividir por variantes**, elige el producto de cada variante y **Guardar**: queda vinculada variante por variante y desde ahí el stock se controla exacto.' },
    { pregunta: '¿Cómo pongo otro número sin aceptar la sugerencia?',
      respuesta: 'Toca el número de **Quedará** (✎): el producto pasa a «A mano» y cada publicación muestra una casilla. Arriba ves «Usas X de Y». No deja pasarte de lo que tienes (si hay más, primero **Corregir stock**). Toca **Guardar en ML**; **Volver a la sugerencia** deshace.' },
    { pregunta: '¿Qué es «Mi inventario está al día»?',
      respuesta: 'Una casilla de la empresa (Stock en ML → **⚙ Ajustes**). Prendida: al poner stock en ML más de lo que tienes en inventario, te avisa y pide «Actualizar igual» (no bloquea). Apagada: el inventario se ve solo como dato. Préndela solo si tu inventario está al día.' },
    { pregunta: '¿Qué es «Vende de más»?',
      respuesta: 'Productos que MercadoLibre sigue ofreciendo sin que los tengas: en **0** con una publicación activa (rojo) o con menos de lo que suman tus publicaciones activas (amarillo). Toca **Arreglar N productos** en la tarjeta roja (te muestra la lista antes de aplicar) o **Aplicar en ML** en cada uno: los de 0 quedan en 0 en ML. Se revisa solo cada 10 min y avisa por Telegram (Mis avisos → «Vende sin tener stock»).' },
    { pregunta: '¿Por qué sale un número rojo en Publicaciones?',
      respuesta: 'Son los productos en 0 que una publicación activa sigue ofreciendo en ML. Entra a **Publicaciones → Stock**, tarjeta roja **Vende de más**, y toca **Arreglar**.' },
  ],
  '/alertas-stock': [
    { pregunta: '¿Por qué hay dos «Stock»?', respuesta: 'Aquí ves **lo que dice MercadoLibre** (agotadas, por agotarse, pausadas). Si tu empresa lleva Inventario, **Publicaciones → Stock vs inventario** lo compara con lo que tienes y lo arregla en un clic.' },
    { pregunta: '¿Cómo actualizo el stock en ML?', video: 'Calificaciones y Stock',
      respuesta: 'Escribe el stock nuevo en cada fila (✎) y toca **Actualizar en MercadoLibre**. Solo cambia la cantidad disponible, nada más. Si tu inventario está marcado como al día y pones más de lo que tienes, la casilla se pone ámbar y te pide «Actualizar igual».' },
    { pregunta: '¿Qué significa «en 0 a propósito»?',
      respuesta: 'Con el inventario al día, esta pantalla usa el mismo reparto que Stock en ML: esa publicación está en 0 porque lo que tienes ya está publicado en otra (te dice cuál). «inventario N · sugerido X» (al tocarlo) pone lo que sugiere Stock en ML (X), no todo el inventario.' },
    { pregunta: '¿Cada cuánto se revisa?', respuesta: 'Sola cada hora. Para revisar ya, toca **↻ Actualizar** arriba, junto a Novedades (cada 10 minutos como máximo).' },
  ],
  '/pagos-me': [
    { pregunta: '¿Dónde verifico los pagos si llevo inventario?',
      respuesta: 'En **Ventas → Por confirmar**: es la misma lista. Pagos ME queda como **Conexión Pagos ME** (menú de tu cuenta o **⚙ Conexión** en Por confirmar) para la PC, las cuentas y el **Historial de pagos**.' },
    { pregunta: '¿Cómo verifico un pago rápido?',
      respuesta: 'Toca el chip azul **Pago por verificar · Bs …** y elige **✓ Sí, verificado** (o **✗ Inválido**). Queda verificado como cuando cuadra con el banco y el botón pasa a **Registrar venta**. Si te equivocaste, toca **deshacer**.' },
    { pregunta: '¿Cómo conecto MercadoEnvíos?', video: 'Conéctate con Mercadoenvios',
      respuesta: '1. Descarga el programa en la PC de las guías e instálalo.\n2. Toca **Genera tu código** y pégalo en el programa.\n3. Agrega el **Asistente de envíos** a Chrome (en el perfil con la sesión de MercadoEnvíos).\n4. Ábrelo y pega el mismo código: debe decir «Conectado al sistema».' },
    { pregunta: 'Dice «PC sin señal»', respuesta: 'La PC está apagada o el programa no corre. Préndela: no se pierde nada, al tocar **Traer pagos y guías** trae lo que faltaba.' },
    { pregunta: 'Sale en naranja «el despertador no corre»', respuesta: 'Trae igual mientras Chrome esté abierto. Para que lo abra solo al tocar **Traer**, reinicia la PC o vuelve a abrir **instalar-despertador.cmd**.' },
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
    { pregunta: '¿Qué cuenta el numerito de Stock?', respuesta: 'Siempre lo que **vende sin tener stock**. En Mis avisos, en «Numerito de Publicaciones → Stock», puedes sumar también **Tienes y no vendes** y **Por ajustar**. Es solo tuyo.' },
    { pregunta: '¿Cómo conecto Telegram?', respuesta: 'Toca **Conecta tu Telegram**, se abre el bot y tocas **Iniciar**. Después elige qué avisos quieres recibir.' },
  ],
  '/usuarios': [
    { pregunta: '¿Cómo agrego a alguien de mi equipo?', respuesta: 'Toca **+ Nuevo usuario**, pon nombre, usuario y contraseña inicial, y pásale su contraseña. Con **Permisos** eliges qué ve y qué puede hacer.' },
    { pregunta: 'Un empleado olvidó su contraseña', respuesta: 'En su fila toca **Cambiar contraseña** y pásale la nueva. Sus sesiones abiertas se cierran.' },
  ],
  '/vincular-ml': [
    { pregunta: '¿Qué es «Vínculo viejo» en Vincular con ML?', respuesta: 'La publicación sigue vinculada entera a un producto aunque cada variante ya tiene el suyo (vínculo de antes). No se usa para nada, pero confundía Preguntas, pesos y Stock en ML. Toca **Quitar vínculo viejo**: las variantes y las ventas ya registradas no cambian.' },
  ],
  '/productos': [
    { pregunta: '¿Qué es recargo y qué es rentabilidad?',
      respuesta: 'El **recargo** es lo que le sumas al costo para sacar el precio. La **rentabilidad** es lo que de verdad te queda después de MercadoLibre (y del cambio en Venezuela). Los dos se miden sobre lo que te costó el producto.\n\nEj.: costo $2,40 y recargo 80 % → precio $4,32. Después de la comisión, el envío y el cambio te quedan $1,07: rentabilidad **44,7 %**, o sea ganas $44,70 por cada $100 que pusiste en mercancía. Los otros 35 puntos se los llevan ML y el cambio.' },
    { pregunta: '¿Por qué la rentabilidad sale más baja que el recargo?', respuesta: 'Porque el recargo es antes de MercadoLibre y la rentabilidad es después: la comisión, el envío y (en Venezuela) la pérdida por cambio se llevan una parte. En la ficha, **Lo que te queda** muestra cada descuento y cuántos puntos se fueron.' },
    { pregunta: '¿Desde cuánto es «Sana»?', respuesta: 'Por defecto, rentabilidad desde **25 %** es verde (Sana), de 0 a 25 % naranja (Ajustada) y menos de 0 rojo (Pérdida). Se cambia en **Productos → Costos ML**.' },
  ],
  '/dashboard': [
    { pregunta: '¿Qué es la línea gris del gráfico?', respuesta: 'Las **ventas del período anterior**, en los mismos días: con **Mes**, el mes pasado; con **Hoy**, ayer; con **Año**, el año pasado. Si las barras azules quedan por encima de la línea gris, vas vendiendo más que antes. Al pasar el dedo o el mouse ves el detalle de cada día.' },
    { pregunta: '¿Por qué no veo todas las tarjetas de pendientes?', respuesta: 'Solo salen las que tienen algo, ordenadas por urgencia. Las que están en 0 aparecen en la línea gris **Al día**. Si no hay nada, dice **Nada pendiente hoy**.' },
    { pregunta: '¿Qué es el diferencial?', respuesta: 'Cuánto más cara está la tasa **paralela** que la **oficial**, en %. Antes se llamaba «spread». Con él (y el exceso) se calcula el **Descuento ML** sugerido.' },
    { pregunta: '¿Por qué dice que la ganancia es aproximada?', respuesta: 'Porque parte de lo vendido es de productos con **costo estimado** (un % del precio, puesto al importar). Toca **Completar costos** y pon el real: las ventas se corrigen solas y el aviso se va.' },
    { pregunta: '¿Qué es la rentabilidad del Inicio?', respuesta: 'La ganancia del período ÷ lo que te costó la mercancía vendida. **30 %** = ganaste $30 por cada $100 en mercancía. Es la misma cuenta que ves en cada producto. No descuenta los gastos del mes.' },
  ],
  '/productos/importar-ml': [
    { pregunta: 'Son muchos productos, ¿tengo que poner cada costo?', respuesta: 'No. En la barra de abajo usa **Costo estimado**: pones un % del precio (por ejemplo 50 %) y toca **Poner en N**. Quedan marcados **est.** y los completas después en **Productos → Completar costos**: al poner el real, las ventas se corrigen solas.' },
  ],
  '/inventario/reponer': [
    { pregunta: '¿Qué tengo que comprar?', respuesta: '**Reponer** te dice cuánto pedir de cada producto según lo que vendes y tus reglas (cuánto tarda en llegarte, para cuántos meses comprar). Marca los productos y toca **Crear compra**: se abre la compra con cantidades y último costo.' },
    { pregunta: '¿Dónde quedó Reportes → Stock?', respuesta: 'Ahora es **Inventario → Reponer**: es lo mismo (Reponer, Se están cayendo, Parados, Recién llegados y ⚙ Reglas), junto a tu stock, porque termina en una compra.' },
  ],
  '/productos/costos': [
    { pregunta: '¿Por cuáles empiezo?', respuesta: 'Por arriba: están ordenados por lo que más vendiste en 30 días. Con unos pocos costos reales ya cubres casi toda tu ganancia; los que casi no se venden pueden esperar.' },
    { pregunta: '¿Qué pasa con las ventas que ya hice?', respuesta: 'Las que se hicieron con el costo estimado se **corrigen solas** al guardar el real. Las que ya tenían costo real no cambian.' },
    { pregunta: 'El estimado ya está bien', respuesta: 'Toca **Está bien así**: queda como costo real y deja de salir aquí.' },
  ],
  '/productos/mercadoenvios': [
    { pregunta: '¿Cómo cargo los pesos de una vez?', respuesta: 'El peso sale del portal de MercadoEnvíos con **Pagos ME**: al importar o vincular un producto se pide solo, y **↻ Actualizar** (arriba, línea Pagos, guías y pesos) lo trae de una vez (llega en 1 a 3 minutos con la PC prendida). Los que el portal no tenga, escríbelos a mano.' },
    { pregunta: '¿Dónde está el botón de Ayuda?', respuesta: 'Está en **Aprendizaje** (abajo a la derecha). Si lo quieres en todas las pantallas, activa **Ayuda en todo el sistema** en Aprendizaje.' },
    { pregunta: '¿Hay un manual de Automatizaciones?', respuesta: 'Sí: en **Aprendizaje → Manuales → Manual de Automatizaciones** (Preguntas, Mensajes, Calificaciones, Stock, Pagos ME, Despachos, Reportador…), con buscador. Cada capítulo trae su video de apoyo (opcional), que se ve ahí mismo sin salir del manual y se puede **Ampliar**; el manual es lo que está al día con las pantallas.' },
    { pregunta: '¿Dónde quedó «Actualizar desde ML», «Revisar ahora» o «Traer pesos»?', respuesta: 'Todo está en **↻ Actualizar**, arriba junto a Novedades: un panel con Ventas, Preguntas, Publicaciones y stock, Promociones y Pagos (guías y pesos), cuándo se actualizó cada uno, **Actualizar todo** (solo lo viejo) y un ↻ por línea. Traer pagos y guías sigue en Pagos ME.' },
    { pregunta: '¿Por qué Primeros pasos dice que faltan pesos?', respuesta: 'Cuenta solo los productos vinculados a una publicación **activa** de MercadoLibre sin peso (ahí el peso decide el envío gratis). Los que no vendes en ML o ya no traes no cuentan. En Productos → MercadoEnvíos, el filtro **Sin peso · en ML** te muestra justo esos. Si reactivas una publicación sin peso, vuelve a contar.' },
    { pregunta: '¿Puedo cambiar la tabla de MercadoEnvíos?', respuesta: 'No: es la misma para todos los vendedores de ML Venezuela y la mantiene al día El Comerciante Digital cuando ML la cambia. La ves en **Costos ML**.' },
  ],
  '/ventas': [
    { pregunta: 'Tengo muchas ventas viejas por confirmar que no voy a registrar',
      respuesta: 'En **Por confirmar** toca **Sin inventario**: marca las ventas (o **Marcar todas**) y toca **Quitar N de pendientes**. No restan en Stock en ML y se pueden **Devolver** desde la lista de abajo. Las ventas nuevas siguen llegando: carga el inventario de esos productos para registrarlas.' },
    { pregunta: '¿Qué hace «Traer pagos y ventas»?',
      respuesta: 'Trae al instante las ventas nuevas de MercadoLibre y pide los pagos y guías de MercadoEnvíos (tarda 1 a 3 min). Igual se traen solas cada hora.' },
  ],
  '/aprendizaje': [
    { pregunta: '¿En qué orden veo los videos?', respuesta: 'En el orden de la lista: primero la serie de Automatizaciones (del 1 al 7) y, si usas Pagos ME, la de MercadoEnvíos.' },
  ],
}

const GENERALES: Sugerencia[] = [
  { pregunta: '¿Qué hace cada sección?', respuesta: 'En **Automatizaciones** atiendes lo de MercadoLibre (preguntas, mensajes, stock, despachos, guías y calificaciones). En **Inventario** (si lo tienes) llevas productos, ventas y compras. Pregúntame por cualquiera.' },
  { pregunta: 'Olvidé mi usuario', respuesta: 'Entra con tu **correo** en lugar del usuario, con tu misma contraseña. Tu usuario también aparece en **Mi cuenta**.' },
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
