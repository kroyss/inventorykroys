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

**Cambiar de espacio** (21-11-2026): junto al logo, un interruptor de dos partes **Inventario | Automatiza** (solo si la
empresa tiene los dos). El espacio donde estás va marcado con su nombre; el otro, con su ícono. Si Automatiza tiene
algo **urgente** (preguntas, mensajes o calificaciones negativas) lleva un **punto rojo**; lo que puede esperar (guías,
despachos, por calificar) no se marca aquí: tiene su número adentro, en cada menú. Un clic cambia; al pasar el mouse
dice cuál es y, si hay algo urgente, qué («Automatiza: 2 preguntas, 1 mensaje»). En el celular se ven solo los dos íconos (el
marcado es donde estás). El **Radar** se abre desde el menú de tu cuenta (arriba a la derecha): **Radar ↗**.

**Inicio de Automatizaciones** (el primer botón del menú de Automatizaciones):
- **Primeros pasos** (20-11-2026; arriba, solo para quien conecta las cuentas de ML): una lista corta que se marca sola.
  Lo único **necesario** es **Conectar tu cuenta de MercadoLibre** (sin eso no se traen preguntas, mensajes ni ventas);
  lo demás es **opcional** (se puede trabajar a mano solo con la cuenta conectada): **Completar Mi IA** (dice cuántos
  temas faltan), **Prender las respuestas automáticas** (Modo Seguro o Total) y **Recibir avisos por Telegram**. Se ve
  **un paso a la vez** («Paso 2 de 4», empieza en el primero pendiente): las flechas **‹ ›** (o los puntos de la barra)
  pasan al anterior o al siguiente, así se salta un opcional. Cada paso tiene su botón y un librito 📖 que abre su
  parte del manual. **Comprendo, ocultar** la quita para toda la
  empresa y no vuelve a salir (sin ML conectado no se puede ocultar). Con todo hecho, se va sola.
- **Pendiente ahora**: lo que espera hoy (preguntas sin responder, mensajes sin leer, etc.) y abajo todas las
  herramientas agrupadas. En la tarjeta **Preguntas con IA** sale una línea chica con **cómo te fue en 7 días**:
  cuántas respondiste, el tiempo **típico** de respuesta (la mitad se respondió en menos de eso; «< 1 min» si fue casi al
  instante; ↓ verde si fue más rápido que la semana anterior, ↑ ámbar si más lento) y qué % respondió la IA sola. Si no hubo preguntas, no sale.

**Avisos de tu cuenta** (20-11-2026, arriba de todas las pantallas): el vencimiento de la prueba o del plan, el pago en
revisión, una cuenta de ML desconectada, los créditos de IA bajos o agotados y Radar PRO salen **juntos en un solo
recuadro**: se ve el más importante con su botón y debajo **«Ver N avisos más»** despliega el resto. Los **rojos**
(cuenta vencida o cortada, ML desconectada, créditos agotados, vence hoy o mañana) **siempre se ven**. Cada aviso sale
en las mismas condiciones de siempre. Las **ofertas** (la prueba de Inventario, Radar PRO) comparten un mismo lugar y
**rotan** cada pocos segundos, con un fundido (se detienen al pasar el mouse); en el celular sale una distinta en cada
visita. Si hay un aviso de tu cuenta a la vista, las ofertas quedan en «Ver más»: siempre ves **una sola franja**.

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


## 1b. Actualizar (botón de arriba, junto a Novedades)

Casi todo se actualiza solo (ventas y preguntas cada minuto, publicaciones y stock cada hora, tasa 3 veces al día).
Para traer algo **ya**, toca **↻ Actualizar** arriba, junto a Novedades (también en el teléfono). El puntito dice cómo
está: **verde** todo al día, **amarillo** algo viejo. Abre un panel con cada cosa y cuándo se actualizó:

- Las líneas: **Ventas** · **Preguntas y mensajes** · **Publicaciones y stock** (Mis publicaciones, Stock, Stock vs
  inventario, Importar) · **Promociones** · **Pagos, guías y pesos** (lo trae el programa de Pagos ME en tu PC, 1 a 3 min).
- **Actualizar todo** trae solo lo que no está al día (Promociones, que es lo más pesado, entra si tiene más de 6 h).
- Cada línea tiene su **↻** cuando hace falta, para traer solo eso (por ejemplo solo Pagos antes de despachar).
- Se ve solo lo que tu cuenta tiene encendido y tus permisos dejan ver. Si el programa de Pagos ME no está abierto,
  la línea lo dice («abre el programa de Pagos ME») y lo demás se actualiza igual.
- Puedes cerrar el panel y seguir: las pantallas se ponen al día solas al terminar.
- Reemplaza a «Actualizar desde ML», «Revisar ahora», «Actualizar ahora», «Actualizar ventas», «⬇ Traer pesos de ML»
  y «Traer ME y ML». **Traer pagos y guías** sigue en Pagos ME, Por confirmar y Calificaciones (es la misma traída).

## 2. Entrar, cuenta y prueba gratis

*Cómo lo pregunta la gente:* clave, contraseña, no puedo entrar, login, registrarme, crear cuenta, prueba gratis, días de prueba, vencida.

- **Dirección:** app.elcomerciantedigital.com. Se entra con **usuario o correo** y contraseña (desde el 19-11-2026 el correo también sirve; si dos cuentas tuvieran el mismo correo, entra con tu usuario).
- **Una cuenta por persona.** Si una persona trabaja en varias empresas, usa el mismo usuario y elige la empresa
  en el selector de arriba (navbar).
- **Olvidé mi contraseña:** en la pantalla de entrar toca **«¿Olvidaste tu contraseña?»**, escribe tu usuario o
  tu correo y te llega un **código de 6 números** al correo de tu cuenta y a tu Telegram (si lo vinculaste en Mis
  avisos). Escribe el código y tu clave nueva (mínimo 8 caracteres). El código vale 15 minutos y tiene 5 intentos;
  al cambiarla se cierran tus sesiones abiertas en otros equipos. La pantalla te dice a dónde lo mandó (correo y
  Telegram a medio tapar, p. ej. con•••@gmail.com y @con•••; si escribiste el correo, se ve completo). Si no te llega el correo, mira en spam o promociones.
  Si tu cuenta no tiene correo ni Telegram, la pantalla te lo dice: si eres empleado, el administrador de tu empresa
  te pone una nueva en **Mi cuenta → Mi equipo → Cambiar contraseña**; si eres el administrador, escríbenos a Soporte por Telegram.
- **Crear cuenta:** app.elcomerciantedigital.com/registro (nombre del negocio, tu nombre, un contacto —WhatsApp o
  Telegram—, correo y contraseña). El **usuario se arma solo** desde tu correo (marcos.c@… → marcos.c; si ya existe,
  marcos.c2) y te lo muestra al crear la cuenta; entras con ese usuario **o con tu correo**. Lo ves en **Mi cuenta**.
  La página lista lo que trae la prueba (la IA responde sola tus preguntas, Mensajes, Pagos MercadoEnvíos, Despachos,
  Stock, Radar) y menciona **Inventario** como paso opcional que se activa después.
- **Prueba gratis de 15 días:** incluye Automatizaciones y Pagos ME (sin Inventario). Los días **corren desde que te
  registras**: conecta tu cuenta de MercadoLibre cuanto antes para aprovecharlos. Cada cuenta de MercadoLibre puede usar
  una sola prueba. Al terminar la prueba, para seguir se elige el plan y se paga en **Mi plan** (ver
  [Planes](#3-planes-y-créditos-de-ia)). Si eliges un plan con menos herramientas que el que tienes (la prueba es
  Automatizaciones), Mi plan muestra en ámbar **«Con <plan> dejas de tener:»**, la lista, cuánto menos pagas al mes y
  **Seguir con <tu plan>** para volver con un clic; tus datos se conservan y vuelve todo si después pasas a un plan
  mayor. Si eliges uno mayor, en verde **«Con <plan> ganas:»** y cuánto más al mes (con tu escalón, ciclo y descuento).
  Con tu plan elegido, abajo sale la invitación al plan siguiente (**¿Pasas a…?**, con lo que suma y **Ver <plan>**);
  los planes «Próximamente» no se ofrecen. **Mejorar mi plan** también muestra lo que ganas.
- **Prueba de Inventario 15 días** (21-11-2026; por ahora solo para algunas cuentas que ya pagan, se la damos nosotros): arriba sale
  **«Nuevo · Prueba Inventario 15 días gratis»** con **Probar gratis** (solo al administrador). Se abre una ventana con
  lo que incluye, hasta cuándo es gratis y cuánto pagarías si sigues; **Activar prueba gratis** la prende al instante
  y te lleva a Inicio de Inventario, con **Primeros pasos** (importar tus productos desde ML, costos, stock). Todo lo
  demás sigue igual (Pagos ME queda en Automatiza y además en Ventas → Por confirmar). Es **una sola vez** y **siempre
  15 días**. Mientras corre, arriba una línea gris con los días que quedan (y en Mi plan); **3 días antes** el aviso
  pasa a ámbar con el monto para pasar a Completo, y llega una línea en tu resumen diario de Telegram. **Para seguir:**
  Mi plan → **Mejorar mi plan** → Completo: pagas la diferencia entre tu plan y Completo **solo por los días que le
  quedan a tu plan, contados desde que termina la prueba** (pagar antes no te quita días gratis), con tu descuento
  (Fundador −30 %, que no se suma con el trimestral; o trimestral −10 %). En tu próxima renovación pagas Completo.
  **Si no sigues**, al día siguiente del fin se apaga solo y vuelves a Automatiza como antes; tus datos (productos,
  movimientos) se guardan 60 días: si pasas a Completo en ese tiempo, vuelve todo. **Si tu plan vence durante la
  prueba** y no lo renuevas, se pausa toda la cuenta como siempre (datos guardados); si lo renuevas, la prueba sigue
  hasta su fecha, o renuévalo directamente en Completo para quedarte con Inventario.
- **Cuenta solo del Radar:** si te registraste desde radar.elcomerciantedigital.com, tu cuenta entra solo al
  Radar; si intentas entrar al Sistema te lo indica. Para usar el Sistema, escríbenos.
- **Radar mensual (solo Radar):** el registro del Radar está siempre abierto. Desde el 18-11-2026 el registro invita a **probarlo
  gratis** («¡Pruébalo gratis!», también en la página de inicio y en los precios del Radar). Después se paga el mes:
  **$20 al mes** (en noviembre 2026, **$14**, −30%), y ese mes tienes el **Radar PRO todos los días**. Mientras no
  pagas, al entrar al Radar ves 5 productos de ejemplo y el botón **Pagar y activar**, que te lleva a **Mi plan**
  (app.elcomerciantedigital.com/renovar) con tu mismo usuario y contraseña; pagas por Pago Móvil o Binance y, cuando
  lo confirmamos, se abre el Radar completo. Al vencer el mes vuelve la pantalla de pago; si pagas antes, el mes nuevo
  se suma a continuación. Solo hay pago mensual. Desde 5 días antes del vencimiento, el Radar avisa arriba «Tu mes de
  Radar vence en N días».
- **Prueba del Radar (cuentas nuevas desde el 18-11-2026):** quien se registra en /registro (prueba de 15 días) o en el
  Radar tiene, al entrar al Radar por primera vez, **10 búsquedas en 7 días** con la vista bloqueada: solo ve productos al
  gastar una búsqueda, solo la primera página, sin lo nuevo del mes, sellos, filtros Pro ni Competencia. Al terminar queda
  en solo lectura con su cabina y el botón para activar el Radar. Una prueba por persona (mismo equipo y conexión en 30 días
  = sin prueba). El dueño la sigue en **Plataforma → Programas y promos → Prueba Radar** (búsquedas usadas, si sigue,
  terminó o pagó, contacto) y con el **ojo** ve su Radar tal como lo ven, en solo lectura (no gasta sus búsquedas).

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
- **Completo:** lo anterior + Inventario, vincular publicaciones de ML, pesos y precios (rentabilidad real), Promociones y reportes (top de vendidos, stock con aviso de reposición y sugerencias de compra).
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
     El plan viene elegido (el tuyo, o Automatizaciones si vienes de la prueba); «cambiar plan» muestra los tres. **Completo** (21-11) trae Inventario: al confirmarse el pago se prende solo y
     aparece el interruptor **Inventario | Automatiza** junto al logo; si después renuevas con un plan menor, Inventario se
     apaga (tus datos se guardan).
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

Todas las preguntas sin responder de todas tus cuentas, en una sola lista. La **ⓘ** junto al título resume cómo funciona.

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
- **En «Después de la compra» (Mi IA) hay dos datos nuevos:** **¿Cobras embalaje?** (Sí/No, cuánto y qué incluye) y
  **¿Quieres que la IA mande tus datos para pagar?** (Sí/No y los datos, escritos una sola vez, como los copiaría el
  comprador). Con esto la IA contesta sola cuánto es el embalaje y, solo si el comprador los pide, dónde pagar; si eliges
  No, esas preguntas te quedan para revisar. **Si el monto del embalaje cambia, actualízalo ahí** (la IA usa siempre el
  que esté escrito).
- **Retiro en persona (21-11-2026):** en «Ubicación y retiro», si marcas que se puede retirar, Mi IA pregunta **cómo te
  contactan para coordinar el retiro** (teléfono o WhatsApp) y, opcional, **cómo se coordina** («escríbenos para acordar
  día y hora»). **Solo en Mensajes** (ya compraron; MercadoLibre Venezuela permite el teléfono en los mensajes de la
  compra): si el comprador pide retirar, la IA le confirma que se puede, le recuerda la opción de envío y le da ese
  contacto, copiado exacto. **En Preguntas nunca da teléfonos** (son públicas): sigue diciendo que al comprar recibe
  los datos.
- **Para encender la IA en Mensajes hacen falta 3 datos más** (Preguntas no los pide): **Datos para pagar** (o «No, los
  mando yo»), **Embalaje** (Sí o No) y, si hay retiro en persona, **el contacto para el retiro**. Si ya la tenías
  encendida no se apaga: Mi IA muestra «Para la IA en Mensajes falta…» con **Completarlo →** hasta que los llenes.
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
  está en Configuración → IA en prueba (en Preguntas y en Mensajes)). Se abre una ventana: escribe **cómo la hubieras
  respondido tú** (la respuesta correcta completa) y toca **Guardar**. La IA saca de ahí lo que es de ese producto (queda en
  sus datos guardados) y lo que vale para todas (queda en Mi IA → Información extra → «Correcciones de mi equipo»), y te
  muestra lo que aprendió. Si ya lo tenía anotado, no guarda nada repetido. No pongas precios ni teléfonos: no se guardan.
  La respuesta ya publicada en MercadoLibre no cambia.
- **Frase de escape de la IA**: en el historial marca las preguntas que la IA no se animó a responder y contestó con la
  frase de escape (al pasar el mouse se ve por qué se frenó). También tienen **✗ Corregir a la IA** para enseñarle.
- **N datos guardados** (al lado, o en cada pregunta sin responder) abre una ventana con lo que la IA sabe de esa
  publicación: ahí se editan o borran.
- **Agregar datos antes de que pregunten:** Preguntas → Configuración → Datos de productos (también en Mensajes →
  Datos de productos) → **+ Agregar datos a un producto**. Buscas la publicación (activas y pausadas, todas tus
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

**Pantalla IA en prueba** (Preguntas → Configuración): solo la ve la organización de la plataforma
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
  solo TEALCA) y la pestaña se llama **Datos de productos** (ahí quedan los datos anotados).

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
  lado: «Gratis ZOOM y TEALCA», «⚠ SOLO TEALCA» = gratis solo por Tealca, o sin envío gratis), no según tus políticas generales. Si es solo
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

Los mensajes de tus ventas en MercadoLibre (posventa), de todas tus cuentas, para que ninguno quede sin respuesta. La **ⓘ** junto al título resume cómo funciona.

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

**Pestañas:** Por atender · Atendidas · Recordatorios · Pedir calificación · **Configuración**. Dentro de
**Configuración** (igual que en Preguntas): **Mi IA** (se abre primero), **Al recibir compra**, **Respuestas rápidas**, **Datos de
productos** (y «IA en prueba», solo para la plataforma). Mi IA y Datos de productos son **los mismos que en Preguntas**:
lo que guardas en un lado lo usan las dos IA. Las Respuestas rápidas de Mensajes son otras (llevan `{nombre}`, `{precio_bs}`…).

- **Al recibir compra (Configuración):** manda **hasta 2 mensajes** a cada venta nueva (a los pocos segundos, unos 10,
  después de los dos de ML; el segundo, unos segundos después del primero), una sola vez por venta, solo a ventas que
  entren desde que lo prendes. No se manda si la venta se canceló o si el comprador escribió primero (su mensaje queda en
  «Por atender»; en el historial sale «No se mandó» con el motivo). `{nombre}` = primer nombre del comprador.
  MercadoLibre corta cada mensaje de más de **350 caracteres** sin avisar: si no te alcanza, toca **+ Agregar un
  segundo mensaje**. Se edita uno a la vez (al abrir uno se cierra el otro) y el campo crece con el texto.
  **Ver cómo llega** muestra la conversación como la ve el comprador. ML limita los mensajes seguidos sin respuesta:
  usa el segundo solo si hace falta; si ML lo rechaza, el primero igual llega y el motivo queda en el historial
  (**Últimos 7 días**, de a 20 por página). Lo configura un administrador.
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

- **Agotadas / Por agotarse:** el límite de «por agotarse» lo eliges tú (por defecto, menos de 3) con **✎ cambiar
  límite**, junto a esa pestaña. Escribe el stock nuevo en cada fila y abajo aparece la barra **Actualizar en
  MercadoLibre (N)**: solo cambia la cantidad disponible, nada más. En Pausadas, al marcar aparece **Reactivar**.
- La **ⓘ** junto al título explica cómo cuenta (30 días, aviso de 7 días, revisión cada hora); arriba dice cuándo se revisó
  (al tocarlo abre ↻ Actualizar).
- **Pausadas:** publicaciones pausadas a mano (o por ML al quedar en 0). Márcalas y toca **Reactivar en
  MercadoLibre** (o ▶ en cada una).
- **Cada fila (con Inventario):** a la derecha, siempre **inventario N** (lo que hay en tu inventario) y, si conviene
  subir el stock en ML, **sugerido X** (al tocarlo lo escribe como stock nuevo). Debajo, **hace 17 h / hace 2 días / hace 40 min**:
  desde cuándo está agotada, por agotarse o pausada.
- **No hay para reponer:** deja de avisar de ese producto hasta que lo repongas y vuelva a agotarse.
- **Revisar ya:** con **↻ Actualizar** (arriba, junto a Novedades), línea Publicaciones y stock (se puede cada 10 minutos). Además se revisa sola cada hora.
- Si la empresa lleva Inventario, cada fila muestra cuánto tienes en inventario y un botón «usar» para ponerlo
  como stock nuevo, y arriba el botón **Comparar con inventario →**: aquí ves **lo que dice MercadoLibre**; compararlo
  con tu inventario y arreglarlo en un clic está en **Publicaciones → Stock vs inventario** (dos pantallas a propósito).
- «MercadoLibre la frenó (en revisión)»: ML la tiene en revisión; hay que verla en MercadoLibre.

**Video:** «Calificaciones y Stock».

---

## 7b. Publicaciones (Inventario → Publicaciones)

*Cómo lo pregunta la gente:* editar publicación, cambiar precio en ML, cambiar fotos, características, ficha técnica, descripción, variantes, pausar publicación, cambiar precios a muchas, subir precios en lote, pie de descripción, encabezado, condiciones de compra, plantilla de descripción, cambiar la info de abajo de la descripción en todas.

Todo lo de tus publicaciones de MercadoLibre en un solo menú, con pestañas ordenadas por trabajo (18-11;
cada una aparece si tu empresa y tu usuario la tienen). Al tocar **Publicaciones** en el menú se abre la primera:
- **Mis publicaciones** (antes «Editar»; viene con el Inventario; permiso **Publicaciones (editar en MercadoLibre)**):
  la lista de todas tus publicaciones, como en ML. Cada fila lleva una **etiqueta corta solo si algo pide atención**:
  - **«N disp. ✎»** y **«N variantes»** (en las que puedes editar): abren **Cambiar stock** ahí mismo, con un cuadro por
    variante; lo que pones va directo a ML (por ejemplo, dejar en 0 la variante que se agotó sin entrar a la publicación).
    La flecha **→** abre la publicación.
  - **Activa · Pausar** / **Pausada · Activar** (siempre): el estado en ML; al tocarlo pide confirmar y la pausa o la
    activa. Pausada desde aquí queda «pausada a mano» (el stock automático no la reactiva). Para varias: elígelas y
    abajo **Pausar** o **Activar** (van por la cola, con el avance abajo a la derecha y en Historial de tareas; las que ya estaban así no se tocan; solo se activan las
    que tienen stock en ML).
  - **Stock distinto** (ámbar) o **Vende de más** (rojo): el stock de ML no coincide con tu inventario (la misma cuenta
    de Stock vs inventario). Dice la diferencia (ML X · inventario Y, o cuántas variantes no cuadran; el detalle al
    pasar el cursor). Solo avisa: al tocarla abre **Stock vs inventario** con ese producto, donde se analiza y arregla.
  - **Sin vincular**: activa con stock y sin producto. Lleva a **Vincular** con esa publicación.
  - **Sin peso** (Venezuela): su producto no tiene peso. Lleva a **Pesos y envío gratis**.
  - **En promo** (Venezuela): está en una promoción (según la última lectura de Promociones). Al pasar el cursor dice
    en qué campañas; al tocarla abre **Promociones** buscando esa publicación.
  - **Muchas visitas, pocas ventas** (20-11-2026): al menos 100 visitas en los últimos 30 días y menos de 1 venta cada
    100 visitas. Mucha gente la mira y casi nadie compra: revisa el precio, las fotos o el título. Al pasar el cursor dice
    cuántas visitas y ventas tuvo.
  **Visitas:** debajo del título de cada publicación sale **«N visitas/mes»** (las de los últimos 30 días). Se traen de
  MercadoLibre **una vez al día**; las ventas salen de las ventas de ML que ya tiene el sistema. Las recién publicadas
  o las que todavía no se leyeron no muestran el número.
  **Al día:** la lista es una copia del catálogo de ML (se relee sola **cada hora**, junto con la revisión de stock, o ya con
  **↻ Actualizar** (arriba, junto a Novedades)). Cuando llega una venta nueva, se relee al momento **solo la publicación vendida** (su stock y
  si ML la pausó al quedar en 0) y con esa misma lectura quedan al día Mis publicaciones, Stock vs inventario y
  **Automatizaciones → Stock** (cada lectura de ML se aprovecha para todas). Lo que cambies directo en ML sin vender
  aparece en la próxima relectura. Al abrir una publicación, el editor la lee en vivo.
  Arriba, los filtros con su número (**Stock distinto · Sin vincular · Sin peso · En promo · Muchas visitas, pocas ventas**) muestran solo lo que hay
  que arreglar. Cada etiqueta sale solo si tienes permiso para esa pantalla. Arriba a la derecha: **Vincular** y
  **Pesos y envío gratis** (con lo que falta: publicaciones activas con stock sin producto, el mismo número que el filtro «Sin vincular»; al pasar el cursor, cuántos colores/modelos) y **Textos de descripción**. Tocar la fila abre
  el editor (ver abajo).
- **Promociones** (ver abajo).
- **Stock vs inventario:** el stock que muestra cada cuenta de ML contra tu inventario, con sus grupos y arreglos en lote.
- **Vincular** y **Pesos y envío gratis** (antes en «Preparar»): se abren desde los botones de Mis publicaciones o
  desde sus etiquetas; estando ahí, «← Mis publicaciones» vuelve. Quien no tiene Mis publicaciones los ve como pestañas.
- **Historial de tareas** (enlace a la derecha): lo que se mandó a MercadoLibre en segundo plano. Mientras algo se
  está enviando, el avance sale abajo a la derecha de cualquier pantalla (también lo de Stock vs inventario cuando
  son más de 10 publicaciones).
- **Promociones** (Venezuela, viene con el Inventario): campañas de ML y hasta dónde puede bajar el precio sin perder el envío gratis
  (desde el 18-11 revisa también a quien lleva varias: cada cantidad de 2 a 20 unidades, no solo 2 y 3). La
  columna **Rentabilidad** es lo que te queda al precio de la promo ÷ lo que te costó el producto (como en Productos);
  **Rentabilidad mínima** (20 % por defecto) marca en naranja las que quedan por debajo y las filtra con «Rentabilidad < X %».
  Campañas propias: **Editar** cambia la fecha de fin (máx. 31 días desde que empezó; una vencida ya no se puede editar).
  **Pausar** les quita el descuento a todas sus publicaciones sin borrar la campaña y recuerda cuáles eran (va a la cola: se puede seguir trabajando o pausar otra; avance abajo a la derecha y en Publicaciones → Historial de tareas); **Reanudar**
  las vuelve a poner con el mismo %. **Renovar** (vencida o por vencer en 3 días) crea una campaña nueva desde hoy con
  el mismo nombre y % y propone las mismas publicaciones. **Borrar campaña** la quita para siempre (primero les quita el
  descuento). Por Telegram avisa 3 días antes de que venza una campaña propia.

**Editar** sirve para cambiar tus publicaciones **sin entrar a ML**, con una pantalla parecida a la de ML.

- **Buscar:** por título, SKU o número (MLV…), por cuenta y activas/pausadas. Toca una para abrirla.
- **↻ Actualizar** (arriba, junto a Novedades): trae ya las publicaciones nuevas o recién reactivadas. Sin tocarlo,
  la lista se refresca sola cada hora, por eso una recién publicada puede tardar un poco en aparecer.
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

**Dónde se verifica (21-11): una lista, dos puertas.** **Sin inventario**, en Pagos ME (pestaña Ventas). **Con
inventario**, la MISMA lista está en dos lugares: en **Pagos ME** (menú de Automatiza, como siempre) y en **Ventas → Por
confirmar**. Lo que hagas en uno aparece en el otro. En Pagos ME, **Registrar venta** abre ahí mismo el formulario de
Ventas (sin cambiar de espacio): la venta queda en Ventas y se descuenta del stock. La primera vez sale un aviso que lo
explica. (Solo la empresa que registra sus ventas en el sistema —módulo de Despachos desde Ventas— tiene la lista
únicamente en Ventas, con Pagos ME como «Conexión Pagos ME» en el menú de la cuenta.) Si apagas o prendes el inventario
no se pierde nada: los pagos y lo ya verificado son los mismos.

**Línea de estado (arriba, en Pagos ME y en Por confirmar):** una sola línea con la PC (● verde = en espera, naranja = el
despertador no corre pero Chrome sí, rojo = sin señal), sus cuentas, y **«✓ traído hh:mm · N nuevos»** si la última
traída salió bien. Debajo solo los avisos que piden algo (cuenta desconectada, Chrome sin conectar, cuenta del portal
equivocada). La caja grande sale solo mientras trae, si falla o si quedó incompleta. **⚙ Conexión** despliega: agregar
cuenta, descargar programa, extensión, conectar o desconectar PCs. La **ⓘ** junto al título resume cómo funciona.

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
«Esperando la PC» si el programa no está conectado. La central **↻ Actualizar** (arriba) usa esa misma traída: si ya hay una
corriendo, la sigue en vez de pedir otra.

**Uso diario:** toca **Traer pagos y guías** y espera el aviso verde. Chrome se abre solo, trabaja y se cierra: no
lo toques. Luego verifica cada pago (Pago correcto / inválido). **Despachos no imprime guías con el pago sin
verificar:** las marca **«Falta confirmar el pago»** con el enlace **Confirmar pago →**, que abre la lista ya filtrada
en esa venta (o **Despachar igual**, que deja anotado quién lo hizo). Con inventario y las ventas de ML, si la guía se
imprime sin haber registrado la venta, Despachos avisa **«Venta no registrada: no se descontó del stock»**.

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
con el total de la orden, pero **solo avisa si hay diferencia**: «Pagó de menos según ME», «Pagó de más según ME»,
«Incluye embalaje según ME». Si coincide no muestra nada (casi siempre coincide, porque lo escribe el comprador): no es una
confirmación. El monto real que llegó solo lo confirma **Comprobar con el banco**. Si la **misma referencia de pago** aparece en otra
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
- *Desconectar PCs y volver a conectar (19-11-2026):* «Desconectar PCs» (en ⚙ Conexión) anula la conexión de todas las PCs: dejan de traer. Al desconectar, el panel muestra enseguida un código nuevo y los pasos para volver: en cada PC se **instala de nuevo el programa** («descarga el programa») y se escribe el código, y en **cada perfil de Chrome** se abre el Asistente de envíos y se escribe el mismo código → Conectar. El programa que ya estaba instalado no sirve hasta reinstalarlo con el código, porque quedó con la conexión anulada. Con el panel abierto y ninguna PC conectada se ven los mismos pasos. «Generar clave» (clave larga para instalar a mano) ya no aparece para los clientes: no hace falta, y generarla desconectaba todas las PCs.
- *Punto naranja «Chrome conectado · el despertador no corre»:* trae igual mientras Chrome esté abierto; lo que no corre es el despertador (el que abre Chrome solo al tocar Traer). Reinicia la PC o abre otra vez instalar-despertador.cmd. Rojo «PC sin señal» = no responde ni Chrome ni el despertador.
- *¿Quién trae, Chrome o el despertador?:* si Chrome está abierto con la extensión, la trae la extensión sola (una pestaña de fondo) y el despertador **no** abre otra ventana; el despertador es solo el respaldo: abre Chrome **solo cuando está cerrado** (desde el 19-11-2026 nunca abre otra ventana encima de un Chrome que está trabajando, porque eso cortaba la lectura). Si la extensión ya leyó bien todas tus cuentas, el despertador no abre nada. Si una cuenta leyó con error, no se reintenta sola: el error queda a la vista y se vuelve a traer con el botón. *Si una cuenta no termina* (desde el 19-11-2026): la traída se da por en curso hasta 10 minutos (abrir Chrome con el despertador y una conexión lenta pueden tardar); si una cuenta con su Chrome abierto lleva más de 4 minutos, el aviso dice **«tarda más de lo normal: si sigue así, cierra y abre el Chrome de esa cuenta en la PC»**, y si no termina, **«no respondió»** con el mismo consejo. Pasa cuando el portal de MercadoEnvíos deja de responder a mitad de una lectura y la extensión queda trabada: desde la **extensión 1.3.7** se suelta sola a los 4 minutos sin avance (cuenta como error), así que cerrar Chrome solo hace falta con versiones anteriores. La 1.3.7 también le quita a la dirección la marca **#vigilante** que pone el despertador apenas abre la pestaña (es solo para la extensión; nunca se envía a MercadoEnvíos). Además la 1.3.7 trae al sistema las **notas** que escribes en el portal en cada orden y avisa qué órdenes del portal **no se trajeron y por qué** (sin pago ni guía todavía, o sin número de venta): por ahora se guardan, y se verán en Pagos ME más adelante. Si al reingresar a MercadoEnvíos con tu cuenta de ML se abre otra pestaña, la cierra al terminar.
- *Traída más rápida y con avance (extensión 1.3.9, 19-11-2026):* la extensión ya no recorre siempre los 7 días. Desde la **1.4.0** lee solo las órdenes **creadas desde tu última traída buena** (casi siempre una página) y, aparte, **una por una por su número** las que en la traída anterior quedaron esperando pago o guía: así entra el pago de una venta de hace 6 días aunque el portal no le cambie la fecha (MercadoEnvíos no siempre lo hace). Lo que ya tenía pago y guía no se vuelve a bajar. Lee completo (7 días, que es lo que dura una orden en el portal) la primera vez o si pasaron 3 días sin una traída buena. La 1.3.9 lee siempre completo. Mientras trabaja, el aviso de abajo a la derecha muestra cómo va cada cuenta: **«leyendo órdenes 40 de ~120 · faltan ~1 min»**, después **«revisando las que esperaban pago 5 de 30»** y **«bajando guías y pagos 3 de 20»**. Con internet lento espera más (se ajusta solo a lo que viene tardando, hasta 2 minutos por página) y, si la lectura completa pasa de 8 minutos, sube lo ya leído, que son las órdenes más nuevas. Mientras una cuenta siga mostrando avance, el botón Traer sigue ocupado aunque pasen los 10 minutos. Pregunta al sistema cada 30 segundos (antes cada minuto), así que arranca antes, y borra la marca #vigilante al terminar de cargar la página. Las versiones anteriores siguen funcionando igual (leen los 7 días, sin avance).
- *Traída por avisos (extensión 1.4.1, 20-11-2026):* la extensión lee los **avisos de la campanita del portal** («Tienes un nuevo pago», «Tienes una nueva orden», cada uno con su número de orden) publicados desde tu última traída, y baja **solo esas órdenes por su número, 5 a la vez**. 50 avisos pesan unas 15 KB, cuando una página de 20 órdenes pesa unas 370 KB, así que la traída tarda segundos aunque el internet de la PC sea lento. Los avisos se leen por **fecha**, no por «leído»: si alguien los marca como leídos en MercadoEnvíos, la venta igual se trae, y la extensión nunca los marca. Las órdenes que esperan pago o guía quedan en una **lista de seguimiento** del sistema hasta que lleguen completas o venzan (7 días): una compra de ayer pagada hoy entra con su aviso de pago, y un pago con el formulario de envío a medias se vuelve a pedir en cada traída hasta que aparezca la guía. La primera vez (o si pasaron más de 7 días sin traer) lee los avisos de los 7 días. Probado con una cuenta real: en 5 días el portal publicó el aviso del 100 % de las órdenes y de los pagos, así que no hace falta recorrer la lista. Por las dudas hay un **vigía**: si MercadoLibre tiene ventas nuevas de la cuenta y el portal no publicó ningún aviso de ellas, la extensión vuelve sola a leer la lista por 24 horas (más lenta, sin perder nada) y se avisa al dueño de la plataforma por Telegram. Si los avisos no alcanzan hasta la traída anterior, también lee la lista completa. El aviso de abajo dice **«leyendo avisos de pago»**. Esta lista de seguimiento también arregla un error de la 1.4.0: una orden sin pago que quedaba en la última página leída se marcaba como vista y no se volvía a mirar, así que si pagaba después no entraba; ahora sigue anotada y se revisa. El programa de la PC (1.3.8, la descarga de Pagos ME desde el 20-11) pregunta cada **30 segundos** (antes 60), y **nunca abre Chrome en una cuenta que ya está trabajando** (Chrome abierto y la extensión leyendo): así no quedan dos navegadores en la misma cuenta.
- *Cuando una cuenta no toma la traída (20-11-2026):* el aviso de abajo y la pantalla de Pagos ME ya no dicen «trabajando…» ni «la PC no respondió (¿apagada o sin luz?)» si en realidad nadie está leyendo. Si el Chrome de esa cuenta está prendido pero no toma la traída en 2 minutos (4 con extensiones anteriores a la 1.3.9), dice **«la extensión de esa cuenta quedó trabada: recarga la pestaña de MercadoEnvíos (F5) o cierra y abre ese Chrome»**. Pasa sobre todo si se usa la pestaña del portal mientras la extensión lee. Si el Chrome de la cuenta no da señal en 3 minutos, dice **«el Chrome de esa cuenta no da señal: ábrelo en la PC y revisa que el Asistente de envíos diga Conectado»**. Los errores técnicos de la extensión también salen explicados: por ejemplo, «la pestaña de MercadoEnvíos no estaba en el portal (¿pidió iniciar sesión?)» o «se cerró o cambió la pestaña de MercadoEnvíos mientras leía».
- *Cuadre diario (20-11-2026):* todas las noches, desde las 21 h de Venezuela, el sistema revisa que cada venta de MercadoLibre de entre 1 y 6 días de cada cuenta conectada a Pagos ME tenga su explicación: **traída**, **esperando pago o guía**, o **vista en el portal sin pago**. Si una no aparece en ninguna traída posterior a la venta, se anota para que la próxima traída la pida por su número. El aviso por Telegram al dueño de la plataforma sale recién si esa traída la pidió y tampoco apareció (desde el 21-11-2026; una sola vez por venta): lo más común es que se cobró fuera de MercadoEnvíos. Solo cuentas con extensión 1.3.9 o más nueva (la 1.3.6 relee los 7 días completos en cada traída). Las cuentas que no mandan todas sus ventas por MercadoEnvíos (más del 10 % de sus ventas nunca aparece en el portal) no generan aviso.
- *«No tiene la sesión de MercadoEnvíos iniciada»:* en la PC quedó abierta esa ventana; inicia sesión ahí y vuelve
  a traer. No cierres sesión de MercadoEnvíos en ningún perfil.
- *«Un Chrome tiene abierta una cuenta de MercadoEnvíos que no corresponde a ninguna cuenta conectada»:* en ese
  perfil entraste con otra cuenta; entra con la correcta.

**Video:** «Conéctate con Mercadoenvios».

---

## 9. Despachos (Automatizaciones → Despachos) · Venezuela

*Cómo lo pregunta la gente:* etiquetas, imprimir guías, guías ZOOM, guías TEALCA, PDF de MercadoEnvíos, 4 por hoja, impresora térmica, etiqueta 10x15, 4x6, una por hoja, lote, jornada, manifiesto, apartar, en espera, cancelar envío.

Imprime las etiquetas de MercadoEnvíos (ZOOM / TEALCA) **4 por hoja A4** o **una por etiqueta en impresora térmica
(10 × 15 cm)**, con la cantidad y la nota de cada paquete,
y arma el **manifiesto** al final del día. Cuando un producto va **2 o más unidades**, la cantidad sale en un círculo
negro y escrita en palabra y negrita («❷ DOS - …», «❸ TRES - …») para no equivocarse al armar el paquete; con 1
unidad queda normal («1 - …»). La **ⓘ** junto al título resume cómo funciona.

**Cómo se usa:**
1. Las guías entran solas desde Pagos ME, o **arrastra los PDFs** de MercadoEnvíos (o pégalos con Ctrl+V, o haz
   clic para elegirlos). Forman un **lote**.
2. Revisa el lote: cada etiqueta muestra la venta, los productos y la nota. Puedes escribir o corregir la nota
   del paquete: se guarda **también en MercadoLibre** (la misma nota en Despachos, Pagos ME, Mensajes y ML; hasta
   300 caracteres). Si MercadoLibre no la acepta en ese momento, queda solo en la etiqueta (✎) y avisa. Dejarla
   vacía la quita solo de la etiqueta (en ML no se borra). También puedes elegir si en la etiqueta se imprime el título y/o la nota.
3. Elige el formato junto al botón **Generar PDF**: **Hoja A4 (4 por hoja)** para una impresora común, o **Térmica
   10×15 (1 por etiqueta)** para una impresora de etiquetas (rollo de 100 × 150 mm, también llamado 4 × 6"). La
   elección se recuerda **en ese equipo** (cada PC puede tener su impresora). En la térmica la guía sale más grande
   que en la hoja (≈ 91 % de su tamaño original, en la hoja ≈ 80 %) y los códigos se comprueban igual antes de
   entregar el PDF.
   Genera el PDF y **imprime a «Tamaño real» (100%)**, no «Ajustar a la página». En la térmica, además, elige en la
   ventana de impresión el papel 100 × 150 mm (4 × 6") y márgenes «Ninguno». Si sale cortada o chiquita, casi
   siempre es el tamaño de papel configurado en la impresora.
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

Le escribe a cada comprador su **número de guía** por MercadoLibre, después de cerrar la jornada en Despachos. La **ⓘ** junto al título resume cómo funciona.

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
  calificación. Si es al revés (tú dijiste SÍ y el comprador NO) no aparece: MercadoLibre Venezuela deja mejorar una
  calificación pero no empeorarla, la venta ya quedó concretada y cobrada.
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
- **Tienes y no vendes** (con Inventario, apagado al empezar): un producto con unidades que ninguna publicación activa
  ofrece en ML (pausadas o en 0). Una vez cada vez que pasa.
- **Numerito de Publicaciones → Stock:** siempre cuenta lo que vende sin tener stock; en Mis avisos eliges si suma también
  «Tienes y no vendes» y «Por ajustar». Es por persona y se ve aunque no tengas Telegram conectado.
- Promociones de MercadoLibre: campaña nueva, campañas por cerrar y tus campañas propias que vencen en 3 días.
- **Resumen de la mañana** y **cierre del día** con lo que quedó pendiente.
- Los **lunes**, el resumen de la mañana trae además **Tu semana** (en prueba, solo algunas empresas): ventas,
  preguntas, tiempo de respuesta y calificaciones de los últimos 7 días contra los 7 anteriores, y el termómetro de
  cada cuenta.
- **Silencio:** horas en las que no te llega nada; lo pendiente llega al terminar.

Si no ves algunos avisos es porque tu usuario no tiene acceso a esa sección (Preguntas, Mensajes o Calificaciones).

---

## 14. Mi cuenta: mis datos, mi equipo y permisos

*Cómo lo pregunta la gente:* mi cuenta, mi perfil, mis datos, cambiar mi contraseña, nombre del negocio, empleados, agregar usuario, mi equipo, permisos, no ve una sección, cambiar contraseña de un empleado, administrador.

Todo está en **Mi cuenta** (menú de arriba a la derecha, tu inicial). Antes se llamaba «Usuarios».

- **Mis datos** (todos): tu nombre, tu **correo** (con él recuperas tu clave), tu **WhatsApp** y tu **Telegram**
  (botón Vincular, que lleva a Mis avisos). Con esos datos soporte puede ayudarte. El usuario para entrar no se cambia.
- **Mi contraseña** (todos): escribe la actual y la nueva dos veces. Al cambiarla se cierran tus sesiones en todos los
  equipos y vuelves a entrar con la nueva. ¿No recuerdas la actual? «¿Olvidaste tu contraseña?» en la pantalla de entrar.
- **Mi negocio** (solo administrador): el nombre de tu negocio, el que se ve arriba en el menú. No cambia tus
  cuentas de MercadoLibre.
- **Mi equipo** (solo administrador): quién puede entrar a tu empresa y qué ve cada uno:

- **Nuevo usuario** (en Mi equipo): nombre, usuario (para entrar), correo (opcional) y contraseña inicial. Pásale su contraseña a
  la persona. **Con correo puede recuperar su clave sola**; sin correo, se la tienes que cambiar tú. El correo se
  agrega o cambia tocando debajo del nombre en la lista («+ agregar correo»).
- **Roles:** *Administrador* = todo, incluidos Usuarios y Ajustes. *Usuario* = lo que le marques en **Permisos**.
- **Permisos:** secciones que ve (Preguntas, Mensajes, Despachos…) y acciones (ver costos, editar compras, configurar
  automatizaciones…). «Volver a lo predeterminado» lo deja como al inicio.
  Con el módulo de Bonos, **Ver el bono del mes** decide quién ve la barra de bonos en su Inicio (viene marcado; se
  quita a quien no deba verla). El administrador la ve siempre.
  **Configurar costos ML** deja a un empleado cambiar la comisión, el envío sin peso y los colores de la ganancia
  (Productos → Costos ML) sin darle Ajustes.
- **Ver como:** te muestra el sistema exactamente como lo ve esa persona, sin poder guardar nada.
- **Cambiar contraseña / Desactivar:** cierra las sesiones abiertas de esa persona. Al desactivar, su historial se
  conserva.

---

## 15. Inventario (solo con el módulo Inventario)

*Cómo lo pregunta la gente:* productos, catálogo, inventario, ventas, compras, entró mercancía, vincular publicaciones, combos, packs, promociones, reportes, tasa, ajustes.

**La ⓘ junto al título** (Ventas, Compras, Inventario, Facturas, Productos, Publicaciones, Reportes, Finanzas, y también
en Automatizaciones) resume en pocas líneas cómo funciona esa sección: tócala para abrirla o cerrarla. Lo que dice cada
una está en [Notas ⓘ de cada pantalla](#20-notas--de-cada-pantalla).

> Este espacio se prende por empresa (plan Completo). Si no lo ves, tu empresa trabaja «todo desde MercadoLibre».

**En el celular** (20-11-2026): Inventario, Productos, Compras, Importaciones, Márgenes, MercadoEnvíos (con el peso
editable en la tarjeta) y Promociones (con su casilla para marcar) muestran cada producto, publicación u orden como una
**tarjeta** (en vez de la tabla ancha), con lo importante a la vista: en Inventario el stock grande, el estado, el precio y
los botones **🏷 Etiqueta** / **Ajustar**, con una fila **Ordenar:** (Nombre, Stock, Código, Estado…); en Compras e
Importaciones la orden, el proveedor, el estado, lo recibido y el total. En Productos cada tarjeta trae su casilla para
marcar y aplicar el **recargo en lote** también desde el celular. Los paneles de detalle se desplazan completos, la
ventana **Recibir mercancía** deja siempre a la vista **Cancelar** y **Confirmar** aunque la orden tenga muchos productos,
y al cargar una compra o importación cada producto va en dos líneas (nombre arriba; cantidad, costo y total abajo). Las
barras de abajo (Stock en ML, cambios sin guardar de una publicación) quedan encima del menú inferior. En Inicio, Automatizaciones (Preguntas, Mensajes, Stock, Calificaciones), Mi cuenta, Mi IA, Mi plan y Pagos ME ninguna tarjeta se corre de costado con un nombre largo, y el historial de tasas de Ajustes muestra cada cifra en una sola línea. También en el celular: Finanzas (montos uno debajo del otro), Bonos de Ajustes, Despachos, Conteos de Reportes, Configuración de Calificaciones y los enlaces largos en Preguntas y Mensajes ya no se salen de la pantalla. Mi cuenta → Mi equipo muestra una tarjeta por persona (rol, permisos y botones a la vista).

- **Inicio:** cómo va tu negocio (rehecho el 19-11-2026; gráfico acumulado el 20-11-2026). Sin título. Arriba, **lo de hoy** (desde el 20-11-2026, **igual para el
  admin y el empleado**: sale lo que tu usuario puede hacer según los módulos de la empresa y sus permisos, no según el
  rol), en la tarjeta **Para hoy**, con una columna por área de trabajo. El **título** de cada columna (Ventas ›,
  Compras ›, Inventario ›) lleva a esa sección; el botón **+** crea algo nuevo (al pasar el mouse dice «Nueva venta» /
  «Nueva compra»). Debajo salen **solo las tareas que tienen algo** (las que están en 0 no se muestran); cada una lleva a
  su lista:
  - **Ventas:** Por confirmar · Por despachar (con Despachos lleva ahí; sin Despachos, «Procesadas» o «Por descargar») ·
    Borradores.
  - **Compras** (con permiso de Compras): con **compras por etapas**, Por finalizar · Compras en camino · Importaciones
    en camino con sus cajas (punto gris = dato, no tarea). Con **compras básicas** la compra nace finalizada, así que no
    hay pendientes: la columna dice **Al día** y el **+** es **Entró mercancía**. El **+** sale con permiso de crear
    compras; con importaciones abre el menú Compra local (o Entró mercancía) / Importación.
  - **Inventario:** Sin stock · Por reponer (sin Reponer: Stock bajo), con punto gris porque es el estado del stock.
    En caída y Remate están en Inventario → Reponer.
  - Si una columna no tiene nada: **✓ Al día**.
  - En el encabezado de la tarjeta (VE), la tasa en **una píldora**: **Bs/$ 919 · 1.066 · 16%** (BCV · paralelo · diferencial). Al pasar el
    mouse o tocarla abre el detalle: oficial, paralelo, diferencial (cuánto más cara está la paralela), exceso y Descuento
    ML (con permiso de costos), la fecha, ↻ actualizar (solo el dueño de la plataforma) y **Ver historial →** (quien
    entra a Ajustes). Después el bono
  (si lo tienes) y el panel **Cómo va tu negocio**, con los botones **Hoy / Mes / Trim. / Año / Fechas…** (Fechas… abre
  desde/hasta y **Aplicar**; elegidas, el botón muestra el rango, p. ej. «1–20 nov»), que **mandan
  sobre todo lo de abajo** (no sobre los pendientes), siempre contra el período anterior (Hoy = ayer a esta hora; Mes =
  el mes pasado hasta el mismo día; Año = el año pasado hasta el mismo día; fechas = los mismos días justo antes): la
  cifra grande **Te quedó** (ganancia, con su ▲▼, «vendiste − costos» —mercancía + comisión ML— y la **rentabilidad**
  sobre el costo de la mercancía), y al lado **Ventas registradas** (las procesadas en Ventas de este sistema; las de
  MercadoLibre, registradas o no, están abajo por cuenta), **Unidades vendidas** y **Ticket promedio**, cada una con su
  ▲▼ contra el período anterior; si antes había poco (menos de 5, o el cambio pasa del 100 %) dice **«▲ antes 1»** en vez
  de un % engañoso. El gráfico es **acumulado**: cuánto llevas desde el inicio del período, día a día (los días sin ventas
  la línea queda plana), con dos pestañas, **Ventas** (línea azul) y **Ganancia** (línea naranja), y la **línea gris** =
  cuánto llevabas el período anterior a la misma altura (Mes = mes pasado a la fecha; Hoy = ayer, por hora; Año = año
  pasado, por mes). Con Hoy / Mes / Año el eje llega al **fin del período** (23 h, último día del mes, diciembre): tu
  línea termina en hoy y la gris sigue hasta el final con su monto en gris (en cuánto terminó el período anterior: tu meta;
  en la leyenda, «cerró $X»). Si el período anterior no tuvo ventas (empresa nueva), no hay línea gris ni «antes»:
  no hay con qué comparar.
  Si la de color va por encima de la gris, vas mejor que antes. Arriba, la leyenda con el total de cada
  línea; al final de la línea, el valor de hoy. Al pasar el dedo o el mouse: lo que llevabas ese día, lo del período
  anterior, la diferencia (▲▼) y lo de ese día solo. Al cambiar el período, el gráfico anterior queda a media luz hasta
  que llega el nuevo. Abajo, en dos columnas: a la izquierda **Más vendidos** (top 5 y cuánto subió o bajó —«▲ antes
  2», «antes 0» si antes no vendió—; la barra sale solo si no vendieron todos lo mismo; «Ver todos los productos» abre
  Reportes → Ventas → Por producto con esas fechas); a la derecha **Por cuenta de MercadoLibre** (ventas, «antes N» y el
  monto en **$**; en VE, los Bs pasados a $ con la tasa oficial de cada día y al lado los Bs), **Atención en MercadoLibre** (preguntas, tiempo de respuesta, cuántas respondió la
  IA, ventas por pregunta) y **Calificaciones** (con 1 o 3 cuentas va como tarjeta al lado de la última cuenta; con 2 o 4, en
  una línea abajo; las negativas y contradictorias se marcan solo si hay. **Cada número lleva a su lista** en
  Calificaciones → Me calificaron: neutrales, negativas o contradictorias, filtradas, con «Ver todas»; positivas y el
  título, a la página completa con el termómetro. Contradictorias cuenta solo las que se pueden corregir: el comprador
  dijo SÍ y tú NO; al revés MercadoLibre ya la dio por concretada y no se puede cambiar). Ganancia y costos solo con el permiso de costos.
  **Inicio sin el permiso de costos** (empleado): el mismo bloque de arriba (Ventas, Compras, Inventario y tasa, con
  lo que su usuario puede hacer); el bono (si lo ve); **Ventas
  del mes** (cuántas van sumadas día a día, en azul, con el ▲▼ contra el mes pasado a la fecha y en gris cómo iban los
  meses anteriores ese mismo día); y con Reportes, abajo y del mes, los más vendidos (en unidades), atención,
  calificaciones y «Se están cayendo». La palabra «Spread» ahora es **Diferencial** en todo el sistema.
- **Primeros pasos con tu inventario** (arriba en el Inicio, para quien ve Productos, mientras falten pasos): una lista
  con tu avance que **se marca sola** a medida que lo haces, con un botón para ir a cada pantalla y **¿Cómo?** con la
  explicación corta. Los pasos:
  1. **Conecta tu cuenta de MercadoLibre** (si tu plan trae las cuentas de ML): botón Conectar, entras con tu cuenta
     de ML y aceptas. Así tus productos salen de tus publicaciones y las ventas de ML llegan solas.
  2. **Crea tus productos:** en Productos → «Importar desde ML» marcas tus publicaciones (o cada color/modelo) y pones
     su costo; cada una queda como producto ya vinculado. También se crean a mano con **+ Producto** (nombre, costo y
     recargo sobre costo con el medidor; el precio se calcula solo).
  - **Pon el peso de tus productos** (Venezuela; dice cuántos faltan): en Productos →
     MercadoEnvíos, el peso sale del portal (con Pagos ME se pide solo al importar o vincular, o de una vez con
     **↻ Actualizar** (arriba, junto a Novedades)); los que el portal no tenga se escriben a mano. Solo cuentan los productos vinculados a una
     publicación **activa** de ML (los que no vendes en ML o ya no traes no cuentan; si reactivas una publicación sin peso,
     vuelve a contar). Se marca hecho cuando todos esos tienen peso. En MercadoEnvíos, el filtro **Sin peso · en ML** muestra
     justo esos; **Sin peso (todos)** incluye los demás.
  3. **Pon el stock que tienes hoy:** en Inventario, en cada producto **Ajustar** y escribes cuántas unidades tienes.
     Después el stock baja con las ventas y sube con las compras.
  4. **Registra tu primera venta:** en Ventas → **Por confirmar** confirmas las ventas de MercadoLibre (quedan
     registradas con sus productos); las de fuera de ML, con **Nueva venta**.
  5. **Carga tu primera compra:** en Compras → **+ Compra**: proveedor, productos, cantidades y costo; al recibirla el
     stock sube solo.
  6. **Mira cuánto ganas:** cuando una venta queda procesada, el Inicio muestra ventas, costos, ganancia y rentabilidad, los más
     vendidos y qué reponer; el detalle con Excel está en Reportes.
  Ocupa poco: muestra **un paso a la vez** («Paso 2 de 6», con puntos de avance), su explicación y el botón para ir;
  al hacerlo pasa sola al siguiente. **Ver todos** despliega la lista completa con lo hecho marcado. Al final hay una
  **recomendación** que no hace falta para terminar: conocer **Publicaciones** y **Reportes** en el Manual de
  Inventario (Aprendizaje → Manuales). **Ocultar** pregunta antes y la esconde para toda la empresa; se vuelve a abrir
  cuando quieras desde **Aprendizaje → Manuales → Manual de Inventario → «Ver la guía de Primeros pasos»**. Al
  completar todo sale «Listo» con la recomendación y **Cerrar guía**. Los productos creados a mano también cuentan
  para el paso 2 (no hace falta importarlos desde ML).
- **Fotos de los productos:** cada producto muestra su foto en Productos, Inventario (lista y panel del producto),
  Compras e Importaciones (lista de órdenes, detalle y al cargar la orden), Ventas (lista y al cargar la venta),
  Reportes (Inventario, En tránsito, Conteos, Stock), Completar costos, Márgenes y MercadoEnvíos (al tocarla se ve grande).
  Si la carga de fotos falla, se reintenta sola a los pocos segundos. Sale sola de la publicación de ML vinculada (si es una variante, la foto de ese color o
  modelo; si está en varias publicaciones, la activa con más stock). En la ficha del producto: **Cambiar foto** (o
  **Subir foto**) pone una tuya, y **Usar la de MercadoLibre** vuelve a la de ML. Sin foto: cuadro gris «Sin foto».
  Las hojas impresas (recepción y conteo) no llevan fotos.
- **Pesos (Publicaciones → Mis publicaciones → Pesos y envío gratis, Venezuela):** el peso de cada producto sale **solo** del portal de
  MercadoEnvíos (el que usa ML para el envío gratis), por medio de sus vínculos: Pagos ME lo trae en la primera traída
  del día. En la ficha y en MercadoEnvíos se ve con la marca **ME** y no se edita a mano. El peso es **solo** el del portal (nunca el que declara la
  publicación). Pasa al producto al crear, importar o vincular, y si a alguna publicación vinculada le falta, el sistema
  **pide solo** una traída de pesos a Pagos ME (llegan en 1 a 3 minutos con la PC prendida; no se repite si ya se pidió
  en la última media hora). También de una vez con **↻ Actualizar** (arriba, junto a Novedades), línea Pagos, guías y pesos (con Pagos ME).
  MercadoEnvíos está para toda empresa de Venezuela con Inventario; el descuento máximo y el aplicado se ven solo con
  el módulo Descuento ML. A mano solo los productos que el portal no da. **Pesos distintos
  en ML** = sus publicaciones pesan distinto en el portal: casi siempre un pack sin marcar «trae N u.» o un vínculo mal
  hecho; se revisa en Vincular o Stock, o se **elige con un clic** uno de los pesos que trae ML (en MercadoEnvíos o en la
  ficha del producto). Precios, rentabilidad, Promociones y Costos ML usan ese mismo peso.
- **Publicaciones de MercadoLibre en la ficha del producto:** se ven los códigos MLV vinculados (cuenta, variante,
  «trae N u.») **solo de lectura**. Para vincular o corregir: botón **Vincular publicaciones →** / **Ver o vincular publicaciones →** (abre Vincular con ese producto: las que ya tiene y las que el sistema cree que son suyas)
  (abre Publicaciones → Mis publicaciones → Vincular con ese producto). Los vínculos se hacen en un solo lugar.
- **Stock en ML: cómo está ordenada (17-11).** Arriba, **3 tarjetas** con lo que hay que hacer; cada producto cae en UN
  solo grupo (por prioridad), así los números suman lo que falta sin repetir:
  🔴 **Vende de más** (ML ofrece lo que no tienes: riesgo de reclamo) · 🔵 **Tienes y no vendes** (hay unidades y ninguna
  publicación activa las ofrece: pausadas o en 0, a propósito o sin querer) · 🟡 **Por ajustar** (cantidades distintas a lo
  sugerido o pausadas por falta de stock para reactivar). Al entrar se abre la más urgente que tenga algo.
  **Arreglar N productos** (en cada tarjeta, quien puede cambiar el stock): primero muestra la lista de lo que cambia en ML
  («PIKEKE · Talla M: 0 → 24 · se reactiva») con casillas para desmarcar, y recién ahí **Aplicar N cambios en ML**. Con el
  inventario NO marcado al día, en lote solo se arregla «Vende de más» (bajar es seguro); lo demás, uno por uno.
  **Para decidir** (pestaña gris): lo que el sistema no resuelve solo, con la etiqueta del motivo: «Quedan pocas: elige a
  mano», «Al reactivar queda sin envío gratis», «¿Pack o combo?». **Todos**: todos los productos, con el buscador.
  **Filtros** (botón): estado en ML (activas/pausadas) y cuenta. **⚙ Ajustes** (arriba): «Mi inventario está al día»,
  reserva de seguridad y cómo se calcula el disponible. Las **pausadas a mano** no se reactivan solas: se activan en la
  fila si fue sin querer. Lo marcado «No sincronizar» no cuenta.
  **Una etiqueta por fila** (del color de su tarjeta, junto al nombre): 🔴 «Urgente: tienes 0, ML ofrece 2» ·
  🟠 «ML ofrece 10, tienes 1» · 🔵 «Tienes 161 · ninguna activa» · 🟡 «ML 5 → quedará 2». En cada tarjeta lo más urgente
  va arriba (Vende de más: primero los de 0; Tienes y no vendes: los de más unidades; Por ajustar: la mayor diferencia).
  **Envío gratis por cantidad (Venezuela, 18-11):** al comprar varias, ML suma el peso del paquete y pide el mínimo de
  ese peso. El sistema revisa **cada cantidad** que el comprador puede llevar (hasta lo que mostrará ML, máx. 20) con el
  precio de hoy (con la promo si tiene). Si alguna queda sin envío gratis, la publicación dice **«⚠ Desde N u. pierde
  envío gratis»** (al pasar el cursor, cuáles y por qué) con el botón **Crear pack**; si todas siguen gratis no dice nada (desde el 20-11 solo se muestra lo que avisa). No cambia lo
  sugerido. **Crear pack** copia la publicación como «… Pack XN» (fotos, categoría, características y descripción), con
  un precio que llega al mínimo de envío gratis de ese peso (sugerido = N sueltas, subido hasta el mínimo si no llega);
  queda **pausada** para revisarla y ya **vinculada «trae N u.»** al mismo producto. Falta registrar su peso (N × peso)
  en el portal de MercadoEnvíos y activarla. Con variantes, se crea desde la variante vinculada.
  La tarjeta Vende de más dice cuántos son urgentes (lo mismo que el numerito del menú). «ML ofrece» cuenta solo las
  publicaciones **activas**: las pausadas no venden, así que no hacen sonar Vende de más.
  **Más de 10 publicaciones** (Arreglar o Pausar/Activar en lote) van por la **cola de MercadoLibre** (60 por minuto):
  arriba se ve el avance y sigue aunque cierres la pantalla. Cada publicación toma lo que calcula el sistema en el momento
  en que le toca (si entra una venta mientras tanto, ya la cuenta).
- **Vínculo viejo (publicación entera + variantes):** si una publicación con variantes sigue vinculada ENTERA a un
  producto y además cada variante tiene el suyo, en Vincular con ML sale una franja ámbar **«Vínculo viejo»** con
  **Quitar vínculo viejo** (también en la pestaña «Por publicación entera»). Mientras tanto ese vínculo no cuenta para
  la publicación completa (Preguntas, IA, Stock en ML, pesos, fotos, No reponer): manda lo de las variantes. Al vincular
  la última variante, el sistema pregunta si quitas el vínculo entero. Quitarlo no cambia ventas ya registradas.
- **Cómo cargar productos:** si ya vendes en ML → Productos → **Importar desde ML** (crea el producto vinculado, con
  peso y foto). **Cada producto necesita un costo (en USD, mayor que 0)**: sin costo la ganancia de sus ventas saldría
  mal. Las marcadas sin costo se resaltan en ámbar y quedan esperando; se crean solo las que lo tienen.
  **¿Son muchos (50, 100…)?** En la barra de abajo está **Costo estimado: N % del precio → Poner en N**: llena el costo de
  las que no tienen, como ese % del precio de ML (en CO se pasa a USD con la TRM), y quedan marcadas **est.** Las que no
  tienen precio en USD (VE en Bs, CO en dólares) no se pueden estimar: ese costo se escribe a mano. Las ventas de un
  producto con costo estimado guardan ese costo marcado; cuando pones el **costo real** (en **Productos → Completar
  costos**, en la ficha del producto o al recibir una compra) **esas ventas se corrigen solas**. Las ventas con costo
  real no cambian nunca.
- **Completar costos** (Productos → filtro **Costo estimado** → **Completar en lote →**, o
  `/productos/costos`; requiere el permiso de costos): lista los productos con costo estimado, **los más vendidos en 30
  días primero** (con pocos costos reales se cubre casi toda la ganancia). Por fila: el costo (prellenado con el
  estimado), qué % del precio es, cuántas ventas se van a corregir. **Guardar** pone el real y corrige sus ventas; si el
  estimado ya es correcto, **Está bien así** solo quita la marca. Con varios cambiados sale **Guardar N** abajo.
  En **Inicio**, mientras haya ventas con costo estimado en el período sale: «El X % de lo vendido en este período usa
  costo estimado: la ganancia es aproximada · Completar costos». Si no está en ML → Productos → **+ Producto** solo con lo tuyo (costo, recargo, stock); cuando lo publiques,
  lo vinculas y el peso y la foto llegan solos.
- **Traer de ML** (Publicaciones, Importar desde ML, Stock): con **↻ Actualizar** (arriba, junto a Novedades); si se leyó hace menos de
  10 minutos no se vuelve a leer (ya está al día).
- **Productos:** catálogo, precios y rentabilidad de cada producto. **Importar desde ML** (botón arriba en Productos; con el catálogo vacío sale grande en el centro) crea productos a partir de
  tus publicaciones (cada una, o cada color/modelo, queda vinculada). En cada publicación nueva, **Es uno que ya tengo**
  abre un buscador: escribes el código o el nombre de tu producto, lo eliges y la publicación queda vinculada a él (no
  se crea otro). Si ninguno coincide lo dice, y se crea como nueva. Clic en una fila abre la ficha; Editar en el pie.
  En Venezuela, la columna **Peso ME** muestra el peso de cada producto y de dónde sale: solo el número = del portal de
  MercadoEnvíos (al pasar el mouse, la fecha en que se leyó), **a mano**, **⚠ distintos** (sus publicaciones pesan
  distinto en el portal: revisar en Publicaciones → Mis publicaciones → Pesos y envío gratis) o **Sin peso**. Se puede ordenar por peso.
- **Filtros de Productos (18-11):** debajo del buscador, solo los que tienen algo y con su número: **Costo estimado**
  (importados con un % del precio; trae **Completar en lote →**), **Sin costo**, **Rentabilidad baja** (por debajo de
  «sana», los cortes de Costos ML) y **Menos de $3** (Venezuela; trae **Revisar márgenes →**, antes un botón aparte).
- **Stock bajo (18-11, una sola regla):** el mínimo de cada producto sale de las reglas de Inventario → Reponer: venta
  por mes × lo que tarda en llegar la mercancía (si vende al menos el mínimo por mes). El máximo, × lo que compras al
  pedir. Si le escribiste un mínimo a mano a un producto, manda ese. «Bajo» = con stock y por debajo de ese mínimo; lo
  usan Inventario (estado y filtro), el Excel, Reportes → Inventario y el «Stock bajo» del Inicio. Ya no está el botón
  «Usar recomendados»: los recomendados se usan solos y se mueven con las ventas.
- **Recargo y rentabilidad (cómo se lee la ganancia; desde el 14-11, en todo el sistema):** son tres palabras.
  - **Recargo sobre costo:** lo que **le sumas** a lo que te costó para sacar el precio (lo decides tú, en el medidor).
    Precio = costo × (1 + recargo). Ej.: costo $2,40 con recargo 80 % → precio $4,32.
  - **Ganancia ($) / Te queda:** los dólares (o pesos) que de verdad te quedan después de MercadoLibre: comisión, envío
    y, en Venezuela, la **pérdida por cambio** (tus bolívares valen menos al pasarlos a dólar paralelo); en Colombia, la
    retención. Ya está restado el costo del producto.
  - **Rentabilidad sobre costo:** ganancia ÷ costo del producto. 44,7 % = **ganas $44,70 por cada $100 que pusiste en
    mercancía**. Se mide sobre el costo igual que el recargo, así se comparan directo: «le sumaste 80 %, te queda
    44,7 %: los otros 35 puntos se los llevan MercadoLibre y el cambio». Es la **misma cuenta** en la ficha, el
    catálogo, Promociones, el Inicio y los Reportes (en Inicio y Reportes con las ventas ya hechas: ganancia ÷ costo
    de la mercancía vendida). Ya no se usa el «margen neto» ni el «% sobre la venta».
  - Cómo explicarlo en una frase: *«El recargo es lo que le sumas al costo; la rentabilidad es lo que de verdad te
    queda. Los dos se miden sobre lo que te costó el producto.»*
- **Recargo sobre costo** (desde el 14-11 reemplaza a las «categorías de ganancia»; antes se llamaba «% de ganancia»): en la ficha (Editar o + Producto) hay
  un **medidor** de 0 a 200 %: se mueve con la barra o se escribe el número, y los dos van juntos (precio = costo ×
  (1 + recargo)). Al moverlo cambian en vivo el precio y **«Lo que te queda»**, y el medidor se pinta del color de la
  rentabilidad que deja: **verde sana**, **naranja ajustada**, **rojo pérdida**.
  - **Lo que te queda** (en la ficha y en los simuladores de Ajustes): «Resultado de tu venta» = precio final en ML −
    pérdida por cambio (VE) − comisión MercadoLibre − envío MercadoLibre − costo del producto (en CO: − retención, y
    el costo × TRM). Abajo, grande, **TE QUEDA $X**, la **rentabilidad sobre costo** con su color y la frase «Ganas $Y
    por cada $100 que pusiste en mercancía. Le sumaste X % y te queda Y %: los otros N puntos se los llevan
    MercadoLibre y el cambio». El ⓘ explica la diferencia entre recargo y rentabilidad.
  - Si tu empresa calcula los precios (precio por recargo), el recargo **define** el precio. Los productos que tenían
    categoría quedaron con su mismo % (ULTRA → 120 %, ALTO → 80 %…) y ahora se cambia producto por producto.
  - Si el precio es el que publicas en ML, el medidor arranca en el recargo **real** que lleva tu precio de hoy y, al
    moverlo, dice a qué precio publicar para ese recargo: **Usar este precio** lo pone en la ficha.
  - **Guardar y publicar en ML** (si puedes editar publicaciones y el producto está vinculado): guarda y manda el
    precio a sus publicaciones de 1 unidad en MercadoLibre (por la cola: se ve abajo a la derecha y en Publicaciones → Historial de tareas). Pide
    confirmación; los packs no se tocan. Si la publicación tiene variantes de otros productos, cambia el precio de
    toda la publicación.
  - La lista de Productos tiene las columnas **Recargo** (el % que le sumaste) y **Rentabilidad** (lo que te queda
    sobre el costo, con su color; antes «Ganancia» y «Margen neto»). Con varios seleccionados: **Recargo** + Aplicar
    se lo pone a todos (y recalcula sus precios). La tarjeta de arriba cuenta los **Sin recargo**.
  - Reportes (Por producto, Stock) muestran «Recargo 60%» en vez del nombre de la categoría.
  - **Revisión de rentabilidad** (Productos, Venezuela; antes «Revisión de márgenes»): productos de menos de $3 (precio final; antes $5), su
    ganancia por unidad y rentabilidad con la regla de envío anterior contra la tabla de MercadoEnvíos vigente, y el
    recargo sugerido para recuperar los dólares por unidad.
- **Costos ML** (botón en Productos; admin o quien tenga el permiso **Configurar costos ML**): la **comisión de
  MercadoLibre** (12 % en Venezuela), el envío de los productos **sin peso** y desde qué precio es gratis, la **tabla
  de MercadoEnvíos** (envío gratis por peso, solo lectura: es la misma para todos los vendedores de ML Venezuela y la
  mantiene al día El Comerciante Digital cuando ML la cambia) y los **colores de la rentabilidad**: «Sana desde» (25 %
  por defecto) y «Ajustada desde» (0 %); por debajo es pérdida. Se miden sobre la **rentabilidad sobre costo** (lo
  que te queda después de MercadoLibre ÷ lo que te costó). Si tu empresa ya había cambiado los colores cuando se
  medían sobre la venta, se convirtieron solos a la nueva base (ningún producto cambió de color). Se usan en la
  ficha, la columna Rentabilidad, los simuladores y Promociones.
  - El **«Envío»** del costo de la ficha es lo que te costó traer el producto (flete o importación) y se suma al costo;
    es opcional y Compras no lo pide. El envío que cobra ML va aparte, en «Lo que te queda».
- **Catálogo PDF** (Productos → botón Catálogo PDF; en prueba, solo algunas empresas): elige productos (buscar,
  «Solo con stock», «Solo con foto»), sube tu **logo**, pon el nombre, una línea debajo y un texto al final
  (contacto, condiciones), **con o sin precio** y cuántos por fila. **Guardar PDF** abre la impresión: elige «Guardar
  como PDF» y lo mandas por WhatsApp. La foto sale de la publicación de ML vinculada al producto. «Recordar estos
  datos» los deja para la próxima vez.
- **Publicaciones** (menú propio, con pestañas Mis publicaciones · Promociones (Venezuela) · Stock vs inventario, y a la derecha Historial de tareas; Vincular y Pesos se abren desde Mis publicaciones; ver [Publicaciones](#7b-publicaciones-inventario--publicaciones)):
- **Vincular** (Publicaciones → Mis publicaciones → Vincular): une cada publicación (o cada variante) con su producto, para que las ventas de ML descuenten el
  producto correcto. Todo es manual: el sistema sugiere y tú confirmas con un clic.
  **Publicaciones nuevas:** al abrir Vincular, el sistema busca solo las publicaciones que creaste en ML (como mucho
  cada 5 minutos por cuenta). Las de los últimos 15 días sin producto salen en un aviso azul **«N publicaciones nuevas
  sin producto»** (también en Productos) y en el filtro **Nuevas**: elige **Es este producto** o **Crear producto nuevo**.
  **Revisar con fotos** (filtro de Vincular): cada producto con las fotos de todas sus publicaciones vinculadas; si una
  no corresponde, **Corregir** abre esa publicación para cambiar el vínculo. La foto del producto en todo el sistema
  sale de estos vínculos: al corregir aquí se arregla sola en todos lados (no hay que actualizar nada).
- **Stock en ML** (Publicaciones → Stock vs inventario): cada producto con todas sus publicaciones; pone en ML lo que hay y reactiva las pausadas en todas tus
  cuentas de una vez. Cada producto con algo por cambiar tiene su botón **Aplicar en ML** (manda lo que dice «Quedará»,
  sin marcar nada). Para varios: márcalos y **Poner en ML lo que hay** (abajo); si alguno vende de más, avisa cuáles antes.
  **A mano** (sin aceptar la sugerencia): toca el número de **Quedará** (✎) y el producto pasa a «A mano»: cada publicación
  muestra una casilla con la sugerencia para cambiarla, y arriba «Usas X de Y». Si te comes la reserva o le pones stock a
  una pausada a mano, avisa; **pasarte de lo que tienes no se puede** (si en bodega hay más, primero **Corregir stock**).
  **Guardar en ML** manda solo lo que cambia; **Volver a la sugerencia** deshace. Lo puesto a mano dura hasta que alguien
  toque «Aplicar en ML» en ese producto (para que no se toque nunca: «No sincronizar»).
  **Mi inventario está al día** (en **⚙ Ajustes**, la cambia quien configura el inventario): prendida, al
  poner stock en ML (aquí, en Automatizaciones → Stock y en la ventana de cambiar stock) avisa si pones más de lo que
  tienes y pide «Actualizar igual» (no bloquea). Apagada, el inventario se ve solo como dato y aquí sale una nota para
  revisar las sugerencias antes de aplicar. Arranca prendida si hubo entradas o ajustes de inventario en los últimos 60 días.
  Prendida, **Automatizaciones → Stock** usa el mismo reparto: «Tienes N · [Poner X]» (al tocarlo) pone lo que sugiere Stock en ML (no
  todo el inventario; al pasar el cursor lo explica) y la que está en 0 porque lo que hay está en otra publicación dice
  «Tienes N · en otra publicación» (al pasar el cursor dice en cuál); sin nada en el inventario, «Sin inventario». Si comprando varias pierde el envío gratis, debajo dice «⚠ desde N u. sin envío
  gratis · pack» (el enlace abre Stock vs inventario con esa publicación, para Crear pack). Si el producto está en varias
  publicaciones y no hay reparto, dice «Tienes N · [Repartir →]» sin sugerir: abre un **panel a la derecha** (sin salir de Stock) con una línea por publicación (cuenta, MLV, variante, «Hoy en ML: N» y una casilla), el contador «Repartiste X de N» (en ámbar si pasas lo que tienes), «Repartir parejo entre las N» y Guardar en MercadoLibre (reactiva las pausadas si se deja marcado). Arriba de la lista, un aviso sugiere marcar el inventario «al día» para que esas filas pasen a «Poner X». La variante de una publicación **vinculada entera** dice «[Vincular por color →]» (no se sabe qué producto es: sin inventario ni sugerido): abre el **panel Vincular por color** a la derecha, sin salir de Stock (ver Stock vs inventario). Cada variante sale con su propia foto. Apagada (o sin inventario), Automatizaciones → Stock queda como siempre. Pack/combo («trae N u.») y «No sincronizar» están en **⋯ Más opciones** de cada publicación
  (en «Para decidir» salen abiertas). Tocar el **código MLV** abre la publicación ahí mismo (fotos, precio,
  variantes, descripción) sin ir a MercadoLibre.
  **Compartida con COD-…**: la misma publicación vinculada a varios productos (modelos que elige el comprador, p. ej. un
  convertidor con varias versiones). ML muestra la **suma** de lo que aporta cada producto («aporta N»). Si alguno está en
  «Quedan pocas» o no se sincroniza, esa publicación no se toca sola.
  **Vinculada entera con variantes** (vínculos viejos: el inventario va por variante): el sistema no sabe qué variante es
  cada producto, así que **solo baja**: si todos sus productos están en 0, «Quedará: 0 en todas las variantes» (cuenta en
  Vende de más y se arregla con Aplicar en ML); si alguno tiene stock, no se toca sola. El botón **«Vincular por color →»** (en la
  columna Quedará, con permiso de vincular; antes «Dividir por variantes») abre un **panel a la derecha** en dos pasos:
  1) cada color con su foto y «Hoy en ML», el producto sugerido por el nombre (✓), los productos vinculados como botones y
  «otro producto…» para buscar → **Vincular** (se vincula cada color y se quita el vínculo entero); 2) con permiso de
  cambiar stock, cada color con «Tienes N · poner N» y una casilla → **Guardar en MercadoLibre** o **Listo, después**.
  El mismo panel se abre desde Automatizaciones → Stock.
  **Quedan pocas** (el disponible es igual o menor a la reserva): el sistema no reparte solo. Si ML ofrece más de lo que
  hay, sale «Hay 2 y MercadoLibre ofrece 3. Con «Aplicar en ML» queda así: PIKEKE 1 → 1 · SOLUCIONES_MC 2 → 1» (baja
  primero las pausadas y después la que más muestra). **Cambiar a mano** deja poner cuántas muestra cada cuenta y se guarda
  con **Guardar en ML**. Una publicación **pausada a mano** no entra al reparto ni cuenta como que vende: no se le deja
  stock que no se vendería. Con pocas unidades, primero van las publicaciones activas.
  **Bodega** (con el permiso «Cambiar el stock en MercadoLibre»; no hace falta tocar el inventario):
  **Pausar** (en el **⋯** de cada publicación, con motivo opcional: dañado, sin foto…) deja de venderla; «Poner en ML lo que hay» no la reactiva
  hasta que alguien toque **Activar** (necesita stock en ML); en la fila dice «pausada a mano». **Se acabó** (en el menú **⋯** del producto,
  cuando no está en bodega aunque el sistema diga que hay): todas sus publicaciones a 0 en ML y quedan en 0 hasta que
  entre mercancía o se ajuste el inventario (o **Ya hay**); al admin le llega por Telegram para que ajuste el inventario.
  **Estado** (en **Filtros**): Activas en ML / Pausadas en ML, se combina con las tarjetas, la cuenta y el
  buscador; las publicaciones en otro estado se ven atenuadas. Al marcar productos, abajo sale **Pausar N publicaciones**
  (sus activas, motivo opcional) aunque no elijas Estado; con Pausadas, **Activar N publicaciones** (solo las que tienen
  stock en ML).
  **Desactivados que siguen publicados** (aviso ámbar arriba, solo si hay): productos desactivados con publicaciones activas
  en ML (el sistema ya no les controla el stock). **Revisar** muestra el producto junto al título de cada publicación: si el
  título no es de ese producto, la vinculación está equivocada → **Desvincular** (y vincularla al correcto en Vincular con
  ML); si coincide → **Pausar** (o **Pausar las N**); si fue un error → **Reactivar producto**. Si reutilizas esa
  publicación para un producto nuevo (Vincular con ML), el vínculo con el producto desactivado se quita solo.
  **Historial** (arriba) y **Ver cambios** (en el **⋯** de cada producto): quién cambió qué en ML (stock, pausas, reactivaciones,
  desde cualquier pantalla). El admin ve los de todos y filtra por persona; los demás ven los suyos.
  **Cada producto** (desde el 19-11-2026): debajo del nombre, botones iguales: **🔗 N vínculos** (o «Sin vincular» en
  ámbar) abre **Vincular con ML de ese producto en un panel a la derecha** (en el celular, pantalla completa): vinculas,
  desvinculas o cambias «trae N u.» sin salir, y al tocar **Listo** el producto se recalcula con los vínculos nuevos sin
  perder el filtro ni dónde estabas (solo con el permiso de vincular); **Corregir stock**; y **⋯** con **Ver cambios** y
  **Se acabó**. A la derecha, **Disponible** en grande y debajo «stock N − M sin registrar» (y «publicable» si hay
  reserva); el peso solo aparece si falta («⚠ sin peso»). **Cada publicación** (20-11): cuenta, MLV, En ML, Quedará y
  **⋯** (Pausar, «trae N u.», No sincronizar); **Activar** sigue a la vista si está pausada. La etiqueta de envío sale
  solo si avisa algo (Solo Tealca, Cobro a destino). Sin recuadros de explicación bajo las tarjetas (está en cada
  tarjeta y en ⓘ) y un solo aviso de resultado. **En el celular** (20-11) cada producto sale **resumido**: nombre,
  la etiqueta del problema, Disponible, **Aplicar en ML** y una línea «N publicaciones · ML X → Y» con **Ver ▾**, que
  abre sus publicaciones y botones (se abre solo si algo falló).
  En **Automatizaciones → Stock** sale una franja roja si hay productos en 0 a la venta (con inventario).
  **Vende de más** (tarjeta roja, se abre sola cuando hay): productos que MercadoLibre ofrece y no tienes — en **0** con
  alguna publicación activa con stock (rojo: si alguien compra no puedes cumplir) o con menos de lo que suman tus
  publicaciones activas (amarillo). Las pausadas no cuentan.
  **Aplicar en ML** en cada uno (o márcalos y **Poner en ML lo que hay**): los que están en 0 quedan en 0 en ML. El sistema lo revisa solo cada 10 minutos:
  el número rojo en **Publicaciones** y en la pestaña **Stock** son los que están en 0, y por Telegram llega
  «Vende sin tener stock» (Mis avisos) cada vez que uno entra. Cada fila muestra la foto del producto.
- **Ventas:** órdenes de MercadoLibre y ventas locales. Al registrar una venta se descuenta el inventario.
  **Estados de una venta (VE):** **Borrador** (falta registrarla) · **Por despachar** (registrada, el inventario ya se
  descontó, falta imprimir la guía) · **Despachada** (la guía salió en Despachos; pasa sola al generar el lote, o directo
  si es retiro en tienda o la guía ya estaba impresa) · **Local** (venta LOCAL entregada). «Verificado» casi nunca se
  ve: «Registrar venta» verifica y procesa de una vez; solo aparece si alguna quedó ahí con «Verificar pago».
  **Verificar el pago de un toque:** toca el chip azul «Pago por verificar · Bs …» → «✓ Sí, verificado» (o «✗ Inválido»):
  queda verificado como cuando cuadra con el banco y el botón pasa a «Registrar venta»; «deshacer» lo vuelve atrás.
  Con Inventario, los pagos de Pagos ME se verifican aquí **o en Pagos ME** (es la misma lista): arriba sale la línea de
  estado de la PC y **⚙ Conexión** se despliega aquí mismo. Se toca **Registrar venta** (no está «Ya la despaché por
  fuera», porque no descontaría el stock).
  **Ir a Despachos →** (arriba, junto a «Comprobar con el banco»; en Venezuela con Despachos): salta directo a imprimir
  las guías sin pasar por el menú.
  Abajo de la lista: **Vencidas** = ventas de más de N días (el plazo de «no concretada» de Calificaciones) sin pago y
  **todavía sin calificar**: Calificaciones las sugiere como no concretadas; se ven hasta los 8 días de la compra y las
  ya calificadas salen solas. **Calificadas como concretadas sin venta registrada** (aviso amarillo, con Inventario):
  en ML quedaron concretadas pero aquí no hay venta ni pago; si se vendió, regístrala para descontar el inventario.
  Si ya la registraron como venta **LOCAL** (cobro destino), toca **«La registré como venta local»** y elige cuál: queda
  enlazada y sale del aviso. Arriba hay un **buscador** (cliente, producto, código o nº LOCAL; las palabras en cualquier
  orden y sin acentos, busca en los últimos 6 meses); sin buscar muestra las de 20 días alrededor de la venta. Mejor: registra esas ventas desde Por confirmar, con
  el número de MercadoLibre, no como LOCAL (la LOCAL no cuenta la comisión de ML).
  **No se concretaron** = las marcadas a mano «No se concretó» (se ven 30 días para ver quién y deshacer).
  **Traer pagos y ventas** (un solo botón, como en Pagos ME): trae al instante las ventas nuevas de MercadoLibre y
  pide los pagos y guías de MercadoEnvíos (1 a 3 min; al llegar vuelve a traer las ventas). Sin Pagos ME se llama
  **Traer ventas**. Igual se traen solas cada hora.
  **Sin inventario** (botón junto al buscador, con Inventario): abre todas las ventas pendientes de registrar agrupadas por
  producto, con casillas y «Marcar todas» (las **concretadas en ML** sin venta salen aparte arriba, «revisa antes», y
  «Marcar todas» no las toma: ya se entregaron, si el producto tiene inventario hay que registrarlas); **Quitar N de pendientes** saca las que no vas a registrar (por ejemplo,
  vendidas antes de llevar inventario o de productos que no cargaste). Las quitadas no piden registro, **no restan**
  en Stock en ML y en Calificaciones siguen como cualquier venta (no cuentan como «despachada por fuera»). No esconde
  productos a futuro: las ventas nuevas siguen llegando a pendientes; lo correcto es cargar su inventario. Abajo,
  **Quitadas por sin inventario** muestra quién y cuándo, con **Devolver** (una o todas) a pendientes.
- **Presupuestos** (Ventas → ícono de hoja junto a las fechas; en prueba, solo algunas empresas): cotizaciones para un cliente.
  **+ Nuevo presupuesto:** cliente (cédula/RIF y teléfono opcionales), productos del inventario (el precio se carga
  solo y se puede cambiar) o **ítems libres** (servicio, envío), moneda (US$, Bs o pesos), descuento % y cuántos días
  vale. **Guardar y ver** muestra la hoja con tu logo; **Guardar PDF** abre la impresión (elige «Guardar como PDF»)
  para mandarlo por WhatsApp. **Datos del negocio:** logo, nombre, RIF/dirección/teléfono y condiciones (pago,
  envíos, garantía), salen en todos. Se marca **Enviado** o **Rechazado**; si el cliente acepta, **Aceptado → pasar a
  venta** crea una venta LOCAL en Borrador con esos productos (los ítems libres van en la nota) y sigue como cualquier
  venta. Uno pasado a venta ya no se edita ni se borra.- **Prender o apagar el Inventario:** no se pierde nada (pagos, guías, despachos y calificaciones siguen igual). Al
  prenderlo, Por confirmar solo pide registrar las ventas **desde ese momento**; las anteriores quedan como estaban en
  Pagos ME. Excepción: las compradas antes pero **todavía en curso** (pago traído sin verificar o guía esperando en
  Despachos) siguen en la lista con la etiqueta **«Comprada antes de activar el inventario»**, para confirmar su pago
  (y registrarla si quieres que se descuente del stock). Si se apagó y se volvió a prender, en Inventario sale un aviso: lo vendido mientras estuvo apagado no se
  descontó, conviene hacer un conteo (hoja de conteo) y cargar las diferencias como ajuste.
- **Inventario:** stock actual de cada producto y sus movimientos. Ajuste de stock: si contaste y está mal, se guarda
  como ajuste.
- **Compras:** **+ Compra** (en un paso: carga el inventario), o por etapas si la empresa lo usa.
- **Promociones:** campañas de MercadoLibre, qué publicaciones pueden entrar y hasta dónde bajar el precio sin
  perder el envío gratis. Precios y campañas se traen con **↻ Actualizar** (arriba, junto a Novedades), línea **Promociones** (y los pesos
  en la línea Pagos, guías y pesos, con la PC de Pagos ME prendida, 1 a 3 minutos); al terminar la página se actualiza
  sola, no hace falta recargar.
  **Aviso de «más del doble» (para no equivocarse de %):** el sistema toma tu **descuento habitual** en cada cuenta
  (el % que más se repite entre tus promos vigentes, ej. 10%; no el más bajo, porque unas pocas promos de ML en 1-2%
  lo distorsionaban). Toda publicación con **más del doble** (más de 20% en ese ejemplo; si lo habitual es 5%, más de
  10%) sale con el descuento en rojo y «⚠ 30% es +200% sobre tu descuento habitual (10%)». El filtro rápido
  **«⚠ Más del doble de lo habitual»** (aparece cuando hay alguna) las junta para revisarlas. Al **agregar** a una
  campaña o cambiar el %, si alguna quedaría con más del doble de lo habitual o de otra promoción de esa misma
  publicación, sale un recuadro rojo «Ojo: más del doble de descuento» con el ejemplo, la fila marcada en rojo y una
  confirmación antes de mandarla.
  **Ver sus promos (N):** en cada publicación en promoción, abre una ventana con **todas** las promociones en las que
  está (nombre, si es de ML o propia, precio, %, cuál cobra hoy y cuáles quedan en espera, y las programadas), con
  **Quitar de esta** en cada una. Cada publicación muestra su **foto miniatura** de MercadoLibre.
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
- **Reportes:** el detalle con Excel. Dos grupos de pestañas: **por fechas** (Ventas, Compras) y **cómo estás hoy**
  (Inventario, En tránsito, Conteos). **Stock se mudó a Inventario → Reponer** (18-11: termina en una compra, no es
  un reporte; los enlaces viejos llevan ahí). El resumen del negocio ya no está aquí: está en el **Inicio**. Ya no
  existen las pestañas Resumen, Top productos ni Atención ML (un enlace viejo lleva al Inicio o a Por producto).
- **Reportes → Ventas** tiene dos vistas: **Por venta** (cada venta con total, costo, comisión y ganancia; arriba la ganancia total con su rentabilidad) y **Por
  producto** (el top completo de las fechas elegidas): podio con los 3 primeros, el resto con barra, ordenar por
  **Unidades, Venta o Ganancia**, cuánto subió o bajó cada uno contra los mismos días justo antes («nuevo» si antes
  no vendía), qué % se llevan los 10 primeros, buscar, totales y **Excel**. Ganancia (con su rentabilidad debajo) solo con el permiso de costos.
- **Inventario → Reponer** (antes Reportes → Stock; toda empresa con Inventario, con permiso de ver Inventario y
  Reportes): pestaña junto a **Stock** dentro de Inventario. Arriba 4 tarjetas que son los filtros: **Reponer** (cuántos y
  cuántos urgentes), **Se están cayendo**, **Parados** (con la plata que tienes sin moverse) y **Recién llegados**.
  Debajo, una frase explica la regla con tus números y cuántos productos «van bien».
  **Reponer** va agrupado en Urgente / Pedir / Ya viene en camino, con: Tienes (y lo que viene en camino), Vendes al
  mes (con * si estuvo agotado: se calcula con los días que tuvo stock), **Te alcanza** (rojo = urgente, ámbar = pedir)
  y **Comprar** (lo sugerido; al marcarlo lo puedes cambiar). Marca productos y en la barra de abajo toca **Crear
  compra** (abre + Compra con los productos, cantidades y último costo; eliges el proveedor) o baja **Excel**/**TXT**.
  **Filtros de Reponer** (se recuerdan): chips **Urgente / Pedir / Ya viene en camino** (prende o apaga cada grupo),
  **Solo agotados** y **Vende al menos N al mes**; muestra «173 → 48» y **Limpiar filtros**.
  **No volver a pedir** (en la barra de abajo, con el permiso de Productos): para lo que ya no vas a comprar. Confirma
  separando: los que tienen stock 0, nada en camino y ninguna venta de ML sin registrar **se desactivan ya** (salen de
  todo el sistema); los demás salen de Reponer y **se desactivan solos** al terminar de venderse. Muestra los títulos de
  sus publicaciones activas en ML (para ver una mala vinculación); las que queden publicadas las avisa Stock en ML.
  Salen de la lista al instante (sin recargar) y abajo aparece el aviso con **Deshacer**. Los números de los chips cuentan
  con los demás filtros puestos.
  Si vuelves a hacer una compra o importación de alguno, vuelve solo a Reponer. Abajo, **No vuelves a pedir** muestra
  quién y cuándo, con **Devolver** (vuelve a Reponer y se reactiva); reactivarlo en Productos también lo devuelve.
  **Se están cayendo**: venden la mitad o menos que antes teniendo stock. **Parados**: vendieron menos de lo que
  dicen tus reglas teniendo stock (candidatos a remate). En ambos, **Desactivar** si el stock está en 0.
  **⚙ Reglas** (cambiarlas pide el permiso «Configurar inventario»): cuánto tarda en llegarte la mercancía, desde cuándo
  es urgente, para cuántos meses comprar, cuántos meses de ventas mirar, venta mínima al mes para reponer, qué es
  «parado» (unidades y meses), cuánto dura «recién llegado» y cuántos meses comparar para «se está cayendo». Botones
  para partir de **Compras locales** (llega en ~1 mes) o **Importación** (~4 meses). Cada empresa tiene las suyas.
- **Ajustes:** tasa del dólar, costos de MercadoLibre (comisión, envío) y otras configuraciones del administrador. La
  **Tabla MercadoEnvíos** se ve ahí pero no se edita: es global y la mantiene El Comerciante Digital.

<!-- VERIFICAR con el dueño: el detalle de Inventario simple de los clientes se completará cuando se graben sus videos -->


---

## 16. Central de aprendizaje y Novedades

*Cómo lo pregunta la gente:* videos, tutoriales, cómo se usa, qué hay de nuevo.

- **Aprendizaje** (menú Aprendizaje): son los **Manuales**. Los videos cortos ya no van en una lista aparte: cada uno está
  dentro de su capítulo del manual (guarda por dónde vas y marca ✓). Los videos nuevos o con versión nueva muestran «Nuevo» durante 14 días.
- **Manuales** (arriba en Aprendizaje): el **Manual de Inventario** (para empresas con Inventario) explica cada pantalla
  —Para empezar, Inicio, Productos, Publicaciones, Ventas, Inventario, Compras, Reportes y Ajustes— con capturas (se
  abren grandes al tocarlas), índice y buscador. Dice lo mismo que el asistente de Ayuda (salen del mismo texto) y
  trae el botón **Ver la guía de Primeros pasos** para volver a mostrar la guía en el Inicio si la ocultaste.
  El **Manual de Automatizaciones** (con cualquiera de sus módulos) explica Cuentas de MercadoLibre, Preguntas, Mensajes,
  Calificaciones y reputación, Stock, Pagos ME, Despachos, Reportador y Mis avisos; cada cuenta ve solo los capítulos
  de sus módulos. El manual es lo que está al día con las pantallas; cada capítulo trae su **video de apoyo** (la
  demostración grabada, con ✓ si ya lo viste), que es opcional y se reproduce ahí mismo dentro del capítulo, sin salir
  del manual; **Ampliar** lo agranda a pantalla (Esc o Achicar para volver) y el avance cuenta igual que en Videos.
  Puede mostrar algún botón distinto.
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

**Botón de Ayuda**: un globo de mensaje abajo a la derecha (al pasar el cursor dice «Ayuda»; en el celular, encima del
menú de abajo). Sale en **Aprendizaje** y sus manuales; para tenerlo en **todas las pantallas**, activa **Ayuda en todo el
sistema** en Aprendizaje (cada persona decide; empieza apagado). Si Soporte te respondió, el botón aparece igual con su
punto rojo, estés donde estés:
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
- **Dentro de tu empresa**, el administrador decide qué ve y qué puede hacer cada persona (**Mi cuenta → Mi equipo → Permisos**).
- **Tu contraseña no la puede ver nadie.** Solo se puede poner una nueva (ver «Olvidé mi contraseña» en la sección 2).
- **MercadoLibre:** el sistema usa la conexión que tú autorizaste para leer y responder en tu cuenta. La puedes
  desconectar cuando quieras en **Cuentas de MercadoLibre**.
- Cualquier otra duda sobre tus datos o la privacidad: escríbenos a **Soporte** y te respondemos personalmente.

---

## 20. Notas ⓘ de cada pantalla

*Cómo lo pregunta la gente:* qué es la i, el circulito de información, la ayuda de arriba, qué significa la ⓘ.

Junto al título de cada sección hay una **ⓘ**: al tocarla se abre (o se cierra) un resumen corto de cómo funciona esa
pantalla. Algunas líneas salen solo si tu empresa tiene ese módulo o tu usuario ese permiso. Lo que dice cada una:

- **Inicio:** arriba, la tarjeta **Para hoy**: columnas **Ventas ›**, **Compras ›** e **Inventario ›** (el título lleva a la sección) con solo las tareas que tienen algo y el botón **+** para crear; la tasa = **Bs/$ BCV · paralelo · diferencial** (tócala para el detalle). Es igual para todos: sale lo que tu usuario puede hacer. El período (Hoy/Mes/Trim./Año/fechas) cambia
  todo lo de abajo, contra el período anterior (**Fechas…** abre desde/hasta). **Te quedó** = ganancia; gráfico
  **acumulado** con pestañas Ventas | Ganancia: color = lo que llevas, gris = lo que llevabas el período anterior a la
  misma fecha; el monto al final de la gris = en cuánto terminó el período anterior. **Pendientes** = tareas del día
  (Ventas: Por confirmar, Por despachar, Borradores; Compras: Por finalizar, en camino; Inventario: sin stock, por reponer). **Ventas registradas** = las procesadas en Ventas (las de ML van abajo por cuenta). «antes N» = cuánto
  era antes, cuando la base es chica (si el período anterior no tuvo ventas, no hay gris ni «antes»). **Diferencial** = cuánto más cara está la tasa paralela que la oficial.
- **Ventas:** **Por confirmar** = ventas de MercadoLibre que faltan registrar (verificas el pago y «Registrar venta»
  descuenta del inventario). **Traer pagos y ventas** trae al instante las nuevas (con Pagos ME también pagos y guías,
  1 a 3 min); además llegan solas cada hora. **Comprobar con el banco** (con Pagos ME) cruza con el estado de cuenta;
  **Ir a Despachos** salta a imprimir las guías. Estados: Borrador · Por despachar · Despachada · Local. **Nueva venta**:
  para una venta local o una de ML que no llegó sola.
- **Compras:** **+ Compra** = lo que le compraste a un proveedor, con su costo; el stock entra al recibirla. Por
  etapas: Pendiente → Pagada → En camino → Recibida → Finalizada (a medias = Parcial). Importaciones: pagos 50/100 %,
  fotos, datos de envío y costos. La lista va por último movimiento.
- **Inventario:** **Bajo** = lo que tienes alcanza para menos de lo que tarda en llegar la mercancía (reglas de
  Reponer); un mínimo escrito a mano manda. Mín y máx en gris = recomendados que se mueven con las ventas. Cada venta
  resta y cada compra recibida suma. **Ajuste de stock** guarda el número real contado. **Reponer** = qué comprar;
  **Stock en ML** = tu stock contra tus publicaciones.
- **Facturas:** las facturas fiscales de las ventas; **Retención pendiente** espera el comprobante del cliente; **Hoja
  de prueba** cuadra el papel; Configuración: número siguiente y corrimiento.
- **Productos:** costo, precio y rentabilidad de cada producto (tócalo para la ficha). **Importar desde ML** crea
  productos desde tus publicaciones. Recargo sobre costo vs Rentabilidad (lo que te queda después de ML, sobre el
  costo). **Costos ML**: comisión y envío del cálculo. Filtros: Costo estimado, Sin costo, Rentabilidad baja y
  **Menos de $3** (Venezuela), cada uno con su arreglo en lote.
- **Mis publicaciones** (Publicaciones): cada fila con su estado (**Activa · Pausar** / **Pausada · Activar**; también
  en lote) y etiquetas solo si algo pide atención (**Stock distinto** dice la diferencia y abre Stock vs inventario,
  **Sin vincular**, **Sin peso**, **En promo** con sus campañas, **Muchas visitas, pocas ventas**) y filtros con esas;
  debajo del título, **N visitas/mes** (últimos 30 días, se traen una vez al día). **«N disp. ✎»** / **«N variantes»**
  abren Cambiar stock (un cuadro por variante, directo a ML). Tocar una abre el editor; lo
  guardado va directo a ML y los cambios en lote van por la cola.
- **Promociones:** campañas de ML, qué publicaciones entran y hasta dónde bajar; antes de entrar, la rentabilidad al
  precio de la promo y si mantiene el envío gratis. **+ Campaña propia**.
- **Stock vs inventario** (Publicaciones): cada producto con todas sus publicaciones; arriba Vende de más (urgente),
  Tienes y no vendes y Por ajustar. **Poner en ML** cambia la publicación; **Corregir stock** cambia el inventario.
  **🔗 N vínculos** abre Vincular de ese producto en un panel, sin salir. Más de 10 a la vez van por la cola. Por publicación, también en Mis publicaciones. «⚠ Desde N u. pierde envío gratis»
  revisa cada cantidad hasta 20 (con la promo) y ofrece **Crear pack**. Ver cambios y Se acabó en el ⋯ del producto;
  Pausar en el ⋯ de cada publicación. En el celular cada producto sale resumido: **Ver ▾** lo abre.
- **Vincular:** une cada publicación (o color/modelo) con su producto, para que cada venta descuente el correcto y Stock
  vs inventario pueda comparar. Lo que falta sale en el botón Vincular de Mis publicaciones y en cada fila.
- **Reportes:** el detalle con Excel: por fechas (Ventas, Compras) y cómo estás hoy (Inventario, En tránsito, Conteos).
  Ventas → Por producto = el top y cuánto subió o bajó. La ganancia, solo con permiso de costos. El resumen está en el
  Inicio; qué comprar, en Inventario → Reponer.
- **Finanzas:** de toda la organización (Venezuela y Colombia, en dólares): Movimientos, Cierre mensual, Capital /
  Liquidez (aparte las reservas) y Costos ML (envíos contra lo facturado).
- **Preguntas:** abre una para ver la publicación y lo que ese comprador preguntó antes; responde escribiendo, con
  respuesta rápida o **Proponer con IA** (no sale sin que lo revises; con confianza baja te dice qué revisar).
  Historial = lo respondido; Configuración (administrador): Mi IA, datos de productos, respuestas rápidas.
- **Mensajes:** leer aquí no lo marca leído en ML (se marca al responder o tocar el sobre). **Por atender**: Responder,
  Pedir pago y Escribirle (más de 12 h sin mensajes). **Atendidas** con buscador. Recordatorios y Pedir calificación.
  **Configuración**: Al recibir compra (hasta 2 mensajes), Mi IA, Respuestas rápidas y Datos de productos (los mismos de Preguntas).
- **Stock** (Automatizaciones): lo vendido en los últimos 30 días que se agotó o está por agotarse; el aviso cuenta 7
  días; se revisa sola cada hora y con ↻ Actualizar (arriba) como mucho cada 10 min. Con inventario, enlace a Stock vs inventario.
  «⚠ desde N u. sin envío gratis · pack»: comprando varias pierde el envío gratis (el pack se arma en Stock vs inventario).
  «Repartir»: el producto está en varias publicaciones; abre un panel a la derecha con cada una y lo que repartiste de tu inventario.
  «Vincular por color»: publicación vinculada entera con colores; abre un panel a la derecha para elegir el producto de cada color y luego su stock.
- **Pagos ME:** **Traer pagos y guías** (la PC trae de MercadoEnvíos pagos, guías y ventas nuevas, 1 a 3 min; también
  sola durante el día). Sin inventario se verifica cada pago aquí (uno a uno o con Comprobar con el banco); con
  inventario se verifica en Ventas → Por confirmar y aquí queda la conexión y el historial. Las guías pagadas pasan
  solas a Despachos. La línea de arriba dice si la PC está lista; ⚙ Conexión: cuentas, programa, extensión y PC.
  Si una cuenta no toma la traída, el aviso dice qué hacer (extensión trabada: F5 o cerrar y abrir ese Chrome; Chrome
  sin señal: abrirlo y revisar que el Asistente diga Conectado).
- **Despachos:** arrastra los PDFs de MercadoEnvíos (o entran solos desde Pagos ME) y forman un lote; revisa cada
  etiqueta y **Generar PDF** (4 por hoja A4, o 1 por página en «Térmica 10×15», se recuerda en el equipo; imprimir a «Tamaño real»). Una guía impresa no sale dos veces («Ya impresa»);
  **En espera** la aparta. Al final del día, **Cerrar jornada** → Manifiesto por transportista (y cola del Reportador).
- **Reportador:** reporta las guías impresas en Despachos al cerrar la jornada (las de TEALCA, al escribir la guía
  final); lo impreso directo en ML no se entera. Trabaja en el servidor (se puede cerrar la pantalla) y revisa la
  conversación para no repetir. **Vista previa** no manda nada. ML corta mensajes largos y rechaza links de Facebook.
- **Calificaciones:** Concretada / No concretada / Revisar (decides tú), Próximas (en tu espera) y Automática si la
  tienes prendida; los textos cambian según si usas Despachos, Reportador y Pagos ME.
