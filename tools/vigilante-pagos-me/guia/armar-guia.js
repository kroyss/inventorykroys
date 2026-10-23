// Arma la guía para Fundadores en Word (19-10-2026): node armar-guia.js → Guia-Pagos-MercadoEnvios.docx
// Las fotos salen de imagenes/ (las capturas de capturas/, la 01 recortada sin datos de pagos). Para cambiar
// una foto: reemplazarla directo en Word (clic derecho → Cambiar imagen) o aquí y volver a correr.
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, LevelFormat,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, Footer, PageNumber,
} = require('docx')
const sizeOf = f => { const b = fs.readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } }   // PNG

const VERDE = '0E7A4F', GRIS = '555555'
const t = (text, o = {}) => new TextRun({ text, ...o })
const p = (...runs) => new Paragraph({ spacing: { after: 120 }, children: runs.map(r => typeof r === 'string' ? t(r) : r) })
const h1 = text => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 }, children: [t(text)] })
const h2 = text => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 100 }, children: [t(text)] })
const vineta = (...runs) => new Paragraph({ numbering: { reference: 'vinetas', level: 0 }, spacing: { after: 60 },
  children: runs.map(r => typeof r === 'string' ? t(r) : r) })
const nota = text => new Paragraph({ spacing: { after: 160 }, children: [t(text, { italics: true, color: GRIS, size: 20 })] })

function foto(nombre, maxAncho = 560) {
  const f = path.join(__dirname, 'imagenes', nombre)
  const { w, h } = sizeOf(f)
  const ancho = Math.min(maxAncho, w)
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 200 },
    children: [new ImageRun({ type: 'png', data: fs.readFileSync(f), transformation: { width: ancho, height: Math.round(h * ancho / w) },
      altText: { title: nombre, description: nombre, name: nombre } })] })
}
// Recuadro para una foto que todavía falta (se reemplaza en Word).
const fotoPendiente = texto => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 200 },
  border: { top: { style: BorderStyle.DASHED, size: 6, color: 'AAAAAA' }, bottom: { style: BorderStyle.DASHED, size: 6, color: 'AAAAAA' },
            left: { style: BorderStyle.DASHED, size: 6, color: 'AAAAAA' }, right: { style: BorderStyle.DASHED, size: 6, color: 'AAAAAA' } },
  children: [t(`[ Foto: ${texto} ]`, { color: '888888', italics: true })] })

// Paso numerado: número grande verde + título.
const paso = (n, titulo) => new Paragraph({ spacing: { before: 300, after: 100 }, keepNext: true,
  children: [t(`Paso ${n}  `, { bold: true, color: VERDE, size: 30 }), t(titulo, { bold: true, size: 26 })] })

// Recuadro de aviso (fondo verde claro).
function recuadro(titulo, lineas) {
  const ancho = 9026
  return new Table({ width: { size: ancho, type: WidthType.DXA }, columnWidths: [ancho], rows: [new TableRow({ children: [
    new TableCell({ width: { size: ancho, type: WidthType.DXA }, shading: { fill: 'E8F5EE', type: ShadingType.CLEAR, color: 'auto' },
      margins: { top: 140, bottom: 140, left: 200, right: 200 },
      borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'A7D7BE' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A7D7BE' },
                 left: { style: BorderStyle.SINGLE, size: 6, color: 'A7D7BE' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'A7D7BE' } },
      children: [new Paragraph({ spacing: { after: 80 }, children: [t(titulo, { bold: true, color: VERDE })] }),
        ...lineas.map(l => new Paragraph({ spacing: { after: 60 }, children: (Array.isArray(l) ? l : [l]).map(r => typeof r === 'string' ? t(r) : r) }))] }),
  ] })] })
}

const b = text => t(text, { bold: true })

const contenido = [
  new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 60 }, children: [t('El Comerciante Digital', { color: VERDE, bold: true, size: 22 })] }),
  new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [t('Pagos de MercadoEnvíos, automáticos')] }),
  p(t('Guía para Fundadores · conexión paso a paso (10 minutos, una sola vez)', { color: GRIS })),

  h1('Qué es y qué ganas'),
  p('Un programa en tu PC lee el portal de MercadoEnvíos con ', b('tu propia sesión'), ' y trae solo al sistema, a la hora que elijas:'),
  vineta(b('Los pagos'), ' de cada venta (pago móvil o transferencia) con su ', b('comprobante'), ', para verificarlos de corrido contra el banco.'),
  vineta(b('Las guías'), ' de ZOOM y TEALCA, que pasan solas a Despachos para imprimir.'),
  vineta(b('Todas tus cuentas'), ' de MercadoLibre a la vez.'),
  p('Se acabó entrar al portal venta por venta para copiar pagos y bajar guías: es lo que más tiempo se lleva cada día.'),
  recuadro('Tu seguridad', [
    'Tu contraseña de MercadoLibre nunca sale de tu PC: el programa usa la sesión que ya tienes abierta en Chrome.',
    'Solo lee el portal de MercadoEnvíos; no cambia nada en tus ventas ni en tus publicaciones.',
  ]),

  h1('Antes de empezar'),
  vineta(b('Una PC con Windows'), ': la misma donde imprimes las guías. Debe quedar prendida en los horarios en que quieres traer (si se apaga, al prenderla trae lo que faltaba).'),
  vineta(b('Google Chrome'), ' con ', b('un perfil por cada cuenta de MercadoLibre'), ', y en cada perfil ', b('la sesión de MercadoEnvíos iniciada'), ' (entra una vez al portal de MercadoEnvíos con tu cuenta y déjala abierta).'),
  vineta('Ser ', b('administrador'), ' de tu empresa en El Comerciante Digital.'),
  vineta('Que te activemos ', b('Pagos ME'), ' (y Despachos). Pídelo por Telegram y te avisamos cuando esté.'),

  h1('Conexión paso a paso'),

  paso(1, 'Entra a Pagos ME'),
  p('Desde esa PC, en Chrome: ', b('app.elcomerciantedigital.com'), ' → menú ', b('Automatiza → Pagos ME'), '. La primera vez verás un recuadro verde con los pasos.'),
  foto('01-pantalla-pagos-me.png'),

  paso(2, 'Descarga e instala el programa'),
  p('Toca ', b('Descarga el programa'), ' y ábrelo. Windows va a mostrar este aviso: toca ', b('Más información'), '.'),
  foto('02a-windows-protegio.png', 260),
  p('Toca ', b('Ejecutar de todas formas'), '.'),
  foto('02b-ejecutar-de-todas-formas.png', 260),
  nota('¿Por qué sale? Porque el programa es nuevo y no tiene una firma comprada a Microsoft. Es el de El Comerciante Digital y es seguro; el aviso sale una sola vez.'),

  paso(3, 'Genera tu código y escríbelo en el programa'),
  p('El programa pide un ', b('código de conexión'), '.'),
  foto('03-programa-pide-codigo.png', 360),
  p('En Pagos ME toca ', b('Genera tu código'), ' (o ', b('Conectar una PC'), '). Aparece un código como este: tócalo en ', b('Copiar'), ' y pégalo en el programa.'),
  foto('03b-codigo-en-pagos-me.png'),
  nota('El código vale 60 minutos y sirve para todo: el programa y la extensión de cada cuenta. Si se te vence, genera otro; lo ya conectado sigue funcionando.'),

  paso(4, 'Termina la instalación'),
  p('Toca ', b('Siguiente'), '.'),
  foto('04-programa-instalado.png', 360),
  p('Deja marcadas las dos casillas, ', b('Arrancar el programa ahora'), ' y ', b('Ver cómo agregar el Asistente de envíos a Chrome'), ', y toca ', b('Finalizar'), '. En Pagos ME el paso del programa queda marcado con ✓.'),
  foto('05-finalizar-instalacion.png', 360),

  paso(5, 'Agrega el Asistente de envíos a Chrome, en el perfil de tu cuenta'),
  p('Al finalizar la instalación se abre solo Chrome en la tienda. ', b('Antes de seguir, asegúrate de que esa ventana sea la del perfil donde tienes iniciada la sesión de MercadoEnvíos'),
    ' (mira la foto de arriba a la derecha). Si se abrió en otro perfil, no se abrió o quieres agregarla a mano: cámbiate a ese perfil y entra a ', b('app.elcomerciantedigital.com/extension'), '.'),
  p('Toca ', b('Añadir a Chrome'), '.'),
  foto('06-tienda-chrome.png'),
  p('Confirma con ', b('Añadir extensión'), '.'),
  foto('07-anadir-extension.png', 340),
  p('Listo. No hace falta «Iniciar sesión en Chrome»: cierra este aviso con la ✕.'),
  foto('08-extension-anadida.png', 260),

  paso(6, 'Conecta la extensión con el mismo código (no te lo saltes)'),
  p('Agregarla no alcanza: hasta que no escribes el código en ella, el sistema no la ve y no trae nada.'),
  p('Toca la ', b('pieza de rompecabezas'), ' (arriba a la derecha de Chrome) → el ', b('pin'), ' junto a «Asistente de envíos» para dejarlo a la vista → ábrelo. Escribe el ', b('mismo código'), ' y toca ', b('Conectar'), '.'),
  foto('09-extension-pide-codigo.png', 320),
  p('Debe decir ', b('Conectado al sistema'), ' y mostrar tu cuenta de MercadoEnvíos. En Pagos ME desaparecen los pasos de la conexión: ya está.'),
  foto('10-extension-conectada.png', 320),

  paso(7, 'Repite en cada cuenta de MercadoLibre'),
  p('¿Tienes otra cuenta en otro perfil de Chrome? Abre ese perfil, entra a ', b('app.elcomerciantedigital.com/extension'), ' y repite los pasos 5 y 6 con el mismo código (o uno nuevo si ya pasó la hora). El programa no se vuelve a instalar.'),

  paso(8, 'Prueba: trae tus pagos y guías'),
  p('En Pagos ME toca ', b('Traer pagos y guías'), '. Chrome se abre solo con cada cuenta, trabaja y se cierra: no lo toques. En 1 o 2 minutos aparece el aviso verde ', b('✅ Listo'), ' con lo que trajo de cada cuenta.'),
  p('Junto al reloj de Windows queda el ícono ', b('ME'), ': verde = todo bien.'),

  h1('Cómo se usa cada día'),
  paso('A', 'Los pagos llegan solos'),
  p('El programa trae ', b('de lunes a sábado a las 8:00, 12:00, 4:00 y 7:00 p. m.'), ' Para cambiar las horas: en Pagos ME, ', b('Traer automático → Configurar'), '. ¿Necesitas algo ya? Toca ', b('Traer pagos y guías'), ' y espera el aviso verde.'),
  paso('B', 'Verifica cada pago'),
  p('En Pagos ME, pestaña ', b('Ventas'), ', tus ventas salen en tres grupos:'),
  vineta(b('Por verificar:'), ' el cliente pagó. Mira el pago y el comprobante y toca ', b('✓ Pago correcto'), ' o ', b('✗ Inválido'), '.'),
  vineta(b('Listos para despachar:'), ' pago verificado. Su guía ya está en Despachos.'),
  vineta(b('Sin pago todavía:'), ' el cliente no ha pagado (o el pago todavía no se trajo).'),
  p(b('Atajo: 🏦 Comprobar con el banco.'), ' Sube los estados de cuenta del día (Bancamiga, Banesco, Mercantil o Provincial) y el sistema te dice qué pagos llegaron de verdad. Los seguros se aprueban todos con un clic. Banco de Venezuela no se puede, porque no deja exportar el estado de cuenta.'),
  paso('C', 'Imprime en Despachos'),
  p('Las guías ya están en el lote de Despachos: ', b('no hace falta bajarlas del portal'), '. Imprime como siempre.'),
  recuadro('Importante', [
    [b('Despachos no imprime una guía si su pago no está verificado.'), ' Es a propósito: así no sale un paquete sin cobrar. Si tienes que despachar uno igual (un cliente de confianza, por ejemplo), en la guía toca ', b('Despachar igual'), '.'],
    [b('Ya no bajes las guías del portal a mano.'), ' Si una guía ya está en Despachos, el programa no trae el pago de esa venta.'],
  ]),

  h1('Preguntas frecuentes'),
  h2('Pagos ME dice que una cuenta de MercadoEnvíos «no corresponde»'),
  p('Ese Chrome tiene abierta una cuenta de MercadoEnvíos que no es ninguna de tus cuentas de MercadoLibre conectadas al sistema. Por seguridad no se trae nada de ella: en ese perfil de Chrome entra al portal con la cuenta correcta.'),
  h2('Pagos ME dice «La PC está prendida, pero ningún perfil de Chrome tiene el Asistente conectado»'),
  p('El programa está bien; falta el paso 6. Abre Chrome en el perfil de tu cuenta de MercadoLibre, toca la pieza de rompecabezas, abre «Asistente de envíos» y escribe el código. Si no aparece ahí, la agregaste en otro perfil: repite el paso 5 en el perfil correcto.'),
  h2('Una venta pagada sale en «Sin pago todavía»'),
  p('El pago todavía no se trajo: toca «Traer pagos y guías». Si sigue igual, revisa en el portal de MercadoEnvíos que el pago tenga comprobante cargado.'),
  h2('Venta con retiro en tienda'),
  p('No tiene guía de envío, así que no va a Despachos. El pago se verifica igual.'),
  h2('¿Puedo usar solo la extensión, sin el programa?'),
  p('Sí, pero entonces Chrome tiene que estar abierto en cada cuenta cuando toques «Traer» o llegue el horario. El programa es el que abre Chrome solo, aunque nadie esté mirando. Recomendado: programa + extensión.'),
  h2('¿Y si la PC estaba apagada?'),
  p('No se pierde nada: al prenderla, trae lo que faltaba.'),
  h2('La primera vez una cuenta tardó en traer'),
  p('Es normal justo después de conectar una cuenta nueva: puede tardar unos minutos en reconocerla. Después trae al momento.'),
  h2('¿Qué significan los colores del ícono ME?'),
  vineta(b('Verde:'), ' esperando, todo bien.  ', b('Azul:'), ' trayendo.  ', b('Rojo:'), ' sin conexión con el sistema (revisa el internet).'),
  h2('¿Necesitas ayuda?'),
  p('Escríbenos por Telegram. Si quieres, te acompañamos la primera vez conectándonos a tu PC.'),
]

// ── Guía del dueño (21-10): qué revisar, qué decir y qué hacer al activarle Pagos ME a un Fundador ──
const tabla = (filas, anchos = [3200, 5826]) => new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: anchos,
  rows: filas.map((f, i) => new TableRow({ children: f.map((c, j) => new TableCell({ width: { size: anchos[j], type: WidthType.DXA },
    shading: i === 0 ? { fill: 'E8F5EE', type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
               left: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' }, right: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } },
    children: [new Paragraph({ children: [t(c, { bold: i === 0, size: 20 })] })] })) })) })
const check = (...runs) => new Paragraph({ spacing: { after: 70 }, indent: { left: 360, hanging: 360 },
  children: [t('☐  '), ...runs.map(r => typeof r === 'string' ? t(r) : r)] })
const dice = text => new Paragraph({ spacing: { after: 100 }, indent: { left: 360 },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color: VERDE, space: 10 } },
  children: [t(`«${text}»`, { italics: true })] })

const dueno = [
  new Paragraph({ spacing: { after: 60 }, children: [t('El Comerciante Digital · uso interno', { color: VERDE, bold: true, size: 22 })] }),
  new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [t('Activar Pagos ME a un Fundador')] }),
  p(t('Tu guía paso a paso: qué revisar antes, qué decirle, cómo instalarlo con él y qué mostrarle. Unos 20 minutos por Fundador.', { color: GRIS })),

  h1('1. Antes de la llamada (tú solo, 3 min)'),
  check('Es de ', b('Venezuela'), ' (Pagos ME es solo VE).'),
  check('Tiene ', b('sus cuentas de MercadoLibre conectadas'), ' en el sistema y ya entran sus ventas. Sin eso, la lista de Ventas sale vacía y el sistema no puede comprobar de qué cuenta es cada Chrome.'),
  check('Tiene ', b('Despachos'), ' prendido (ahí caen las guías).'),
  check('Su usuario es ', b('administrador'), ' de su empresa (solo el admin genera el código de conexión).'),
  check(b('Plataforma'), ' → abre su empresa → Módulos → prende ', b('Pagos ME'), '. Le aparece en el menú ', b('Automatiza → Pagos ME'), '.'),
  check('El horario automático ya viene puesto: ', b('lunes a sábado, 8:00, 12:00, 4:00 y 7:00 p. m.'), ' Si quiere otro, se cambia con él en la llamada.'),
  check('Ten a mano la guía para Fundadores en PDF, para mandársela al terminar.'),

  h1('2. Qué decirle (el porqué, 1 min)'),
  dice('Esto te ahorra entrar al portal de MercadoEnvíos venta por venta. Un programa en tu PC trae solo los pagos, los comprobantes y las guías de todas tus cuentas.'),
  dice('Tú solo revisas que cada pago llegó al banco, con un clic, y las guías ya te esperan en Despachos para imprimir.'),
  dice('Tu contraseña no sale de tu PC: usa la sesión de MercadoLibre que ya tienes abierta en Chrome, y solo lee el portal, no cambia nada.'),

  h1('3. Qué necesita él (pídelo antes de conectarte)'),
  vineta('La ', b('PC con Windows donde imprime las guías'), ', prendida en los horarios en que quiere traer.'),
  vineta(b('Google Chrome con un perfil por cada cuenta de MercadoLibre'), ' y la sesión de ML abierta en cada perfil. Si usa una sola cuenta, basta con un perfil.'),
  vineta('Su usuario y clave de El Comerciante Digital (admin).'),
  vineta('RustDesk abierto, si lo vas a acompañar desde tu PC.'),

  h1('4. Instalación con él (10 min)'),
  p('Sigue la guía para Fundadores; aquí va solo lo que tienes que mirar en cada paso.'),
  tabla([
    ['Paso', 'Qué revisar / qué decirle'],
    ['1. Pagos ME', 'Entrar desde ESA PC. Debe ver el recuadro verde con los pasos.'],
    ['2. Programa', 'Sale «Windows protegió su PC»: decirle que es normal (programa nuevo sin firma comprada). Más información → Ejecutar de todas formas.'],
    ['3. Código', 'Lo genera ÉL en Pagos ME («Genera tu código»). Vale 60 min y sirve para el programa y para todas las extensiones.'],
    ['4. Finalizar', 'Dejar marcadas «Arrancar el programa» y «Ver cómo agregar el Asistente». Si aparece una casilla «Abrir la carpeta de la extensión», desmarcarla.'],
    ['5. Extensión', 'Mirar en QUÉ perfil de Chrome se abrió la tienda: tiene que ser el de una cuenta de ML. Si Chrome dice «Leer tu historial», es la versión anterior de la extensión (la 1.3.6 ya no lo pide): no lee su historial. No hace falta «Iniciar sesión en Chrome».'],
    ['6. Conectar', 'Rompecabezas → pin → abrir el Asistente → mismo código → Conectar. Debe decir «Conectado al sistema» con su cuenta de MercadoEnvíos.'],
    ['7. Otras cuentas', 'En cada perfil: app.elcomerciantedigital.com/extension → Añadir → mismo código. El programa no se reinstala.'],
    ['8. Prueba', '«Traer pagos y guías». No tocar Chrome mientras trabaja. En 1–2 min: aviso verde ✅ Listo con lo de cada cuenta. Ícono ME verde junto al reloj.'],
  ]),

  h1('5. Qué mostrarle después de la prueba (5 min)'),
  paso('A', 'Pagos ME → pestaña Ventas'),
  vineta(b('Por verificar'), ': abre una, muéstrale el pago, el comprobante y la guía. Toca ', b('✓ Pago correcto'), '.'),
  vineta('Esa venta pasa a ', b('Listos para despachar'), '.'),
  vineta(b('🏦 Comprobar con el banco'), ': si usa Bancamiga, Banesco, Mercantil o Provincial, súbele un estado de cuenta y que vea cómo aprueba solos los seguros. Con Banco de Venezuela no funciona.'),
  paso('B', 'Despachos'),
  vineta('Muéstrale que la guía ', b('ya está en el lote'), ' sin haberla bajado.'),
  vineta('Muéstrale una con ', b('«Pago sin verificar»'), ': no se imprime hasta verificar. Si hace falta despachar una igual, existe ', b('Despachar igual'), '.'),

  h1('6. Las 3 cosas que tiene que recordar'),
  recuadro('Díselas al cerrar', [
    [b('1. Verificar antes de imprimir.'), ' Si no verifica, Despachos no le imprime esas guías.'],
    [b('2. Ya no bajar guías del portal a mano.'), ' Si sube una guía a mano, el programa no trae el pago de esa venta.'],
    [b('3. La PC prendida en los horarios.'), ' Si estaba apagada no pasa nada: al prenderla trae lo que faltaba.'],
  ]),

  h1('7. Si algo falla'),
  tabla([
    ['Lo que ve', 'Qué hacer'],
    ['El código no sirve', 'Venció (60 min) o se escribió mal. Generar otro: lo ya conectado sigue funcionando.'],
    ['Aviso rojo «la cuenta no corresponde»', 'Ese Chrome tiene abierta otra cuenta de MercadoEnvíos. Entrar al portal con la cuenta correcta en ese perfil.'],
    ['Una cuenta no trajo nada', 'Ver que su perfil tenga la extensión «Conectado» y la sesión de ML abierta (la extensión entra sola al portal si ML está abierto). Volver a Traer.'],
    ['Ícono ME rojo / «PC sin señal»', 'Sin internet o PC apagada. Si sigue, cerrar sesión de Windows y volver a entrar (el programa arranca solo).'],
    ['Venta pagada en «Sin pago todavía»', 'Traer de nuevo. Si sigue: en el portal ese pago no tiene comprobante, o su guía ya estaba en Despachos (subida a mano).'],
    ['Guía «Pago sin verificar»', 'Verificar en Pagos ME → Ventas, o «Despachar igual».'],
    ['Venta con retiro en tienda', 'Normal: no lleva guía y no va a Despachos.'],
  ]),

  h1('8. Después (al día siguiente)'),
  vineta('En ', b('Plataforma → Adopción'), ' mira si tiene pagos verificados. Si sale en 0, escríbele para ver si se trabó.'),
  vineta('Pregúntale si las guías salieron completas en Despachos el primer día.'),
]

const estilos = {
  default: { document: { run: { font: 'Arial', size: 22 } } },
  paragraphStyles: [
    { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { size: 44, bold: true, font: 'Arial', color: '111111' } },
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 30, bold: true, font: 'Arial', color: VERDE }, paragraph: { outlineLevel: 0 } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 24, bold: true, font: 'Arial', color: '222222' }, paragraph: { outlineLevel: 1 } },
  ],
}
const vinetas = { config: [{ reference: 'vinetas', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] }
const seccion = (pie, children) => ({
  properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1200, bottom: 1200, left: 1440, right: 1440 } } },
  footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
    children: [t(`${pie} · `, { size: 16, color: '999999' }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '999999' })] })] }) },
  children,
})
const docDueno = new Document({ creator: 'El Comerciante Digital', title: 'Activar Pagos ME a un Fundador', styles: estilos, numbering: vinetas,
  sections: [seccion('Uso interno · Activar Pagos ME', dueno)] })
Packer.toBuffer(docDueno).then(buf => {
  const out = path.join(__dirname, 'Guia-Dueno-Activar-Pagos-ME.docx')
  fs.writeFileSync(out, buf)
  console.log('ok', out)
})

const doc = new Document({
  creator: 'El Comerciante Digital', title: 'Pagos de MercadoEnvíos, automáticos — Guía para Fundadores',
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { size: 44, bold: true, font: 'Arial', color: '111111' } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: 'Arial', color: VERDE }, paragraph: { outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: '222222' }, paragraph: { outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: 'vinetas', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1200, bottom: 1200, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [t('El Comerciante Digital · Pagos MercadoEnvíos · ', { size: 16, color: '999999' }),
                 new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '999999' })] })] }) },
    children: contenido,
  }],
})

Packer.toBuffer(doc).then(buf => {
  const out = path.join(__dirname, 'Guia-Pagos-MercadoEnvios.docx')
  fs.writeFileSync(out, buf)
  console.log('ok', out)
})
