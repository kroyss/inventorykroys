# Manual del Sistema · El Comerciante Digital

<!-- INTERNO (se quita antes de mandarlo a la IA, lib/ayuda.ts):
**Para qué es este archivo.** Es la explicación completa del Sistema (app.elcomerciantedigital.com) para los
clientes y su equipo. Es la ÚNICA fuente del asistente de ayuda: lo que no esté aquí, el asistente no lo sabe
y manda a Soporte. **Regla:** cada cambio que el usuario vea (pantalla, botón, texto, flujo, módulo, permiso) se
actualiza aquí en el mismo commit. El Radar tiene su propio manual (radar.elcomerciantedigital.com/ayuda).

Cada sección trae una línea *«Cómo lo pregunta la gente»* con las palabras que usan los clientes, para que el
asistente encuentre la sección aunque no usen el nombre del menú. El asistente recibe además la pantalla donde está
el usuario y le da prioridad a esa sección.

Última revisión: 30-10-2026.
-->

---

## 1. Qué es el Sistema

El Comerciante Digital es un sistema para vendedores de **MercadoLibre** (sobre todo Venezuela) que atiende desde
un solo lugar lo que pasa en todas tus cuentas de ML: preguntas, mensajes, despachos, guías, calificaciones,
stock y pagos de MercadoEnvíos. Opcionalmente lleva también tu **inventario** (productos, ventas, compras,
reportes).

Está organizado en **espacios**, cada uno con su propio menú:

| Espacio | Qué tiene | Quién lo ve |
|---|---|---|
| **Automatizaciones** | Preguntas, Mensajes, Stock, Pagos ME, Despachos, Calificaciones, Reportador, Cuentas de ML, Mis avisos | Todas las empresas |
| **Inventario** | Inicio, Ventas, Inventario, Compras, Productos, Vincular ML, Reportes, Ajustes | Solo si la empresa tiene el módulo Inventario |
| **Radar de Oportunidades** | Otra aplicación (radar.elcomerciantedigital.com) para buscar productos que conviene vender | Solo si la empresa tiene el módulo Radar |

Lo que no es de ningún espacio (Usuarios, Aprendizaje, Novedades) está en todos.

**Nada se publica solo sin que lo decidas:** el sistema propone (respuestas, calificaciones, mensajes) y tú
revisas, salvo en lo que tú mismo prendas como automático (respuestas automáticas, calificación automática,
mensaje al comprador nuevo, recordatorios de pago).

### Módulos

Cada empresa tiene prendidos unos **módulos**. Un módulo apagado no aparece en el menú. Si alguien de tu equipo
no ve una sección, puede ser porque (a) la empresa no tiene ese módulo, o (b) su usuario no tiene el permiso
(ver [Usuarios y permisos](#14-usuarios-y-permisos)). Los módulos los prende El Comerciante Digital según tu plan:
escríbenos a Soporte.

Algunas secciones son **solo de Venezuela** (Pagos ME, Despachos, Reportador): trabajan con ZOOM y TEALCA y con
el portal de MercadoEnvíos de Venezuela.

---

## 2. Entrar, cuenta y prueba gratis

*Cómo lo pregunta la gente:* clave, contraseña, no puedo entrar, login, registrarme, crear cuenta, prueba gratis, días de prueba, vencida.

- **Dirección:** app.elcomerciantedigital.com. Se entra con **usuario y contraseña** (no con correo).
- **Una cuenta por persona.** Si una persona trabaja en varias empresas, usa el mismo usuario y elige la empresa
  en el selector de arriba (navbar).
- **Olvidé mi contraseña:** el administrador de tu empresa te pone una nueva en **Usuarios → Cambiar
  contraseña**. Si el olvido es del administrador, escríbenos a Soporte.
- **Crear cuenta:** app.elcomerciantedigital.com/registro (nombre del negocio, tu nombre, usuario, contraseña y un
  contacto: WhatsApp o Telegram).
- **Prueba gratis de 15 días:** incluye Automatizaciones y Pagos ME (sin Inventario). Los días **empiezan a contar
  cuando conectas tu primera cuenta de MercadoLibre**, no al registrarte. Cada cuenta de MercadoLibre puede usar
  una sola prueba. Al terminar la prueba, para seguir hay que escribirnos (Telegram) y elegir un plan.
- **Cuenta solo del Radar:** si te registraste desde radar.elcomerciantedigital.com, tu cuenta entra solo al
  Radar; si intentas entrar al Sistema te lo indica. Para usar el Sistema, escríbenos.

---

## 3. Planes y créditos de IA

*Cómo lo pregunta la gente:* precio, cuánto cuesta, plan, pagar, mensualidad, créditos, se me acabaron los créditos, recargar, IA.

Los precios están en app.elcomerciantedigital.com/precios. Hay tres planes, y el precio depende de cuántas
ventas haces al mes (sumando todas tus cuentas, sin canceladas):

| Ventas al mes | Esencial | Automatizaciones | Completo | Créditos IA al mes |
|---|---|---|---|---|
| Hasta 50 | $8 | $10 | $14 | 50 |
| 51 a 300 | $12 | $15 | $20 | 80 |
| 301 a 1.000 | $18 | $22 | $27 | 100 |
| Más de 1.000 | $25 | $30 | $35 | 150 |

- **Esencial:** Preguntas con IA, Mensajes, Calificaciones, Stock + avisos por Telegram, guías ZOOM/TEALCA
  (Despachos) y Reporte de guías (Reportador).
- **Automatizaciones** (recomendado): lo de Esencial + Pagos MercadoEnvíos (programa en la PC y cruce con el banco).
- **Completo:** lo anterior + Inventario, vincular publicaciones de ML, pesos y precios, Promociones y reportes.
- Incluye 2 cuentas de MercadoLibre; cada cuenta extra +$3. Usuarios ilimitados. Pago trimestral −10%. Se
  puede pagar en bolívares a tasa BCV.
- **Créditos de IA:** cada «Proponer con IA» usa 1 crédito; «Buscar en internet» usa 1 más 1 por cada búsqueda
  (hasta 4). Las respuestas rápidas, las parecidas y las que el sistema ya aprendió son **gratis**. Los créditos
  se renuevan el día 1 de cada mes (no se acumulan). Recarga: 100 créditos por $4 (estos no vencen). La prueba
  gratis trae 50 créditos.

---

## 4. Cuentas de MercadoLibre (Automatizaciones → Cuentas de MercadoLibre)

*Cómo lo pregunta la gente:* conectar ML, vincular mi cuenta de MercadoLibre, agregar otra cuenta, se desconectó, reconectar, token.

Es el primer paso: sin una cuenta de ML conectada no entra nada (ni preguntas, ni mensajes, ni ventas).

**Conectar:** toca **Conectar cuenta**, entra a MercadoLibre con la cuenta que quieres conectar y acepta los
permisos. Vuelves solo al sistema con la cuenta ya conectada. Para conectar otra cuenta, **cierra sesión en
MercadoLibre** (o usa otra ventana/perfil) y repite: si no, ML vuelve a conectar la misma.

**Reconectar:** si cambiaste la clave de ML o la cuenta perdió la conexión, aparece como desconectada y no entra
nada de ella hasta que toques **Reconectar**. Con Telegram conectado te avisamos apenas pase (ver
[Mis avisos](#13-mis-avisos-telegram)).

El sistema nunca publica, cambia precios ni borra nada en ML sin que lo pidas.

**Video:** Central de aprendizaje → «Conectar tu cuenta de MercadoLibre».

---

## 5. Preguntas (Automatizaciones → Preguntas)

*Cómo lo pregunta la gente:* responder preguntas, IA, respuesta automática, que responda solo, respuestas rápidas, plantillas, políticas, datos del producto.

Todas las preguntas sin responder de todas tus cuentas, en una sola lista.

**Cómo se usa:**
1. Abre una pregunta: ves la publicación, la pregunta y las preguntas anteriores de ese comprador.
2. Responde escribiendo, con una **respuesta rápida** (botón con un texto guardado) o con **Proponer con IA**: la
   IA lee la publicación, tus políticas y lo que el sistema aprendió de ese producto y propone una respuesta.
   **No se envía nada sin que la revises.**
3. **Buscar en internet:** para dudas técnicas que la publicación no responde (cuesta créditos extra).
4. Envía. La respuesta sale en MercadoLibre a tu nombre.

**Para que la IA responda mejor:**
- **Políticas para la IA:** lo general de tu negocio (horarios, envíos, formas de pago, garantía, retiro en
  persona…). Se escriben una vez y la IA las usa en todas las respuestas.
- **Anotar dato del producto:** cuando respondes algo que la IA no sabía (ej. «sí trae cargador»), guárdalo como
  dato de ese producto y la próxima vez lo usa sin gastar créditos de más.
- **Lo aprendido de cada producto:** el sistema guarda respuestas que diste y las reutiliza en preguntas parecidas
  (gratis).

**Respuesta sugerida:** cuando una pregunta se parece mucho a otra que ya respondiste, la respuesta aparece ya
escrita; la revisas y la envías (también varias juntas con «Enviar las sugeridas»). Hoy **ninguna pregunta se
responde sola**: siempre la envía una persona.

**Otras acciones:** reponer stock desde la pregunta («¿tienes disponible?» con la publicación agotada) y eliminar
preguntas (spam, ofensivas).

**Problemas comunes:**
- *No me aparecen preguntas:* revisa que la cuenta esté conectada (Cuentas de MercadoLibre).
- *«No tienes créditos»:* se acabaron los del mes; puedes responder a mano o con respuestas rápidas (gratis), o
  recargar.

**Video:** «Preguntas con IA».

---

## 6. Mensajes (Automatizaciones → Mensajes)

*Cómo lo pregunta la gente:* mensajes de compradores, posventa, chat, adjuntar foto, enviar comprobante, nota de la venta, mensaje de bienvenida, recordar el pago, pedir calificación.

Los mensajes de tus ventas en MercadoLibre (posventa), de todas tus cuentas, para que ninguno quede sin respuesta.

**Cómo se usa:**
- Elige una conversación. Ves los mensajes, los productos, el total de la venta y, si usas Despachos, si su guía ya
  salió.
- **Leer un mensaje aquí NO lo marca como leído en MercadoLibre:** se marca cuando respondes o tocas el sobre.
- Escribe la respuesta. Puedes **adjuntar fotos (JPG/PNG) o PDF**, también pegándolas con **Ctrl+V**. **Ctrl+Enter**
  envía.
- **Respuestas rápidas de mensajes:** botones con textos guardados; un clic pone el texto y lo puedes retocar.
  Si no tienes ninguna, el sistema ofrece unos ejemplos para empezar.
- **Proponer con IA:** lee la conversación, la nota y la venta y propone una respuesta (no envía nada).
- **Nota de la venta:** una nota interna que se guarda en MercadoLibre; **el comprador no la ve** (ej. «cambia a
  talla L», «garantía, espera fotos»).
- **Buscar:** por comprador, nº de venta, producto o algo que se habló.

**Pestañas extra:**
- **Mensaje al comprador nuevo:** manda un mensaje de bienvenida a cada venta nueva (1 o 2 minutos después),
  una sola vez por venta, solo a ventas que entren desde que lo prendes. No se manda si la venta se canceló o si el
  comprador ya te escribió. `{nombre}` = primer nombre del comprador. MercadoLibre corta los mensajes de más de
  **350 caracteres** sin avisar. Lo configura un administrador.
- **Recordatorios de pago:** le recuerda el pago a quien compró y no ha concretado (1 vez al día a las 10:00, o 2
  veces: 10:00 y 17:00). Puedes poner otro texto para el último aviso. Si ya pagó, toca **Ya pagó, no recordar**.
  Se saltan las ventas donde el comprador ya escribió o se canceló.
- **Pedir calificación:** cuando calificaste una venta como concretada y positiva y el comprador no te calificó
  después de 2 días, aparece para pedírsela. **Nada se envía solo:** revisas el texto y lo envías, una vez por
  venta.

**Problemas comunes:**
- *«MercadoLibre moderó el mensaje»:* ML bloqueó el texto (puede pasar con links externos, redes sociales o
  palabras como «pago fuera»). Reescríbelo. En los mensajes de una venta sí puedes poner un teléfono o un correo
  (en Venezuela ML los deja pasar); en las **Preguntas**, que son públicas, no.
- *Llegó al límite de MercadoLibre:* ML limita cuántos mensajes puedes mandar seguidos en una venta si el comprador
  no responde.

**Video:** «Mensajes».

---

## 7. Stock (Automatizaciones → Stock)

*Cómo lo pregunta la gente:* agotado, sin stock, reponer, actualizar stock en ML, pausadas, reactivar publicación, por agotarse.

Lo que vendiste en los últimos 30 días y se **agotó** o está **por agotarse** en MercadoLibre, por variante.

- **Agotadas / Por agotarse:** el límite de «por agotarse» lo eliges tú (por defecto, menos de 3). Escribe el stock
  nuevo en cada fila (✎) y toca **Actualizar en MercadoLibre**: solo cambia la cantidad disponible, nada más.
- **Pausadas:** publicaciones pausadas a mano (o por ML al quedar en 0). Márcalas y toca **Reactivar en
  MercadoLibre** (o ▶ en cada una).
- **No hay para reponer:** deja de avisar de ese producto hasta que lo repongas y vuelva a agotarse.
- **Revisar ahora:** busca en ML en el momento (se puede cada 10 minutos). Además se revisa sola cada hora.
- Si la empresa lleva Inventario, cada fila muestra cuánto tienes en inventario y un botón «usar» para ponerlo
  como stock nuevo.
- «MercadoLibre la frenó (en revisión)»: ML la tiene en revisión; hay que verla en MercadoLibre.

**Video:** «Calificaciones y Stock».

---

## 8. Pagos ME (Automatizaciones → Pagos ME) · Venezuela

*Cómo lo pregunta la gente:* MercadoEnvíos, Mercadoenvios, el portal, pagos de envío, comprobantes, el programa, el vigilante, la extensión, Asistente de envíos, código de conexión, traer pagos, verificar pagos, banco, estado de cuenta.

Trae **solos** los pagos de MercadoEnvíos (con su comprobante) y las **guías**, desde el portal de MercadoEnvíos,
para que verifiques los pagos de corrido y despaches.

**Cómo funciona:** un programa en tu PC (Windows) trae tus pagos y guías usando tu Google Chrome, con tu sesión de
MercadoEnvíos ya iniciada. **Tu contraseña nunca sale de tu PC.** Si se va la luz no se pierde nada: al prender
la PC trae lo que faltaba.

**Antes de empezar:** PC con Windows, Google Chrome, y en Chrome la sesión de MercadoEnvíos iniciada con tu cuenta
de MercadoLibre (**un perfil de Chrome por cada cuenta de ML**). Ser administrador de tu empresa en el sistema.

**Pasos de instalación:**
1. **Descarga el programa** en la PC donde imprimes las guías e instálalo (Siguiente → Instalar). Si Windows muestra
   «Windows protegió su PC», toca **Más información → Ejecutar de todas formas**.
2. Cuando el programa pida el código: en Pagos ME toca **Genera tu código** y pégalo. Deja marcadas las dos casillas
   y termina.
3. **Agrega el Asistente de envíos a Chrome:** al terminar la instalación se abre la tienda de Chrome → **Añadir a
   Chrome → Añadir extensión**. Hazlo en el perfil de Chrome donde tienes iniciada la sesión de MercadoEnvíos.
   (También en app.elcomerciantedigital.com/extension). No hace falta «Iniciar sesión en Chrome».
4. **Conecta el Asistente:** pieza de rompecabezas (arriba a la derecha de Chrome) → 📌 fija «Asistente de envíos» →
   ábrelo y **pega el mismo código**. Debe decir «Conectado al sistema».
5. ¿Otra cuenta de ML? Crea otro perfil de Chrome (tu foto arriba a la derecha → Agregar → Continuar sin cuenta),
   entra ahí a MercadoEnvíos con esa cuenta y repite los pasos 3 y 4. Si el código venció, genera otro: lo ya
   conectado sigue funcionando.

**Uso diario:** toca **Traer pagos y guías** y espera el aviso verde. Chrome se abre solo, trabaja y se cierra: no
lo toques. Luego verifica cada pago (Pago correcto / inválido). **Despachos no imprime guías con el pago sin
verificar.**

**Comprobar con el banco:** sube los estados de cuenta de tu banco (archivos descargados del banco) y el sistema
cruza referencia, monto y fecha con los pagos: los que coinciden quedan como «Pago correcto». Muestra también los
créditos del banco que no son de ninguna venta.

**Problemas comunes:**
- *«PC sin señal» / «ningún perfil de Chrome tiene el Asistente conectado»:* la PC está apagada, o falta el paso 4.
- *«No tiene la sesión de MercadoEnvíos iniciada»:* en la PC quedó abierta esa ventana; inicia sesión ahí y vuelve
  a traer. No cierres sesión de MercadoEnvíos en ningún perfil.
- *«Un Chrome tiene abierta una cuenta de MercadoEnvíos que no corresponde a ninguna cuenta conectada»:* en ese
  perfil entraste con otra cuenta; entra con la correcta.

**Video:** «Conéctate con Mercadoenvios».

---

## 9. Despachos (Automatizaciones → Despachos) · Venezuela

*Cómo lo pregunta la gente:* etiquetas, imprimir guías, guías ZOOM, guías TEALCA, PDF de MercadoEnvíos, 4 por hoja, lote, jornada, manifiesto, apartar, en espera, cancelar envío.

Imprime las etiquetas de MercadoEnvíos (ZOOM / TEALCA) **4 por hoja**, con la cantidad y la nota de cada paquete,
y arma el **manifiesto** al final del día.

**Cómo se usa:**
1. Las guías entran solas desde Pagos ME, o **arrastra los PDFs** de MercadoEnvíos (o pégalos con Ctrl+V, o haz
   clic para elegirlos). Forman un **lote**.
2. Revisa el lote: cada etiqueta muestra la venta, los productos y la nota. Puedes escribir o corregir la nota
   del paquete (manda sobre la de MercadoLibre) y elegir si en la etiqueta se imprime el título y/o la nota.
3. Genera el PDF y **imprime a «Tamaño real» (100%)**, no «Ajustar a la página».
4. Al final del día: **Cerrar jornada → Manifiesto**. Se genera un manifiesto por transportista (ZOOM / TEALCA) con
   todos los envíos de la jornada. La jornada se abre sola con el primer lote.

**Apartar un envío:** si una guía no debe salir todavía (el cliente pidió para el lunes, pagó mal…), apártala:
- **En espera:** no sale en ningún manifiesto ni se le reporta la guía hasta que toques «Sale en el próximo
  manifiesto».
- **Cancelar envío:** nunca sale ni se le manda la guía. No se puede deshacer.
- Si la etiqueta ya estaba impresa, separa el paquete físico.

**Guías Tealca:** TEALCA cambia la guía en la oficina; escribe la guía final de cada envío en «Guías Tealca» para
que el Reportador se la mande al comprador.

**Video:** «Despachos».

---

## 10. Reportador (Automatizaciones → Reportador) · Venezuela

*Cómo lo pregunta la gente:* reporte de guías, reportar guías, mandar la guía al comprador, mensaje con la guía, número de guía, el Reportador, programa de escritorio.

Le escribe a cada comprador su **número de guía** por MercadoLibre, después de cerrar la jornada en Despachos.

**Cómo se usa:**
1. **Antes del primer reporte, revisa el mensaje** que recibirá el comprador (Mensaje al comprador). Te dejamos uno
   listo: `{guia}` se cambia por la guía y `{transportista}` por ZOOM o TEALCA. Toca «Usar este mensaje» y se
   habilita el botón de reportar.
2. Cierra la jornada en Despachos. Las guías entran a la cola del Reportador (las de TEALCA, cuando escribes la guía
   final).
3. **Reportar por API:** el sistema le escribe a cada comprador solo. Puedes cerrar la pantalla o
   bloquear el teléfono. Antes de cada envío revisa la conversación para no repetirle la guía a nadie. Opción
   «Reportar solo al cerrar la jornada».

**Mensajes:** puedes tener varias versiones (se elige una al azar por comprador) y un texto final que se agrega a
todas (ej. «¡Gracias por comprar en MI TIENDA!»). **MercadoLibre rechaza links de Facebook** (incluso acortados);
t.me y youtube.com sí pasan. **Adjuntar la guía en PDF:** solo para envíos ZOOM.

**¿Cómo incluyo una guía en el reporte?** No se escribe a mano en el Reportador: la guía tiene que pasar por
Despachos. Sube su PDF a Despachos (o deja que entre sola desde Pagos ME con el pago verificado), imprímela en un lote
y **cierra la jornada**: ahí entra a la cola del Reportador. Si es TEALCA, además escribe la guía final en «Guías
Tealca». Si la apartaste («En espera»), no se reporta hasta que toques «Sale en el próximo manifiesto».

**Importante:** si imprimes las guías directo desde MercadoLibre (sin Despachos), el sistema no se entera y no las
reporta. También existe un **programa de escritorio** (respaldo) que se vincula con un código.

**Video:** «Reportador».

---

## 11. Calificaciones (Automatizaciones → Calificaciones)

*Cómo lo pregunta la gente:* calificar compradores, calificar ventas, concretada, no concretada, calificación automática, comisión.

Tus ventas de MercadoLibre **sin calificar**, cruzadas con el sistema para saber cuáles se concretaron.

- **Concretada:** su guía salió en Despachos y (si lleva guía) ya la reportaste con el Reportador; o está en el
  sistema (procesada).
- **No concretada:** cancelada en MercadoLibre, o nunca entró al sistema ni a Despachos.
- **Revisar:** el sistema no puede saberlo (ej. guía impresa pero no reportada en 10 días): decide tú.

Sin Despachos y Reportador el sistema no sabe cuáles se concretaron: decides tú cada una (solo las canceladas en ML
salen como no concretadas). Puedes cambiar cada una antes de calificar. Motivos de no concretada: no pagó, se
arrepintió, no respondió, sin stock, no respetó las condiciones.

**Calificación automática:** las concretadas se califican solas unos días después de reportar la guía, a la hora
que elijas. Las no concretadas aparecen en tu lista y no se califican solas. **Las calificaciones son públicas y
salen a tu nombre; no se pueden deshacer desde aquí.**

**Ojo:** MercadoLibre da por **concretada sola** una venta a los 7 días de la compra y cobra la comisión. Si nadie
pagó, márcala no concretada antes (el sistema avisa: «ML la concreta sola hoy/mañana»).

**Corregir mi calificación:** cambia en ML la calificación que diste (concretada, tipo y comentario).

**Video:** «Calificaciones y Stock».

---

## 12. Reputación (Automatizaciones → Calificaciones → Reputación)

*Cómo lo pregunta la gente:* me calificaron negativo, neutral, cambiar calificación, pedir cambio, reputación, termómetro, contradictoria.

Las calificaciones que te dieron los compradores: tu termómetro y las **neutrales o negativas** de los últimos 30
días, para intentar que las cambien.

- **Pedir cambio:** abre en MercadoLibre la solicitud de cambio de calificación. ML deja pedirlo **una sola vez por
  venta** y hasta **30 días** después de recibirla. Tienes que estar dentro de ML con esa cuenta.
- Después el comprador tiene unos **5 días** para responder; si no responde, ML la quita.
- **Contradictoria:** el comprador dijo que la venta SÍ se concretó y tú marcaste que NO. Se arregla corrigiendo tu
  calificación.
- Abajo ves cómo terminaron los pedidos de cambio de los últimos 90 días.

---

## 13. Mis avisos (Telegram)

*Cómo lo pregunta la gente:* Telegram, notificaciones, alertas, avisos, bot, resumen del día, que me avise.

Avisos en tu Telegram de lo que MercadoLibre no te avisa. **Cada persona del equipo elige los suyos.**

**Conectar:** toca **Conecta tu Telegram**, se abre Telegram, toca **Iniciar** en el bot y listo. El bot solo te
escribe a ti.

**Qué te puede avisar:**
- Cuenta de MercadoLibre desconectada.
- Pregunta sin responder (al instante, o si lleva X minutos sin respuesta).
- Mensaje de comprador sin responder.
- Calificación negativa recibida (y opcionalmente neutrales).
- Calificación contradictoria.
- Venta sin pago que ML va a concretar sola (dos días antes).
- Producto agotado (y opcionalmente por agotarse). Puede llegar hasta 1 hora después.
- Promociones de MercadoLibre: campaña nueva y campañas por cerrar.
- **Resumen de la mañana** y **cierre del día** con lo que quedó pendiente.
- **Silencio:** horas en las que no te llega nada; lo pendiente llega al terminar.

Si no ves algunos avisos es porque tu usuario no tiene acceso a esa sección (Preguntas, Mensajes o Calificaciones).

---

## 14. Usuarios y permisos

*Cómo lo pregunta la gente:* empleados, agregar usuario, mi equipo, permisos, no ve una sección, cambiar contraseña de un empleado, administrador.

Quién puede entrar a tu empresa. Cada empresa tiene sus propios usuarios. Solo lo maneja un **administrador**.

- **Nuevo usuario:** nombre, usuario (para entrar) y contraseña inicial. Pásale su contraseña a la persona.
- **Roles:** *Administrador* = todo, incluidos Usuarios y Ajustes. *Usuario* = lo que le marques en **Permisos**.
- **Permisos:** secciones que ve (Preguntas, Mensajes, Despachos…) y acciones (ver costos, editar compras, configurar
  automatizaciones…). «Volver a lo predeterminado» lo deja como al inicio.
- **Ver como:** te muestra el sistema exactamente como lo ve esa persona, sin poder guardar nada.
- **Cambiar contraseña / Desactivar:** cierra las sesiones abiertas de esa persona. Al desactivar, su historial se
  conserva.

---

## 15. Inventario (solo con el módulo Inventario)

*Cómo lo pregunta la gente:* productos, catálogo, inventario, ventas, compras, entró mercancía, vincular publicaciones, combos, packs, promociones, reportes, tasa, ajustes.

> Este espacio se prende por empresa (plan Completo). Si no lo ves, tu empresa trabaja «todo desde MercadoLibre».

- **Inicio:** cómo va tu negocio este mes (ventas, ganancia, sin stock, ventas pendientes).
- **Productos:** catálogo, precios y margen neto de cada producto. **Importar desde ML** crea productos a partir de
  tus publicaciones (cada una, o cada color/modelo, queda vinculada). Clic en una fila abre la ficha; Editar en el pie.
- **Vincular ML:** une cada publicación (o cada variante) con su producto, para que las ventas de ML descuenten el
  producto correcto. Todo es manual: el sistema sugiere y tú confirmas con un clic.
- **Stock en ML:** cada producto con todas sus publicaciones; iguala el stock y reactiva las pausadas en todas tus
  cuentas de una vez. Aquí se marca si una publicación es pack/combo («trae N u.»).
- **Ventas:** órdenes de MercadoLibre y ventas locales. Al registrar una venta se descuenta el inventario.
- **Inventario:** stock actual de cada producto y sus movimientos. Ajuste de stock: si contaste y está mal, se guarda
  como ajuste.
- **Compras:** «Entró mercancía» (en un paso: carga el inventario), o por etapas si la empresa lo usa.
- **Promociones:** campañas de MercadoLibre, qué publicaciones pueden entrar y hasta dónde bajar el precio sin
  perder el envío gratis.
- **Reportes:** por período (ventas, compras, más vendidos) o del estado actual del inventario; hoja de conteo físico.
- **Ajustes:** tasa del dólar, costos de MercadoLibre (comisión, envío) y otras configuraciones del administrador.

<!-- VERIFICAR con el dueño: el detalle de Inventario simple de los clientes se completará cuando se graben sus videos -->

---

## 16. Central de aprendizaje y Novedades

*Cómo lo pregunta la gente:* videos, tutoriales, cómo se usa, qué hay de nuevo.

- **Central de aprendizaje** (menú Aprendizaje): videos cortos paso a paso; guarda por dónde vas en cada uno.
  **Cuando un video explica lo que preguntan, recomiéndalo** (además de responder), con su título:

  | Video | Qué enseña | Secciones |
  |---|---|---|
  | 1 · Así trabajas desde hoy | Cómo se organiza el Sistema y el orden para empezar (primero aprende, después conecta) | 1, 2 |
  | 2 · Conectar tu cuenta de MercadoLibre | Conectar y reconectar cuentas de ML (se hace una vez y hace funcionar todo) | 4 |
  | 3 · Preguntas con IA | Responder preguntas con IA, respuestas rápidas, políticas y datos del producto | 5 |
  | 4 · Mensajes | La bandeja de mensajes de todas las cuentas, adjuntos, notas y respuestas rápidas | 6 |
  | 5 · Despachos | Imprimir etiquetas 4 por hoja con el producto escrito, jornada y manifiesto | 9 |
  | 6 · Reportador | Mandarle la guía a cada comprador con un clic | 10 |
  | 7 · Calificaciones y Stock | Calificar en lote y mantener el stock al día | 7, 11, 12 |
  | 8 · Conéctate con Mercadoenvios (serie MercadoEnvíos) | Instalar y conectar el programa y la extensión para traer guías y pagos | 8 |

  <!-- INTERNO: la lista viva de videos está en la base (aprendizaje_videos); el asistente la recibe al día y enlaza
  al video. Si se agrega o cambia un video, actualizar también esta tabla. -->
- **Novedades:** lo nuevo del sistema, en orden de fecha.

---

## 17. Lo que el Sistema NO hace (límites de MercadoLibre)

*Cómo lo pregunta la gente:* bloquear comprador, no se puede, límite, Facebook, mensaje cortado.

- **No bloquea compradores:** MercadoLibre no lo permite desde otros sistemas; se hace desde la web de ML.
- **No saca solo las guías de MercadoEnvíos** en Venezuela: para eso está **Pagos ME** (el programa en tu PC).
- **No publica ni cambia precios solo.** Solo cambia stock o reactiva cuando tú lo pides.
- **No ve tus guías si las imprimes directo en MercadoLibre** (sin pasar por Despachos).
- **Links de Facebook** en mensajes: MercadoLibre los rechaza.
- **Mensajes de más de 350 caracteres** (mensaje al comprador nuevo): ML los corta sin avisar.

---

## 18. Soporte

*Cómo lo pregunta la gente:* hablar con alguien, ayuda, soporte, contacto, horario, Telegram del soporte, la burbuja, el botón de ayuda, mis casos.

**Botón de Ayuda**: un globo de mensaje abajo a la derecha, en todas las pantallas (al pasar el cursor dice «Ayuda»;
en el celular, encima del menú de abajo):
- **Preguntar:** preguntas frecuentes de la pantalla donde estás (con su respuesta, al instante) y una caja para
  preguntar lo que quieras: responde un asistente con este manual y, si hay un video que lo explica, te deja el
  enlace. **No gasta tus créditos de IA.** Puede equivocarse: con 👍 / 👎 nos dices si te sirvió. Hay un máximo de
  preguntas por persona al día. Las preguntas frecuentes siguen debajo de la conversación, y **«↺ Empezar de nuevo»**
  (arriba) borra la conversación y vuelve al inicio.
- **Soporte:** escribe qué pasó y adjunta hasta **3 capturas** (imágenes PNG/JPG o PDF de hasta 5 MB; también se
  pegan con **Ctrl+V**). Nos llega con la pantalla donde estabas. La respuesta aparece ahí mismo (un punto rojo en
  el botón avisa que te respondimos) y, si conectaste tu Telegram en **Mis avisos**, también te llega por Telegram.
  Puedes seguir escribiendo en el mismo caso; cuando se arregle, toca **Ya se resolvió**.
- Todos los usuarios de la empresa pueden escribir a soporte, no solo el administrador.

**Horario:** lunes a sábado, 8:00 am a 6:00 pm (hora de Venezuela). Fuera de ese horario lo dejas escrito y te
respondemos al volver. También por Telegram: t.me/elcomerciantedigital.

Para ayudarte rápido: di qué pantalla, qué hiciste y qué esperabas; una captura de pantalla ayuda mucho.

---

## 19. Privacidad y tus datos

*Cómo lo pregunta la gente:* privacidad, mis datos, quién ve mis ventas, el administrador ve lo que hago, ustedes ven
mi información, es seguro, comparten mis datos, mi contraseña la ven.

- **Tus datos son de tu empresa:** ninguna otra empresa puede verlos.
- **Dentro de tu empresa**, el administrador decide qué ve y qué puede hacer cada persona (**Usuarios → Permisos**).
- **Tu contraseña no la puede ver nadie.** Solo se puede poner una nueva (ver «Olvidé mi contraseña» en la sección 2).
- **MercadoLibre:** el sistema usa la conexión que tú autorizaste para leer y responder en tu cuenta. La puedes
  desconectar cuando quieras en **Cuentas de MercadoLibre**.
- Cualquier otra duda sobre tus datos o la privacidad: escríbenos a **Soporte** y te respondemos personalmente.
