# Guía para Fundadores: conectar Pagos MercadoEnvíos (borrador, 19-10-2026)

Capturas tomadas en la PC de Venezuela al reinstalar con la versión oficial (programa 1.3.5 + extensión
de la Chrome Web Store). Con esto se arma la guía en PDF.

| Paso | Captura | Texto para la guía |
|---|---|---|
| 1 | 01-pantalla-pagos-me.webp | Entra a Pagos ME. Fundadores: menú **Automatiza → Pagos ME** (SolucionesMC lo tiene en Inventario). Un Fundador nuevo ve el recuadro verde con los pasos. |
| 2a | 02a-windows-protegio.png | Al abrir el programa, Windows muestra «Windows protegió su PC»: toca **Más información**. Sale porque el programa es nuevo y no tiene firma comprada. |
| 2b | 02b-ejecutar-de-todas-formas.png | Toca **Ejecutar de todas formas**. |
| 3 | 03-programa-pide-codigo.png | El programa pide el **código de conexión**: en Pagos ME toca «Genera tu código» / «Conectar una PC» y escríbelo aquí (vale 60 min). Cada Fundador genera el suyo, con su usuario (admin de su empresa). |
| 3b | 03b-codigo-en-pagos-me.png | El código en Pagos ME (botón **Copiar**). Vale 60 min; sirve para el programa y para la extensión de cada perfil. Si vence, se genera otro: lo ya conectado sigue funcionando. |
| 4 | 04-programa-instalado.png | Listo el programa (ícono verde «ME» junto a la hora). Toca **Siguiente**: se abre la página para agregar el Asistente de envíos a Chrome. |
| 5 | 05-finalizar-instalacion.png | **Finalizar** con las dos primeras casillas marcadas. (OJO: la 3ª, «Abrir la carpeta de la extensión», es de la carga a mano: QUITARLA del instalador en la próxima versión; mientras, desmarcarla.) |
| 6 | 06-tienda-chrome.png | Se abre la tienda de Chrome con «El Comerciante Digital · Asistente de envíos»: toca **Añadir a Chrome**. (Fijarse en qué perfil de Chrome se abrió.) |
| 7 | 07-anadir-extension.png | Chrome pregunta si instalar: **Añadir extensión**. Los permisos son solo para leer el portal de MercadoEnvíos y hablar con el sistema. |
| 8 | 08-extension-anadida.png | Aviso «se ha añadido a Chrome». **No hace falta «Iniciar sesión en Chrome»**: cierra el aviso con la ✕. |
| 9 | 09-extension-pide-codigo.png | Pieza de rompecabezas → 📌 fijar «Asistente de envíos» → abrirlo. Escribe el **mismo código** del programa → **Conectar**. («ABCD-2345» es solo el ejemplo gris.) |
| 10 | 10-extension-conectada.png | **Conectado al sistema**: muestra la cuenta de MercadoEnvíos y con qué cuenta del sistema se unió (✓). Si había un pedido pendiente, empieza a traer solo. Repetir en cada perfil de Chrome. |

Pendiente de captura: extensión conectada mostrando la cuenta (en cada perfil) · «Traer pagos y guías» con el aviso verde «Listo» ·
ícono ME verde junto al reloj.

## Arreglos para la próxima versión (1.3.6), anotados durante la prueba
- Instalador: quitar la casilla «Abrir la carpeta de la extensión (para cargarla en Chrome)» (es de la carga a mano).
- Extensión: quitar el permiso `tabs` (Chrome lo muestra como «Leer tu historial de navegación» y asusta);
  con `host_permissions` del portal alcanza para `tabs.query({url})` y los eventos de esas pestañas. Probar antes.
- Extensión de la tienda: sacar `staging.elcomerciantedigital.com` de `host_permissions` (al cliente le aparece «staging»).
- Pagos ME: el texto del código dice «Vale hasta las 12:19 p. m..» (doble punto al final).
- Extensión: el estado dice «✓ Conectado. Conectado: trayendo pagos…» (repite «Conectado»).
- Despertador: busca los perfiles con la extensión cada 10 min. Un perfil recién conectado no entra en la
  primera traída (19-10: PIKEKE quedó afuera del pedido 254). Buscar de nuevo en cada pedido nuevo.
