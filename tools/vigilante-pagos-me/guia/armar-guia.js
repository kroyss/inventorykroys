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
  vineta(b('Google Chrome'), ' con ', b('un perfil por cada cuenta de MercadoLibre'), ', y la sesión de MercadoLibre abierta en cada perfil.'),
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
  p('Deja marcadas ', b('Arrancar el programa ahora'), ' y ', b('Ver cómo agregar el Asistente de envíos a Chrome'), ', y toca ', b('Finalizar'), '.'),
  foto('05-finalizar-instalacion.png', 360),

  paso(5, 'Agrega el Asistente de envíos a Chrome'),
  p('Se abre la tienda de Chrome. Toca ', b('Añadir a Chrome'), '.'),
  foto('06-tienda-chrome.png'),
  p('Confirma con ', b('Añadir extensión'), '.'),
  foto('07-anadir-extension.png', 340),
  nota('Chrome dice «Leer tu historial de navegación» por un permiso técnico (la extensión necesita encontrar y cerrar la pestaña del portal que abre). No lee tu historial.'),
  p('Listo. No hace falta «Iniciar sesión en Chrome»: cierra este aviso con la ✕.'),
  foto('08-extension-anadida.png', 260),

  paso(6, 'Conecta la extensión con el mismo código'),
  p('Toca la ', b('pieza de rompecabezas'), ' (arriba a la derecha de Chrome) → el ', b('pin'), ' junto a «Asistente de envíos» para dejarlo a la vista → ábrelo. Escribe el ', b('mismo código'), ' y toca ', b('Conectar'), '.'),
  foto('09-extension-pide-codigo.png', 320),
  p('Debe decir ', b('Conectado al sistema'), ' y mostrar tu cuenta de MercadoEnvíos.'),
  foto('10-extension-conectada.png', 320),

  paso(7, 'Repite en cada cuenta de MercadoLibre'),
  p('¿Tienes otra cuenta en otro perfil de Chrome? Abre ese perfil, entra a ', b('app.elcomerciantedigital.com/extension'), ' y repite los pasos 5 y 6 con el mismo código (o uno nuevo si ya pasó la hora). El programa no se vuelve a instalar.'),

  paso(8, 'Prueba: trae tus pagos y guías'),
  p('En Pagos ME toca ', b('Traer pagos y guías'), '. Chrome se abre solo con cada cuenta, trabaja y se cierra: no lo toques. En 1 o 2 minutos aparece el aviso verde ', b('Listo'), ' con lo que trajo de cada cuenta.'),
  fotoPendiente('aviso verde «Listo» con las cuentas'),
  p('Junto al reloj de Windows queda el ícono ', b('ME'), ': verde = todo bien.'),
  fotoPendiente('ícono ME verde junto al reloj'),

  h1('Cómo se usa cada día'),
  vineta(b('Solo:'), ' trae en los horarios de «Traer automático» (los cambias en Configurar).'),
  vineta(b('A mano:'), ' cuando quieras, «Traer pagos y guías» y espera el aviso verde.'),
  vineta(b('Verifica'), ' los pagos contra el banco en la pestaña «Sin verificar» y después ve a Despachos: las guías ya están ahí.'),

  h1('Preguntas frecuentes'),
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
