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
| **Inventario** | Inicio, Ventas, Inventario, Compras, Productos, Publicaciones, Reportes, Ajustes | Solo si la empresa tiene el módulo Inventario |
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
- **Prueba gratis de 15 días:** incluye Automatizaciones y Pagos ME (sin Inventario). Los días **corren desde que te
  registras**: conecta tu cuenta de MercadoLibre cuanto antes para aprovecharlos. Cada cuenta de MercadoLibre puede usar
  una sola prueba. Al terminar la prueba, para seguir se elige el plan y se paga en **Mi plan** (ver
  [Planes](#3-planes-y-créditos-de-ia)).
- **Cuenta solo del Radar:** si te registraste desde radar.elcomerciantedigital.com, tu cuenta entra solo al
  Radar; si intentas entrar al Sistema te lo indica. Para usar el Sistema, escríbenos.
- **Radar mensual (solo Radar):** el registro del Radar está siempre abierto. Para entrar se paga el mes:
  **$20 al mes** (en noviembre 2026, **$12**, −40%), y ese mes tienes el **Radar PRO todos los días**. Mientras no
  pagas, al entrar al Radar ves 5 productos de ejemplo y el botón **Pagar y activar**, que te lleva a **Mi plan**
  (app.elcomerciantedigital.com/renovar) con tu mismo usuario y contraseña; pagas por Pago Móvil o Binance y, cuando
  lo confirmamos, se abre el Radar completo. Al vencer el mes vuelve la pantalla de pago; si pagas antes, el mes nuevo
  se suma a continuación. Solo hay pago mensual.

---

## 3. Planes y créditos de IA

*Cómo lo pregunta la gente:* precio, cuánto cuesta, plan, pagar, mensualidad, cómo pago, pago móvil, binance, renovar, mi pago no aparece, créditos, se me acabaron los créditos, recargar, IA.

Los precios están en app.elcomerciantedigital.com/precios. Hay tres planes, y el precio depende de cuántas
ventas haces al mes (sumando todas tus cuentas, sin canceladas):

| Ventas al mes | Esencial | Automatizaciones | Completo | Créditos IA de regalo (1er plan) |
|---|---|---|---|---|
| Hasta 50 | $8 | $10 | $15 | 500 |
| 51 a 300 | $12 | $15 | $23 | 1.000 |
| 301 a 1.000 | $18 | $23 | $33 | 1.500 |
| Más de 1.000 | $27 | $35 | $45 | 2.500 |

- **Esencial:** Preguntas con IA, Mensajes, Calificaciones, Stock + avisos por Telegram, guías ZOOM/TEALCA
  (Despachos) y Reporte de guías (Reportador).
- **Automatizaciones** (recomendado): lo de Esencial + respuestas automáticas con IA en Preguntas y Mensajes (las activa
  el cliente; cada respuesta usa 1 crédito) + Pagos MercadoEnvíos (programa en la PC y cruce con el banco)
  + Radar de Oportunidades.
- **Completo:** lo anterior + Inventario, vincular publicaciones de ML, pesos y precios, Promociones y reportes.
- Incluye 2 cuentas de MercadoLibre; cada cuenta extra +$3. Usuarios ilimitados. Pago trimestral −10%
  (Fundadores: −30% mensual o trimestral, no se suman). El descuento es solo del plan: cuentas extra,
  Radar PRO y recargas de IA van a precio completo. El Fundador conserva el 30% mientras renueve a tiempo: si su mes gratis o
  su plan vence sin pago (ni pago reportado antes de vencer), la cuenta se pausa y deja de ser Fundador; al volver paga precio normal. Se puede pagar en bolívares a tasa BCV.
- **Créditos de IA:** cada respuesta de la IA usa 1 crédito: «Proponer con IA» y cada respuesta automática, en
  Preguntas o en Mensajes. Las respuestas rápidas, las parecidas y las que el sistema ya aprendió son **gratis**.
  Los créditos son **un solo saldo que no vence**: se suman y se usan cuando quieras.
  - La **prueba gratis** trae **500 créditos**.
  - El **primer plan** que contratas regala créditos según tus ventas: 500, 1.000, 1.500 o 2.500 (tabla de arriba),
    **una sola vez**. Renovar, cambiar de plan, pausar o reactivar no vuelve a dar créditos; lo que te quede sigue ahí.
  - **Recargas** (no vencen): 500 por $4, 2.000 por $15, 5.000 por $35. Se compran en **Mi plan → Créditos de IA**,
    igual que se paga el plan (Pago Móvil o Binance + captura); al confirmar el pago se suman al saldo y llega aviso.
  - El contador (en Preguntas y Mensajes) dice cuántos te quedan. Cuando queda el **10%** y cuando **se acaban** sale un
    aviso arriba en el sistema y le llega un Telegram al administrador (con el botón Recargar). Si se acaban, la IA deja
    de responder (también la automática) hasta que recargues; las respuestas rápidas y parecidas siguen.
  - Mi plan → Créditos de IA muestra cuántos te quedan.
- **Radar de Oportunidades:** los planes **Automatizaciones y Completo** traen el **Radar Gratis todos los días** (Esencial no) (catálogo con precio real, buscador
  y cabina). **Radar PRO** (sellos, filtros, productos nuevos del mes, Competencia, Tendencias) es los **sábados y
  domingos** por **+$6 al mes**; el primer mes de PRO va de regalo **solo una vez, en tu primer plan**
  (si renuevas, o suspendes y vuelves, ya no). Los demás meses se pagan ($6 cada uno, sin descuento): al pagar el plan
  marca **«Agregar Radar PRO»** (en el trimestral con regalo, los meses 2 y 3: +$12), o después, con el plan activo, en
  **Mi plan → Agregar Radar PRO** (1 mes, cada uno a continuación del que ya tengas). Los sábados y domingos, con Radar PRO
  vigente, arriba de todas las pantallas sale **«Radar PRO activo hoy»** con el botón **Entrar al Radar** (la ✕ lo cierra
  hasta el próximo fin de semana). Con los avisos por Telegram conectados, el sábado a las 9:00 llega
  también un mensaje con el mismo botón. **Entrar al Radar** (y «Radar» en tu menú) entra directo, sin volver a
  escribir la clave. Sin plan, el Radar queda en
  solo lectura (ve lo que guardó).
- **Vencimiento del plan:** el plan queda pagado hasta una fecha. Los últimos 5 días aparece un aviso arriba de
  todas las pantallas (en rojo el último día y el anterior; el mismo aviso que al terminar la prueba gratis, que
  también sale los últimos 5 días). Si ya reportaste el pago y está en revisión, en vez del aviso sale «Recibimos tu
  pago, lo estamos confirmando» (y por Telegram en el resumen de la mañana, si lo tienes activo). Si no se renueva, al día
  siguiente del vencimiento la cuenta se pausa: los datos se conservan y vuelve a funcionar apenas se renueva.
- **Si pagas durante la prueba gratis**, el plan empieza a contar cuando termina la prueba: no pierdes los días que
  te quedaban.
- **Pagar o renovar: Mi plan** (menú de tu cuenta, arriba a la derecha → **Mi plan**; solo el administrador):
  1. Ves tu estado y **lo que te toca pagar**: el sistema cuenta tus ventas de MercadoLibre del **mes pasado**
     (del 1 al último día; todas tus cuentas conectadas, también las que procesas por fuera del sistema) y te dice tu
     escalón y el precio. Si ya tienes plan, el escalón solo sube o baja cuando tus dos últimos meses quedan en otro
     escalón. Para pagar tienes que haber conectado tu cuenta de MercadoLibre (al conectarla se traen tus ventas de
     los últimos 90 días, así que no hace falta esperar un mes).
     El plan viene elegido (el tuyo, o Automatizaciones si vienes de la prueba); «cambiar plan» muestra los tres (el **Completo** sale en gris como «Próximamente»: todavía no se puede contratar).
     Puedes elegir **mensual** o **trimestral (−10%)**: cada opción muestra el precio por mes y, en el trimestral, cuánto
     pagas cada 3 meses y cuánto ahorras. Los regalos del primer plan (créditos de IA y 1 mes de Radar PRO) salen juntos
     en un recuadro. Debajo puedes marcar **Sumar Radar PRO** para los meses que no cubre el regalo. El **Resumen** muestra
     línea por línea de dónde sale el total (precio de lista del plan, descuento, cuentas extra, Radar PRO) y su
     equivalente en bolívares: son las mismas líneas que quedan registradas en el cobro. Los **Fundadores** ven su precio
     de lista tachado y el −30% Fundador (el trimestral les cuesta lo mismo por mes: el −30% ya es mayor que el −10%), con
     el recordatorio de que lo conservan mientras renueven a tiempo. En Créditos de IA, «cada 100» es lo que cuestan 100 créditos. El link **«¿Qué es el Radar?»** abre una ventanita con lo que es y
     lo que trae cada plan.
     Con un plan activo, arriba eliges **qué pagar**: **Renovar plan**, **Agregar Radar PRO** (1 mes, $6) o
     **Mejorar mi plan** (pasar a uno más caro desde hoy: pagas solo la diferencia por mes, con el mismo descuento que
     tiene tu plan, por los días que le quedan; la fecha de vencimiento no cambia y ahí renuevas ya con el nuevo).
     Para **bajar de plan**, elige el otro al renovar (no hay devolución de lo ya pagado).
  2. Pagas por **Pago Móvil** (en bolívares, a tasa BCV del día: el monto ya sale convertido) o **Binance** (USDT).
     El monto a pagar sale grande, y los datos tienen botón de copiar.
  3. Tocas **Ya pagué**: escribes la referencia (en Binance, el ID de la orden), la fecha y adjuntas la captura
     (con el botón, arrastrándola o pegándola con Ctrl+V; ves la miniatura antes de enviar).
  El pago queda **En revisión**: lo confirmamos a mano y, al aprobarlo, tu plan se activa o renueva solo y lo ves
  como **Pago aprobado · activo hasta dd/mm** (y por Telegram, si lo tienes conectado). Si algo no cuadra, ves el
  motivo y lo puedes volver a reportar. **Si lo reportas antes de que venza, tu cuenta no se pausa** mientras lo
  revisamos. Pagar antes no hace perder días: el nuevo período arranca donde termina el actual.
- **Cuenta ya vencida:** al intentar entrar aparece el aviso con el botón **Pagar mi plan**, que abre Mi plan sin
  iniciar sesión (también en app.elcomerciantedigital.com/renovar con tu usuario y contraseña). Al aprobarse el
  pago vuelves a entrar normal.
- Recargas de créditos de IA: en Mi plan → Créditos de IA (como el pago del plan).

---

## 4. Cuentas de MercadoLibre (Automatizaciones → Cuentas de MercadoLibre)

*Cómo lo pregunta la gente:* conectar ML, vincular mi cuenta de MercadoLibre, agregar otra cuenta, se desconectó, reconectar, token.

Es el primer paso: sin una cuenta de ML conectada no entra nada (ni preguntas, ni mensajes, ni ventas).

**Conectar:** toca **Conectar cuenta**, entra a MercadoLibre con la cuenta que quieres conectar y acepta los
permisos. Vuelves solo al sistema con la cuenta ya conectada. Para conectar otra cuenta, **cierra sesión en
MercadoLibre** (o usa otra ventana/perfil) y repite: si no, ML vuelve a conectar la misma.

**Reconectar:** si cambiaste la clave de ML o la cuenta perdió la conexión, aparece como desconectada y no entra
nada de ella hasta que toques **Reconectar**. Mientras esté desconectada sale un aviso rojo arriba de todas las
pantallas con el botón **Reconectar →**. Con Telegram conectado te avisamos apenas pase (ver
[Mis avisos](#13-mis-avisos-telegram)).

**Desconectar:** en Cuentas de MercadoLibre, **Desconectar** deja de traer sus preguntas, mensajes y ventas
(lo guardado se conserva). Se vuelve a conectar con **Reconectar**.

El sistema nunca publica, cambia precios ni borra nada en ML sin que lo pidas.

**Video:** Central de aprendizaje → «Conectar tu cuenta de MercadoLibre».

---

## 5. Preguntas (Automatizaciones → Preguntas)

*Cómo lo pregunta la gente:* responder preguntas, IA, respuesta automática, que responda solo, respuestas rápidas, plantillas, políticas, datos del producto.

Todas las preguntas sin responder de todas tus cuentas, en una sola lista.

**Cómo se usa:**
1. Abre una pregunta: ves la publicación, la pregunta y las preguntas anteriores de ese comprador.
2. Responde escribiendo, con una **respuesta rápida** (botón con un texto guardado; puede llevar **datos que se llenan
   solos**: `{producto}`, `{precio}`, `{precio_bs}` = precio × tasa BCV del día y `{tasa_bcv}`) o con **Proponer con IA**: la
   IA lee la publicación, tus políticas y lo que el sistema aprendió de ese producto y propone una respuesta.
   **No se envía nada sin que la revises.**
   Antes de mostrarla, una segunda revisión busca cada dato de la propuesta (colores, medidas, envío, ubicación,
   garantía) en la publicación y en tus políticas: si algo no está escrito o falta contestar una parte, la propuesta
   sale con **confianza baja** y te dice qué revisar.
4. Envía. La respuesta sale en MercadoLibre a tu nombre.

**Respuestas automáticas con IA (planes Automatizaciones y Completo, y la prueba gratis)**

*Cómo lo pregunta la gente:* que la IA responda sola, activar respuestas automáticas, encender la IA, responder de
noche, mensajes automáticos, cómo configuro la IA.

La IA contesta sola, a toda hora, las preguntas y los mensajes en que está segura. Lo delicado siempre queda escrito
para que tu equipo lo revise y lo mande. Viene **apagada**: la enciendes tú. Para arrancar (unos 10 minutos):
1. Abre **Mi IA** (Preguntas → Configuración → Mi IA, o en Mensajes). Si es la primera vez, toca **«Empezar con lo que
   ya respondo»**: lee tus respuestas y descripciones y te propone cada tema. Si tus fuentes no coinciden, elige
   sola (primero tus respuestas más recientes, luego tus descripciones) y dentro de ese tema te
   deja una línea chica: «Usé X (de tus respuestas). En tus descripciones dice Y». Los temas que llenó el sistema salen
   en **azul («por revisar»)** hasta que pasas por ellos; **no se puede salir** sin revisarlos (te lleva al primero).
   Si falta completar algún tema te avisa cuáles, y puedes «Salir igual y completar después». Revisa cada pantalla y corrige lo que haga
   falta (pago, envío, despacho, tono, lo que siempre responde una persona…). Arriba de cada pantalla están **todos los temas** (✓ = completo, punto naranja = falta): tocas uno y saltas directo; abajo, **← tema anterior** y **tema siguiente →** con su nombre. Al pasar de un tema a otro se guarda solo; **Guardar y salir** vuelve a Mi IA; si te arrepientes de lo que cambiaste en un tema, **Deshacer cambios de este tema** lo deja como estaba. **Hay que completar todos los temas:**
   mientras falte alguno, la respuesta automática no se puede encender (te dice cuáles faltan).
   **Sugerir lo que falta desde mis respuestas** (y «Empezar con lo que ya respondo») se puede usar hasta **3 veces por día**; dice cuántas te quedan.
2. Abajo de los temas están las tarjetas **Preguntas** y **Mensajes** (en computadora, una al lado de la otra; en el
   celular, una debajo de la otra). Cada una muestra si está **Encendida** o **Apagada** y en qué modo.
3. **Probar (opcional y gratis):** toca **Probar con 10 preguntas reales** (o mensajes). Se abre una pantalla aparte:
   la IA responde preguntas que tu equipo ya contestó, sin publicar nada, y ves lado a lado tu respuesta y la de la IA,
   y si habría salido sola. No usa créditos; máximo **2 pruebas por día** en Preguntas y 2 en Mensajes (cuando ya encendiste la respuesta automática de ese módulo, **1 por día**).
   - Marca cada una **Bien** o **Mal**. Si está Mal, elige **qué estuvo mal** y escribe **qué debió decir**, como se lo
     dirías a tu equipo, y toca **Guardar**. **La IA lo aprende:** si es un dato fijo del producto lo guarda en
     **Datos del producto** de esa publicación, y si es una forma de trabajar lo guarda como regla en Mi IA →
     Información extra → «Correcciones de mi equipo». Te muestra qué aprendió.
   - Arriba aparece **«Para mejorar»** con qué arreglar (un tema de Mi IA o la publicación) y un botón para ir directo.
   - A la izquierda (arriba en el celular) quedan las **pruebas anteriores**, con sus marcas y correcciones, para ver
     cómo va mejorando. También se abren con **Pruebas anteriores** en la tarjeta.
4. Toca **Encender respuestas automáticas en Preguntas** (está siempre a la vista cuando está apagada; no hace falta
   probar antes) y acepta el aviso. Haz lo mismo en Mensajes.
- Para apagarla: **Apagar respuestas automáticas…** en la tarjeta de Mi IA. Se apaga al instante.
- **Todo se enciende y se cambia en Mi IA**: encendido, modo y frenos.
- **Mensajes automáticos: Próximamente.** Por ahora la IA responde sola solo en **Preguntas**; en Mi IA la tarjeta de
  Mensajes aparece deshabilitada mientras se afina. En Mensajes sigue funcionando «Proponer con IA».
- **Modo Seguro o Modo Total** (se elige aparte en Preguntas y en Mensajes, una vez encendida):
  - **Modo Seguro** (de fábrica): responde sola solo cuando está segura. Lo dudoso (reclamos, pagos, «no hay», temas
    de «Siempre una persona») te lo deja escrito para que lo revises y lo mandes tú.
    Si la respuesta quedó frenada solo por cómo estaba escrita (decía algo que no está en tus datos, hablaba como
    alguien de afuera, prometía confirmar después o salió vacía), la IA **la corrige sola** y la vuelve a revisar
    entera; si pasa, sale. Cancelaciones, devoluciones y reclamos los contesta siempre una persona. No gasta créditos
    extra.
  - **Modo Total**: responde todo sola, sin dejarte nada para revisar. Solo respeta tu horario y el máximo por
    comprador. Acierta cerca del 94 % con Mi IA completo. En Modo Total no valen **«Siempre una persona»** ni la
    opción **«Dejarla para una persona»** de «Si no sabe algo» (si era la única opción, recomienda verificarlo con un
    técnico).
  - **En los dos modos cada pregunta o mensaje usa 1 crédito**, salga sola o quede escrita para revisar (la IA hace el
    mismo trabajo para decidir; en Modo Seguro te deja la respuesta lista).
- **¿Quién respondió?** En Preguntas (Respondidas) y en las conversaciones de Mensajes, lo que salió solo dice
  **«Respondió la IA»** (o «Respondió la IA (Modo Total)»), en el mismo lugar donde sale el nombre de quien respondió
  de tu equipo.
- **¿La IA respondió mal?** En Preguntas (Respondidas), al lado de «Respondió la IA» toca **✗ Corregir a la IA** (también
  está en Configuración → IA automática de Preguntas y de Mensajes). Se abre una ventana: escribe **cómo la hubieras
  respondido tú** (la respuesta correcta completa) y toca **Guardar**. La IA saca de ahí lo que es de ese producto (queda en
  sus datos guardados) y lo que vale para todas (queda en Mi IA → Información extra → «Correcciones de mi equipo»), y te
  muestra lo que aprendió. Si ya lo tenía anotado, no guarda nada repetido. No pongas precios ni teléfonos: no se guardan.
  La respuesta ya publicada en MercadoLibre no cambia.
- **Frase de escape de la IA**: en el historial marca las preguntas que la IA no se animó a responder y contestó con la
  frase de escape (al pasar el mouse se ve por qué se frenó). También tienen **✗ Corregir a la IA** para enseñarle.
- **N datos guardados** (al lado, o en cada pregunta sin responder) abre una ventana con lo que la IA sabe de esa
  publicación: ahí se editan o borran.
- **Agregar datos antes de que pregunten:** Preguntas → Configuración → Datos de cada producto (también en Mensajes →
  Datos de cada producto) → **+ Agregar datos a un producto**. Buscas la publicación (activas y pausadas, todas tus
  cuentas), la eliges y escribes uno o varios datos fijos (material, medidas, compatibilidad). La IA los usa en Preguntas y Mensajes.
- **Esta publicación solo la responde mi equipo:** casilla en «Datos para la IA» de cada publicación. La IA no responde
  sola en esa publicación (ni en Modo Total ni con la frase de escape): las preguntas quedan en Sin responder con el motivo
  «Esta publicación la responde tu equipo». Se quita desmarcando la casilla. Sirve, por ejemplo, si el precio publicado no es el real.
- Cada respuesta de la IA usa **1 crédito** (las de prueba no). Si se acaban los créditos, deja de responder sola
  hasta que recargues en Mi plan.
- Responde solo lo que llega **después** de encenderla.
- **Siempre pasa a una persona:** reclamos, devoluciones y garantías, pagos y comprobantes, datos personales o de
  envío, cuando la IA diría que no hay, pedidos de otro color o cantidad, montos que no están escritos y los temas que
  pusiste en «Siempre una persona» (esto es en Modo Seguro; en Modo Total salen todas). En Mensajes esos quedan con la respuesta de la IA ya escrita en la conversación
  («Borrador de la IA · Usar»); en Preguntas, en «Sin responder» con la respuesta escrita.
- Al encenderla quedan unos **frenos de fábrica** (los cambias en Mi IA → Frenos): máximo 3 respuestas automáticas por
  comprador en 24 horas, sin horario (responde a cualquier hora) y, en Mensajes, una frase corta («¡Hola! Recibimos tu
  mensaje, en breve te respondemos por aquí.») cuando el mensaje queda para una persona.
- El plan Esencial no la trae: en Mi IA, las tarjetas dicen «vienen con los planes Automatizaciones y Completo».

**Pantalla Respuesta automática con IA** (Preguntas → Configuración): solo la ve la organización de la plataforma
(evaluación interna). Los clientes encienden, eligen el modo y prueban en Mi IA.
- **Apagada:** la IA solo responde cuando tocas «Proponer con IA».
- (Si tienes Mi IA, el encendido y el modo se cambian allí; esta pantalla solo muestra el estado y el historial.)
- **Activa:** solo se puede elegir con todos los temas de Mi IA completos. Se publican solas solo las de confianza alta que pasan todas las revisiones. Nunca sale sola una respuesta
  que diga que no hay, que recomiende otra publicación o con datos que no están en la publicación o tus políticas. El
  resto te queda con la respuesta ya escrita para revisar y enviar.
- Cada pregunta que la IA procesa usa 1 crédito. La pausa de respuestas automáticas también la detiene.
- **Frenos de la IA automática** (en la misma pantalla y en Mi IA; valen también para Mensajes):
  - **Horario:** días y horas en que la IA responde sola (ej. de 19:00 a 08:00). Fuera de ese horario deja la
    respuesta escrita para una persona. Sin horario responde a cualquier hora.
  - **Máximo por comprador:** cuántas respuestas automáticas recibe un mismo comprador en 24 horas (de fábrica 3);
    la siguiente queda para una persona.
  - **Frase de escape (solo Mensajes):** si la IA no manda la respuesta sola, puede mandar una frase corta
    («¡Recibido! En un momento te confirmamos») para que el comprador no quede sin contestar. La conversación sigue
    en «Por atender» con la respuesta de la IA escrita. Una vez por conversación cada 24 horas.
  - **Frase de escape en Preguntas:** viene **escrita de fábrica** («¡Hola! Lo verificamos y te confirmamos en breve
    por aquí.»); la cambias si quieres (o «Volver a la de fábrica»). En **Modo Total** se usa **siempre**: la posventa
    (cancelar, devolver, reclamo: la IA no las responde), lo que llega fuera de horario o si la IA no logró escribir
    nada se contestan con la frase, así **todo tiene respuesta**. En **Modo Seguro** solo si marcas «Usarla también en
    Modo Seguro» (contesta con la frase todo lo que la IA deja para revisar). Ojo: MercadoLibre acepta **una sola
    respuesta** por pregunta, así que queda respondida con la frase; la respuesta de la IA queda escrita para que sigas
    tú. No se usa si frenó el máximo por comprador ni si la publicación está pausada.
- **Mi IA** también pregunta por cambios y devoluciones, ventas al mayor, rebajas, apartados, horario de atención e
  **información extra** por secciones (la IA lee cada sección solo cuando la pregunta trata de eso).
- En **Despacho** hay que decir **cuándo sale el pedido** (el mismo día, al siguiente día hábil o a los N días hábiles
  de confirmado el pago y llenado el formulario). Sin eso el tema queda incompleto: es lo que la IA responde cuando
  preguntan cuánto tarda.
- En **Tono** eliges si la IA habla **como equipo** («tenemos») o **como persona** («tengo»). Nunca habla como alguien
  de afuera («según la descripción…»): si se le escapa, el sistema lo quita solo.
- En **Si no sabe algo**, «verificarlo» ahora significa decir lo que sí sabe y **recomendarle al comprador verificarlo
  con un técnico o en su equipo** (después de publicar no se puede volver a responder, así que no promete «lo
  verificamos»). Ahí mismo eliges si, cuando no tienes lo que piden o no sabe cuál es, **invita a ver tu catálogo**
  (el link a todas tus publicaciones de MercadoLibre; viene en Sí).
- **Disponibilidad:** la IA se guía por la publicación de MercadoLibre (activa y con unidades = disponible), uses o no
  el inventario. Solo lo deja para una persona si piden más unidades de las que tiene la publicación o la variante.
- Si preguntan por un medio de pago que no aceptas (ej. Cashea), dice que no trabajas con ese y nombra los tuyos.
- Si el comprador no pregunta nada («ok, quedo atento», «gracias»), contesta corto y cordial.

**Para que la IA responda mejor:**
- **Mi IA:** lo general de tu negocio (horarios, envíos, formas de pago, garantía, retiro en persona…), tema por
  tema. Se llena una vez y la IA lo usa en todas las respuestas. (La vieja pestaña «Políticas para la IA» ya no existe:
  la reemplazó Mi IA.)
- **Anotar dato del producto:** cuando respondes algo que la IA no sabía (ej. «sí trae cargador»), guárdalo como
  dato de ese producto y la próxima vez lo usa sin gastar créditos de más. **No hace falta hacerlo siempre:** si la IA
  avisó «No encontré: …» y tú publicas tu propia respuesta, la IA saca de ella el dato fijo del producto (material,
  medida, qué incluye…) y lo anota sola en Datos del producto como «aprendido de tu respuesta» (sin descontar
  créditos). También aprende cuando **corriges** lo que propuso la IA con un dato fijo (ej. «sirve para cualquier
  vehículo», «envío gratis solo por TEALCA»). Lo anotado vale también para las otras publicaciones vinculadas al mismo
  producto de tu inventario. Precios, stock o tiempos no se anotan. Si anotó algo mal, bórralo o corrígelo ahí mismo.
- **Lo aprendido de cada producto:** el sistema aprende con tus respuestas qué publicaciones tienen envío gratis y
  cuáles no, para no sugerir la respuesta rápida de envío gratis donde no aplica (gratis). Si tu empresa tiene los
  pesos de MercadoEnvíos cargados (Promociones), esto lo calcula solo con el peso y el precio de hoy (también si es
  solo TEALCA) y la pestaña se llama **Datos de cada producto** (ahí quedan los datos anotados).

**Respuesta sugerida:** cuando una pregunta se parece mucho a otra que ya respondiste, la respuesta aparece ya
escrita; la revisas y la envías (también varias juntas con «Enviar las sugeridas»). La respuesta sugerida **no se
envía sola**: siempre la envía una persona (lo que sale solo es la respuesta automática con IA, si la encendiste).
- Solo aparece si el sistema entiende **toda** la pregunta. Si trae otra cosa («¿disponible? ¿son rojos?», «¿me lo
  envías hoy?»), no aparece ya escrita y queda para que la respondas tú.
- Antes de mostrarla, el sistema revisa que conteste **cada parte** de la pregunta. Si falta una parte y el dato está
  en la publicación (color, material, qué incluye), puede agregar una frase: sale marcada «+ frase agregada por la IA ·
  revísala», no entra en «Enviar las sugeridas» y conviene leerla antes de enviar.
- Esta revisión no gasta tus créditos de IA.
- **Tallas y colores:** si la publicación tiene variantes y preguntan «¿tienes en talla M?» o «¿hay en rojo?», el
  sistema revisa el stock de ESA variante en MercadoLibre (y en tu inventario, si la variante está vinculada). Solo la
  confirma si alcanza para lo que piden; si no hay, no alcanza o no se entiende cuál piden, queda para que respondas tú.
- La IA también tiene en cuenta lo que ese mismo comprador preguntó antes (si te pregunta «¿cuánto tarda?» y después
  «sería a Valencia», entiende que es lo mismo).
- **ZOOM o TEALCA:** en Preguntas y en Mensajes la IA responde según el envío gratis de ESE producto (lo que ves al
  lado: «Gratis ZOOM y TEALCA», «Gratis SOLO TEALCA» o sin envío gratis), no según tus políticas generales. Si es solo
  TEALCA y preguntan por ZOOM, dice que el envío gratis es por TEALCA y por ZOOM sería cobro a destino. Sin peso
  cargado, no lo afirma y queda para que respondas tú.

**Otras acciones:** reponer stock desde la pregunta («¿tienes disponible?» con la publicación agotada) y eliminar
preguntas (spam, ofensivas).

**Problemas comunes:**
- *No me aparecen preguntas:* revisa que la cuenta esté conectada (Cuentas de MercadoLibre).
- *«No tienes créditos»:* se acabaron los de la prueba o los de tu plan; puedes responder a mano o con respuestas rápidas (gratis), o
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
- **Por atender tiene tres chips:** **Responder** (lo de siempre: mensajes del comprador sin contestar), **Pedir pago**
  y **Escribirle**. «Pedir pago» = ventas de ML sin ninguna señal de pago dentro de los días de plazo que pusiste en
  Calificaciones (no concretada). Una venta sale de la lista si tiene alguna de estas: el mensaje automático de ML «El
  número de guía para tu envío es…» (llega cuando el comprador llena el formulario de MercadoEnvíos), su pago en Pagos
  ME, la venta registrada en Ventas, su guía en Despachos o «Ya pagó» en Recordatorios. «Escribirle» = de esas, las
  que llevan más de 12 h (o más de 24 h, botones «+12 h» / «+24 h») sin mensajes del comprador ni del equipo; los
  recordatorios y demás mensajes automáticos no cuentan. Cada fila dice si **nunca escribió** o **escribió y no pagó**,
  cuándo vence (en rojo si quedan menos de 12 h), cuánto lleva sin mensajes, el día del plazo y los recordatorios
  enviados; las dos listas van primero la que vence antes. Si el mismo comprador tiene varias compras sin pagar sale en
  una sola fila con «N compras» y un número por compra para abrir cada una. Un clic abre la conversación. La **✕** de
  arriba a la derecha quita la venta
  del seguimiento cuando ya pagó, no va a pagar o no quieres seguirla (tampoco se le mandan más recordatorios); se puede
  **Deshacer** unos segundos, o volver a activarla en Recordatorios. Con Pagos ME, si todavía no trajiste los pagos de hoy, arriba sale «Falta traer los pagos de hoy →». Pasado el plazo, la
  venta sigue en Calificaciones → Por definir. **Atendidas** tiene el buscador.
- Escribe la respuesta. Puedes **adjuntar fotos (JPG/PNG) o PDF**, también pegándolas con **Ctrl+V**. **Ctrl+Enter**
  envía.
- **Respuestas rápidas de mensajes:** botones con textos guardados; un clic pone el texto y lo puedes retocar.
  Pueden llevar datos que se llenan solos: `{nombre}` (primer nombre del comprador), `{producto}`, `{precio}`,
  `{precio_bs}` (precio × tasa BCV del día) y `{tasa_bcv}`. Si falta un dato (ej. la venta tiene varios productos),
  queda escrito entre llaves y no se puede enviar hasta que lo escribas a mano.
  Si no tienes ninguna, el sistema ofrece unos ejemplos para empezar.
- **Respuestas automáticas con IA:** se encienden y se prueban en **Mi IA** (ver «Respuestas automáticas con IA» en
  Preguntas). Con la automática encendida, los mensajes que la IA no manda sola quedan con su respuesta escrita en la
  conversación: tocas **Usar**, la revisas y la envías.
- **Proponer con IA:** lee la conversación, la nota y la venta y propone una respuesta (no envía nada). Si la guía
  no salió de Despachos, usa la de MercadoEnvíos. Si preguntan algo que depende de tu equipo (cuándo sale el paquete,
  desde dónde se envía), no lo inventa: propone «lo verificamos con el equipo y te avisamos por aquí».
- **Nota de la venta:** una nota interna que se guarda en MercadoLibre; **el comprador no la ve** (ej. «cambia a
  talla L», «garantía, espera fotos»). Va en una sola línea (sale corrida en la guía): **Enter la guarda**. En Pagos ME,
  «📝 Nota» abre directo para escribir y se cierra sola al guardar.
- **Buscar:** por comprador, nº de venta, producto o algo que se habló.

**Pestañas extra:**
- **Mensaje al comprador nuevo:** manda un mensaje de bienvenida a cada venta nueva (1 o 2 minutos después),
  una sola vez por venta, solo a ventas que entren desde que lo prendes. No se manda si la venta se canceló o si el
  comprador ya te escribió. `{nombre}` = primer nombre del comprador. MercadoLibre corta los mensajes de más de
  **350 caracteres** sin avisar. Lo configura un administrador.
- **Recordatorios de pago:** le recuerda el pago a quien compró y no ha concretado (1 vez al día a las 10:00, o 2
  veces: 10:00 y 17:00). Puedes poner otro texto para el último aviso. Si ya pagó, toca **Ya pagó, no recordar**.
  Los recordatorios salen cuando tocas **Traer pagos y guías** (Pagos ME), desde 4 horas antes de cada turno: así no se
  le recuerda a quien ya pagó. Si ese turno no traes los pagos, no se manda nada. Nada se trae solo.
  Se saltan las ventas canceladas y las conversaciones abiertas: el comprador te escribió y todavía no le contestas, o
  te escribió hace menos de 24 h. Si le contestaste y no volvió a escribir en 24 h, se le sigue recordando.
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

## 7b. Publicaciones (Inventario → Publicaciones)

*Cómo lo pregunta la gente:* editar publicación, cambiar precio en ML, cambiar fotos, características, ficha técnica, descripción, variantes, pausar publicación, cambiar precios a muchas, subir precios en lote, pie de descripción, encabezado, condiciones de compra, plantilla de descripción, cambiar la info de abajo de la descripción en todas.

Todo lo de tus publicaciones de MercadoLibre en un solo menú, con pestañas (cada una aparece si tu empresa y tu
usuario la tienen):
- **Editar** (en prueba, solo algunas empresas; permiso **Publicaciones (editar en MercadoLibre)**): ver abajo.
- **Vincular:** unir cada publicación (o variante) con su producto.
- **Stock:** el stock que muestra cada cuenta de ML contra tu inventario.
- **Promociones** (Venezuela): campañas de ML y hasta dónde puede bajar el precio sin perder el envío gratis.
  Campañas propias: **Editar** cambia la fecha de fin (máx. 31 días desde que empezó; una vencida ya no se puede editar).
  **Pausar** les quita el descuento a todas sus publicaciones sin borrar la campaña y recuerda cuáles eran (va a la cola: se puede seguir trabajando o pausar otra; avance en Publicaciones → Tareas); **Reanudar**
  las vuelve a poner con el mismo %. **Renovar** (vencida o por vencer en 3 días) crea una campaña nueva desde hoy con
  el mismo nombre y % y propone las mismas publicaciones. **Borrar campaña** la quita para siempre (primero les quita el
  descuento). Por Telegram avisa 3 días antes de que venza una campaña propia.

**Editar** sirve para cambiar tus publicaciones **sin entrar a ML**, con una pantalla parecida a la de ML.

- **Buscar:** por título, SKU o número (MLV…), por cuenta y activas/pausadas. Toca una para abrirla.
- **↻ Actualizar desde ML** (arriba a la derecha): trae ya las publicaciones nuevas o recién reactivadas. Sin tocarlo,
  la lista se refresca sola cada 6 horas, por eso una recién publicada puede no aparecer al momento.
- La pantalla trae lo que hay **ahora mismo** en MercadoLibre:
  - **Título:** solo se puede cambiar si la publicación **no tiene ventas** (regla de MercadoLibre).
  - **Precio, stock y estado** (activa / pausada). Debajo del precio ves la comisión de ML estimada (la de Ajustes) y
    lo que te queda antes del envío y del costo.
  - **Variantes:** el nombre de cada variante (ej. color «Rojo»), su stock y **sus fotos**: cada variante tiene las
    suyas (subir, ordenar, quitar, o traer una de otra variante con «De otra variante»). Hasta 10 por variante y 12
    distintas entre todas (lo que permite ML); las de la publicación se arman solas. No se crean ni se borran
    variantes desde aquí. Con variantes, el precio es el mismo para todas.
  - **Fotos** (sin variantes): cambiar el orden (la primera es la portada), quitar y **agregar** (JPG, PNG o WEBP,
    hasta 12).
  - **Características principales** (las que pide ML, * = obligatoria) y **secundarias** («Ver todas» para completar
    las vacías). Si vacías una que tenía valor, queda como «No aplica».
  - **Descripción en 4 partes:** **encabezado** (arriba), **descripción del producto** (lo de esta publicación),
    **condiciones de compra** (envíos, montos mínimos, pagos, garantía, cambios…) y **pie** (abajo: ubicación,
    horario…). Encabezado, condiciones y pie son **textos guardados** que se eligen de una lista; al lado están
    **Editar texto** (lo abre en Textos guardados, en otra pestaña) y **Quitar** (lo saca de esta publicación); a ML
    va todo junto, en ese orden. **Vista previa** muestra cómo queda en ML. Si hay caracteres que ML no
    acepta (emojis, símbolos raros) avisa y **Quitarlos** los saca; se permiten letras, números y signos básicos
    (# * - + / . , : ;). También avisa si parece que hay un teléfono, correo o link. **Pasar el final a condiciones o pie…** (o el
    inicio a encabezado) convierte ese pedazo en un texto guardado para usarlo en otras publicaciones.
- **Revisar y guardar:** antes de mandar ves cada cambio **antes → después**. Solo se manda lo que cambiaste.
  Si MercadoLibre rechaza algo, te dice qué y por qué; lo demás queda guardado.
- **Cambios hechos desde el sistema:** cada cambio queda anotado (quién, cuándo, qué y si ML lo aceptó).

**Cambiar muchas a la vez:** en la lista marca las que quieras (o «Elegir esta página» y después «Elegir las N de
esta búsqueda», hasta 3.000; activas y pausadas). Abajo aparece la barra:
- **Encabezado, condiciones o pie:** elegir qué parte y qué texto guardado poner (o **quitarlo**) y tocar Aplicar. El
  sistema decide solo en cada publicación: si ya tiene esa parte (aunque sea una versión vieja escrita a mano y un poco
  distinta), la **reemplaza**; si no tiene, la **agrega**. Nunca queda repetida. Al terminar muestra el resultado:
  cuántas se actualizaron, cuántas ya lo tenían y cuáles no se pudieron (con el motivo en «Ver el detalle»).
- **Cambiar precios:** subir o bajar un %, sumar o restar un monto o poner un precio fijo, con redondeo (entero o
  terminado en ,90). Muestra la tabla **antes → después** de cada una y recién ahí se confirma.
- Se manda a ML **en segundo plano** (hasta unas 60 por minuto) aunque cierres la pantalla; abajo a la derecha sale el avance. Lo que salió bien, lo
  saltado y los errores se ven en la pestaña **Tareas** (Inventario → Publicaciones, al lado de Promociones); ahí también se puede cancelar lo
  que falta.

**Textos de descripción** (link arriba de la lista): los encabezados, condiciones de compra y pies guardados, cada uno **para una cuenta o
para todas**. Al **editar** uno que ya usan publicaciones, se puede marcar «Actualizarlo también en MercadoLibre» y
se cambia en todas las que lo usan (activas y pausadas). **Detectar textos repetidos:** «Leer descripciones» de una
cuenta (solo lee, tarda unos minutos) y «Buscar repetidos» muestra los finales (o inicios) que ya están iguales en
muchas publicaciones, para guardarlos con un clic. Al guardar un texto, las descripciones que ya lo tienen igual
quedan separadas solas. Borrar un texto no cambia nada en ML.

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

**Una traída a la vez:** mientras corre una traída de MercadoEnvíos (pedida desde Pagos ME, Por confirmar, una venta o
Promociones, por ti o por otra persona), los botones «Traer» quedan en «Buscando…» aunque recargues la página, y no se
pide otra. Abajo a la derecha, el aviso de tareas muestra cada cuenta (órdenes, y pesos ✓ o ⚠ si no se pudieron leer), o
«Esperando la PC» si el programa no está conectado. Si en Promociones pides pesos mientras corre una de pagos, espera a
que termine y vuelve a tocar «Traer ME y ML».

**Uso diario:** toca **Traer pagos y guías** y espera el aviso verde. Chrome se abre solo, trabaja y se cierra: no
lo toques. Luego verifica cada pago (Pago correcto / inválido). **Despachos no imprime guías con el pago sin
verificar.**

**En cada venta de la lista** ves la foto del producto y dos botones: **💬 Conversación** se marca en celeste si el
comprador escribió algo después de comprar (al pasar el mouse ves sus últimos mensajes); en blanco, no escribió nada
y la venta es tal cual. **📝 Nota** se marca en amarillo si la venta tiene nota. Las notas escritas directo en
MercadoLibre se releen solas al abrir la lista (unos segundos después se marcan). En la ventanita de la nota puedes
**Borrar**, **Cancelar** o **Guardar en ML**; borrarla también la quita de MercadoLibre.

**Guía ya reportada sin pago en el sistema** (por ejemplo, subiste la guía a mano con el PDF): la venta ya está
terminada y sale sola de la lista (no queda como «No ha pagado» ni pasa a Vencidas). En Calificaciones cuenta como
concretada. No hace falta tocar «No se concretó».

**Historial de pagos (Pagados / Inválidos / Todos):** una línea por pago con la foto del producto, el nombre del
comprador (y su @apodo), el producto, el monto y el estado. Arriba hay un **buscador**: escribe el nombre, el
producto, el nº de venta, la referencia o el monto. **Toca un pago** para abrir su detalle en una ventanita (banco,
referencia, monto vs. orden, envío y guía, en qué va en el sistema y el comprobante) y desde ahí Verificar, marcar
Inválido o volver a sin verificar, sin salir de la sección.

**Montos:** la columna **Pagado** es lo que el comprador **declaró** en MercadoEnvíos; al lado, **vs. orden** lo compara
con el total de la orden (Coincide / Pagó de más / Incluye embalaje / Pagó de menos). Mientras el pago no se cruce con
el banco dice **«Coincide según ME»**: el monto real que llegó solo lo confirma **Comprobar con el banco**. Si la **misma referencia de pago** aparece en otra
venta (últimos 90 días), debajo de la referencia sale **⚠️ También en …** con esas ventas: puede ser un pago de dos
compras juntas (revisa que el monto alcance para todas) o el mismo comprobante usado dos veces. Solo avisa, no bloquea.

**Comprobar con el banco:** sube los estados de cuenta de tu banco tal como los descarga el banco, en Excel (.xls o
.xlsx; también .csv, no PDF). Bancos que se leen: Bancamiga, Banesco, Mercantil, BBVA Provincial y Banco Plaza; el
Banco de Venezuela, pegando sus movimientos (ver abajo). El archivo se lee en tu navegador y no se sube a ningún lado;
queda recordado en ese navegador hasta el día siguiente. No usa IA. El sistema
cruza referencia, monto y fecha con los pagos: los que coinciden quedan como «Pago correcto». Muestra también los
créditos del banco que no son de ninguna venta.
**Banco de Venezuela (BDV):** no deja descargar el estado de cuenta. En BDV en línea entra a «Consulta de
movimientos», pon 100 registros por página, selecciona con el mouse desde la primera fecha hasta el último saldo y
copia (Ctrl+C); en el comprobador haz clic en el recuadro «Banco de Venezuela» y pega (Ctrl+V). Se lee solo y dice
cuántos movimientos leyó; si algo quedó cortado al copiar, se ignora y avisa. Se pueden pegar varias páginas (no se
repiten). Ahí mismo, en «¿Cómo copio del BDV?», hay un ejemplo con imagen. El monto que cuenta es el que llegó al
banco, no el que escribió el comprador.

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
y arma el **manifiesto** al final del día. Cuando un producto va **2 o más unidades**, la cantidad sale en un círculo
negro y escrita en palabra y negrita («❷ DOS - …», «❸ TRES - …») para no equivocarse al armar el paquete; con 1
unidad queda normal («1 - …»).

**Cómo se usa:**
1. Las guías entran solas desde Pagos ME, o **arrastra los PDFs** de MercadoEnvíos (o pégalos con Ctrl+V, o haz
   clic para elegirlos). Forman un **lote**.
2. Revisa el lote: cada etiqueta muestra la venta, los productos y la nota. Puedes escribir o corregir la nota
   del paquete: se guarda **también en MercadoLibre** (la misma nota en Despachos, Pagos ME, Mensajes y ML; hasta
   300 caracteres). Si MercadoLibre no la acepta en ese momento, queda solo en la etiqueta (✎) y avisa. Dejarla
   vacía la quita solo de la etiqueta (en ML no se borra). También puedes elegir si en la etiqueta se imprime el título y/o la nota.
3. Genera el PDF y **imprime a «Tamaño real» (100%)**, no «Ajustar a la página».
4. Al final del día: **Cerrar jornada → Manifiesto**. Se genera un manifiesto por transportista (ZOOM / TEALCA) con
   todos los envíos de la jornada. La jornada se abre sola con el primer lote.

**Guía ya impresa en otro lote:** si subes de nuevo un PDF que ya se imprimió (por ejemplo, lo bajaste otra vez de
MercadoEnvíos), entra al lote marcada en rojo **«Ya impresa»** y dice en qué lote salió: **no se imprime dos veces**. Al
subirla también sale un aviso. Puedes tocar **Quitar del lote** para sacarla de la lista, o **Reimprimir igual** si de
verdad la necesitas otra vez (se imprimió mal, se dañó la etiqueta). «Quitar del lote» aparece en todas las guías que
no se imprimen (ya impresa, repetida, con error).

**Apartar un envío:** si una guía no debe salir todavía (el cliente pidió para el lunes, pagó mal…), apártala.
En el panel sale la **lista de los envíos sin reportar** de los últimos 15 días (primero los que se reportan en la
próxima tanda) para elegirlos a dedo; arriba puedes filtrar por venta, guía, comprador o producto (palabras en
cualquier orden). Al elegir uno hay motivos de un toque («Pidió para otro día», «Falta el pago»…); para «Todavía no
sale» el motivo es opcional y para «No se enviará» es obligatorio:
- **En espera:** no sale en ningún manifiesto ni se le reporta la guía hasta que toques «Sale en el próximo
  manifiesto».
- **Cancelar envío** («No se enviará» al apartar, o «Ya no se envía» en un envío en espera): nunca sale ni se le manda
  la guía. No se puede deshacer. Antes de confirmar el sistema pregunta **¿La venta se concretó?**:
  - **No se concretó** (reembolso, anulada, desistió): en Calificaciones sale como no concretada (aunque tenga pago
    registrado) y la automática la califica así.
  - **Sí se concretó** (la retiró alguien, cambió el método de envío…): en Calificaciones sale como concretada.
  - Si usas Inventario y la venta **ya está registrada en Ventas**, pregunta además: **Anular la venta** (se borra de
    Ventas y los productos vuelven al inventario) o **Mantener la venta registrada** (queda igual, el stock no cambia).
    Con factura no se puede anular desde ahí.
- **Ya la envié:** el paquete ya salió por fuera de Despachos. Sale de la jornada y del manifiesto, y la venta **no**
  se cancela. No uses «Cancelar envío» para esto.
- Si la etiqueta ya estaba impresa, separa el paquete físico.

**Primer día en Despachos:** el sistema trae también las guías pagadas de días anteriores, y muchas ya las enviaste
por tu cuenta. Arriba sale el aviso «Es tu primer día en Despachos» → **¿Cuáles ya enviaste?**: marca esas (o
«Marcar las de días anteriores») y toca **Ya las envié**. Salen de la jornada y del manifiesto sin cancelar la venta.
Si ya imprimiste el PDF, esas etiquetas simplemente no se usan. Desde el segundo día solo llegan las nuevas.

**Si despachas algunas órdenes con otro programa:** no hace falta sacarlas del lote. Cuando MercadoEnvíos muestra la
orden como completada, el sistema la deja sin tildar con la nota «Despachada por otro lado» y no la imprime. Mejor no
descartar lotes para limpiar; si igual descartas uno, sus guías de Pagos ME vuelven a entrar al marcar «Pago correcto».

**Guías Tealca:** TEALCA cambia la guía en la oficina; escribe la guía final de cada envío en «Guías Tealca» para
que el Reportador se la mande al comprador. Si ya le pasaste la guía al comprador por fuera (p. ej. la foto de la guía
real), toca **Ya avisé** en esa fila (o marca varias con las casillas y toca **Ya avisé (N)**): sale de la lista y no
se reporta. Queda en Reportador → Historial como «Avisada por fuera», con **Deshacer** por si fue un error.

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
- **No concretada:** cancelada en MercadoLibre, marcada «No se concretó» (en Por confirmar o al cancelar el envío en
  Despachos, aunque tenga pago), o nunca entró al sistema ni a Despachos.
- **Revisar:** el sistema no puede saberlo (ej. guía impresa pero no reportada en 10 días): decide tú. Con
  **Pagos ME**: si pasó el plazo sin pago pero **no tocaste «Traer pagos y guías»** después, no se sabe si pagó y queda
  en Revisar (nunca se califica sola); al traer los pagos se aclara sola. Busca los pagos antes de calificar.
- **Por definir:** todavía no se sabe. Cada venta dice qué falta: «Sin pago todavía», «Falta traer pagos», «Pagó ·
  falta la guía» o «Falta reportar la guía».

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
- Promociones de MercadoLibre: campaña nueva, campañas por cerrar y tus campañas propias que vencen en 3 días.
- **Resumen de la mañana** y **cierre del día** con lo que quedó pendiente.
- Los **lunes**, el resumen de la mañana trae además **Tu semana** (en prueba, solo algunas empresas): ventas,
  preguntas, tiempo de respuesta y calificaciones de los últimos 7 días contra los 7 anteriores, y el termómetro de
  cada cuenta.
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
  Si todavía no tienes productos vinculados con MercadoLibre, arriba sale **«Empieza tu inventario desde
  MercadoLibre»** con el botón para conectar tu cuenta o crear los productos desde tus publicaciones (la ✕ lo cierra).
- **Fotos de los productos:** cada producto muestra su foto en Productos, Inventario, Compras, Importaciones y Ventas
  (al tocarla se ve grande). Sale sola de la publicación de ML vinculada (si es una variante, la foto de ese color o
  modelo; si está en varias publicaciones, la activa con más stock). En la ficha del producto: **Cambiar foto** (o
  **Subir foto**) pone una tuya, y **Usar la de MercadoLibre** vuelve a la de ML. Sin foto: cuadro gris «Sin foto».
  Las hojas impresas (recepción y conteo) no llevan fotos.
- **Productos:** catálogo, precios y margen neto de cada producto. **Importar desde ML** (pestaña de Publicaciones; en Productos queda un enlace chico) crea productos a partir de
  tus publicaciones (cada una, o cada color/modelo, queda vinculada). Clic en una fila abre la ficha; Editar en el pie.
- **Catálogo PDF** (Productos → botón Catálogo PDF; en prueba, solo algunas empresas): elige productos (buscar,
  «Solo con stock», «Solo con foto»), sube tu **logo**, pon el nombre, una línea debajo y un texto al final
  (contacto, condiciones), **con o sin precio** y cuántos por fila. **Guardar PDF** abre la impresión: elige «Guardar
  como PDF» y lo mandas por WhatsApp. La foto sale de la publicación de ML vinculada al producto. «Recordar estos
  datos» los deja para la próxima vez.
- **Publicaciones** (menú propio, con pestañas Editar · Vincular · Importar desde ML · Stock · Promociones · MercadoEnvíos (Venezuela) · Tareas; ver [Publicaciones](#7b-publicaciones-inventario--publicaciones)):
- **Vincular** (Publicaciones → Vincular): une cada publicación (o cada variante) con su producto, para que las ventas de ML descuenten el
  producto correcto. Todo es manual: el sistema sugiere y tú confirmas con un clic.
  **Publicaciones nuevas:** al abrir Vincular, el sistema busca solo las publicaciones que creaste en ML (como mucho
  cada 5 minutos por cuenta). Las de los últimos 15 días sin producto salen en un aviso azul **«N publicaciones nuevas
  sin producto»** (también en Productos) y en el filtro **Nuevas**: elige **Es este producto** o **Crear producto nuevo**.
  **Revisar con fotos** (filtro de Vincular): cada producto con las fotos de todas sus publicaciones vinculadas; si una
  no corresponde, **Corregir** abre esa publicación para cambiar el vínculo. La foto del producto en todo el sistema
  sale de estos vínculos: al corregir aquí se arregla sola en todos lados (no hay que actualizar nada).
- **Stock en ML** (Publicaciones → Stock): cada producto con todas sus publicaciones; iguala el stock y reactiva las pausadas en todas tus
  cuentas de una vez. Aquí se marca si una publicación es pack/combo («trae N u.»).
- **Ventas:** órdenes de MercadoLibre y ventas locales. Al registrar una venta se descuenta el inventario.
  **Por confirmar** y la lista de **Pagos ME** son la misma lista: con Inventario, en las dos se verifica el pago y se
  toca **Registrar venta** (no está «Ya la despaché por fuera», porque no descontaría el stock).
  Abajo de la lista: **Vencidas** = ventas de más de N días (el plazo de «no concretada» de Calificaciones) sin pago y
  **todavía sin calificar**: Calificaciones las sugiere como no concretadas; se ven hasta los 8 días de la compra y las
  ya calificadas salen solas. **Calificadas como concretadas sin venta registrada** (aviso amarillo, con Inventario):
  en ML quedaron concretadas pero aquí no hay venta ni pago; si se vendió, regístrala para descontar el inventario.
  Si ya la registraron como venta **LOCAL** (cobro destino), toca **«La registré como venta local»** y elige cuál: queda
  enlazada y sale del aviso. Arriba hay un **buscador** (cliente, producto, código o nº LOCAL; las palabras en cualquier
  orden y sin acentos, busca en los últimos 6 meses); sin buscar muestra las de 20 días alrededor de la venta. Mejor: registra esas ventas desde Por confirmar, con
  el número de MercadoLibre, no como LOCAL (la LOCAL no cuenta la comisión de ML).
  **No se concretaron** = las marcadas a mano «No se concretó» (se ven 30 días para ver quién y deshacer).
- **Presupuestos** (Ventas → ícono de hoja junto a las fechas; en prueba, solo algunas empresas): cotizaciones para un cliente.
  **+ Nuevo presupuesto:** cliente (cédula/RIF y teléfono opcionales), productos del inventario (el precio se carga
  solo y se puede cambiar) o **ítems libres** (servicio, envío), moneda (US$, Bs o pesos), descuento % y cuántos días
  vale. **Guardar y ver** muestra la hoja con tu logo; **Guardar PDF** abre la impresión (elige «Guardar como PDF»)
  para mandarlo por WhatsApp. **Datos del negocio:** logo, nombre, RIF/dirección/teléfono y condiciones (pago,
  envíos, garantía), salen en todos. Se marca **Enviado** o **Rechazado**; si el cliente acepta, **Aceptado → pasar a
  venta** crea una venta LOCAL en Borrador con esos productos (los ítems libres van en la nota) y sigue como cualquier
  venta. Uno pasado a venta ya no se edita ni se borra.- **Prender o apagar el Inventario:** no se pierde nada (pagos, guías, despachos y calificaciones siguen igual). Al
  prenderlo, Por confirmar solo pide registrar las ventas **desde ese momento**; las anteriores quedan como estaban en
  Pagos ME. Si se apagó y se volvió a prender, en Inventario sale un aviso: lo vendido mientras estuvo apagado no se
  descontó, conviene hacer un conteo (hoja de conteo) y cargar las diferencias como ajuste.
- **Inventario:** stock actual de cada producto y sus movimientos. Ajuste de stock: si contaste y está mal, se guarda
  como ajuste.
- **Compras:** «Entró mercancía» (en un paso: carga el inventario), o por etapas si la empresa lo usa.
- **Promociones:** campañas de MercadoLibre, qué publicaciones pueden entrar y hasta dónde bajar el precio sin
  perder el envío gratis. **Traer ME y ML** trae precios y campañas de MercadoLibre y los pesos del portal de
  MercadoEnvíos (con la PC de Pagos ME prendida, 1 a 3 minutos); al terminar sale un aviso verde con cuántas
  publicaciones cambiaron de peso y la página se actualiza sola, no hace falta recargar.
  En una campaña que **todavía no empezó** (ej. Black Friday del 16/11) puedes agregar publicaciones desde ya: quedan
  **programadas** y el precio se activa solo el día que empieza.
  **Agregar a una campaña ya no necesita la ventana abierta:** al tocar «Agregar N a la campaña» quedan en la cola y
  el sistema las manda solo a MercadoLibre (unas 60 por minuto, repartidas entre las cuentas que estén enviando cosas a
  la vez). Puedes cerrar la ventana y seguir trabajando.
  **Aviso de tareas (abajo a la derecha, en todas las pantallas):** mientras el sistema manda cosas a MercadoLibre sale
  una pastilla chica «Procesando tareas (N)». Al tocarla se abre con el avance de cada una («45 de 120»); al tocarla
  otra vez se achica. Cuando termina cambia a «✓ Tareas terminadas» (o «con errores»): abierta muestra cuántas quedaron
  y **Ver cómo quedaron** lleva a **Publicaciones → pestaña Tareas** (cada publicación con su resultado y el
  motivo si falló; ahí también se cancela lo que falta). La ✕ quita el aviso.
  Algunas campañas **de MercadoLibre** (hoy Black Friday) traen un precio **sugerido por ML distinto para cada
  producto** (su «Nueva propuesta»): la tarjeta lo marca con «Precio sugerido por ML». Al agregar, cada publicación entra
  con su precio sugerido (la columna «Nuevo» dice «−18% · sugerido ML»). Si con el sugerido una pierde el envío
  gratis, sale como «Pierde envío gratis» y no se manda. Para usar un % igual para todas toca «Usar mi propio %»
  (10% por defecto, lo subes tú). Las demás campañas de ML no traen sugerido (ML solo da el precio mínimo que acepta):
  ahí se usa tu %. Si pones menos de lo que pide ML, salen marcadas «ML pide al menos X%» y no se mandan.
- **Reportes:** por período (ventas, compras, más vendidos) o del estado actual del inventario; hoja de conteo físico.
- **Reportes → Resumen** (en prueba, solo algunas empresas; también con el botón **Métricas** del Inicio): todo junto
  para **7, 30, 90 días o 1 año** contra el período anterior del mismo largo: lo vendido, cantidad de ventas y
  unidades, ticket promedio y **ganancia** (después de costo y comisión de ML; solo con el permiso de costos), un
  gráfico día a día contra el período anterior, ventas **por cuenta de MercadoLibre**, **atención** (preguntas,
  tiempo de respuesta, cuántas respondió sola la IA, ventas por pregunta), **calificaciones** recibidas (positivas,
  neutrales, negativas, contradictorias), los **más vendidos** y **los que cayeron** (vendían y ahora venden 40% menos
  o más). Cada bloque tiene un enlace a su reporte de detalle. Las ventas de ML se guardan unos 4 meses: con 1 año la
  comparación por cuenta queda incompleta (lo avisa).
- **Ajustes:** tasa del dólar, costos de MercadoLibre (comisión, envío) y otras configuraciones del administrador.

<!-- VERIFICAR con el dueño: el detalle de Inventario simple de los clientes se completará cuando se graben sus videos -->


**Reportes → Atención ML** (en prueba, solo algunas empresas; necesita ver Preguntas): los últimos **7, 30 o 90 días**
contra el período anterior del mismo largo: preguntas recibidas; % respondido (cuántas sola la IA y cuántas desde la
app o la web de ML); tiempo de respuesta (la mitad se respondió en menos de ese tiempo, y el % en menos de 1 hora);
ventas de ML no canceladas y preguntas por venta. Flecha verde = mejoró, roja = empeoró (en el tiempo, bajar es lo bueno).
---

## 16. Central de aprendizaje y Novedades

*Cómo lo pregunta la gente:* videos, tutoriales, cómo se usa, qué hay de nuevo.

- **Central de aprendizaje** (menú Aprendizaje): videos cortos paso a paso; guarda por dónde vas en cada uno. Los videos nuevos o con versión nueva muestran «Nuevo» durante 14 días.
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
- **No publica ni cambia precios solo.** Solo cambia stock o reactiva cuando tú lo pides, y en **Publicaciones**
  (si tu empresa lo tiene) edita lo que tú cambies y confirmes. No crea publicaciones nuevas.
- **No cambia el título de una publicación con ventas:** MercadoLibre no lo permite.
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
