# Manual del Radar de Oportunidades · El Comerciante Digital

<!-- INTERNO (se quita antes de mandarlo a la IA, lib/ayuda.ts): fuente del asistente de ayuda del Radar.
Sale de la pestaña Ayuda del Radar (AnalisisMercadoML/web/app/ayuda/page.tsx): si cambia esa página, actualizar este
archivo en el mismo cambio. Última revisión: 30-10-2026. -->

**Qué es:** el Radar muestra los productos que más se venden en MercadoLibre Venezuela, categoría por categoría,
con el **precio real** (pasado a dólar paralelo) y señales de demanda, para decidir qué importar o revender. Se
entra en radar.elcomerciantedigital.com con el usuario y la contraseña de El Comerciante Digital.

*Cómo lo pregunta la gente:* qué vendo, qué importo, productos ganadores, cómo busco, filtros, sellos, margen,
ganancia, costo, Alibaba, competencia, tendencias, Pro, gratis, prueba, no puedo entrar, contraseña.

## 1. La idea: el precio real, no el que ML muestra

MercadoLibre Venezuela publica los precios en dólares, pero cobra en bolívares
usando la **tasa oficial del BCV**. En cambio el dólar con el que tú pagas tu
mercancía —compres donde compres— es el **paralelo**. Esa diferencia hace que
un producto que aparenta costar $50 en realidad te deje mucho menos.

Precio real = Precio en ML × (Tasa oficial ÷ Tasa paralelo)

El Radar recalcula esto **todos los días** con la tasa fresca, así que el
“Precio real” que ves en cada tarjeta es lo que de verdad entra a tu bolsillo.
Arriba a la derecha ves las dos tasas del día y un botón **↻** para
refrescarlas cuando quieras.

> Cada tarjeta muestra dos precios. **Precio real** es el importante.
Debajo, **ML** es lo que el cliente paga hoy en la página (a tasa oficial); si
tiene descuento, al lado verás el porcentaje (**· −37%**) y, al pasar el mouse,
el precio de lista.

## 2. El flujo de trabajo, en 4 pasos

El Radar no te dice “vende esto”. Te ordena una cola de trabajo para que tu
tiempo se vaya en revisar los productos con más chance, no los primeros que
aparezcan.

- **Filtrar.** Marca **Sostenido** para que el catálogo pase de casi
40 mil productos a los que llevan meses vendiendo. Es el mejor punto de
partida para importar: demanda probada, sin depender de una moda.

- **Buscar el costo.** Lo más rápido es arrastrar la foto del producto a la
extensión **Alibaba Lens**, que te devuelve proveedores, precio y MOQ. Pero
el costo puede salir de donde tú compres: otro portal, un proveedor propio o
una cotización.

- **Anotar.** Teclea el costo y el envío en la parte baja de la tarjeta
(el MOQ va en la ficha). El margen se calcula solo, en vivo.

- **Marcar.** Ponle un estado (Ganador, Investigando, Descartado) para no
volver a estudiar lo mismo el mes que viene.

> El paso 2 es manual a propósito. Un bot contra Alibaba haría que marquen tu IP y
te degraden la propia extensión Lens, que es la mejor herramienta que tienes.

## 3. Configuraciones generales (botón Cálculo, arriba)

Son los valores **por defecto** con los que se calcula el margen de todos los
productos. Están en el botón **Cálculo** de la barra de arriba, que muestra los
vigentes (ej. «Premium 12% · Envío $0.65»); tócalo para cambiarlos. Se guardan solos.
Arriba también están las pestañas **Catálogo · Tendencias · Ayuda** y, en tu
inicial, el menú de tu cuenta (Salir).

M. Envíos | Lo que te cuesta el envío por unidad vendida. | Depende de cuántas ventas haces al mes: Gratis (0–2), $1.30 (3–50), $1.04 (51–150), $0.65 (151+).
Publicación | La comisión que ML te cobra por vender. | Clásica 10% o Premium 12%. Premium aparece mejor posicionada y permite cuotas.

Cada interruptor **apaga** ese costo. Si lo apagas, deja de restarse del
margen (comisión 0%, envío $0). Sirve para simular escenarios.

> Puedes sobreescribir ambos **producto por producto**: abre la ** Ficha**de una
tarjeta (el enlace “Ficha ›” o un clic en la tarjeta) y ahí verás los mismos dos ajustes. Un producto pesado puede llevar otro
envío sin que toques el resto del catálogo. El enlace “volver al general” lo
regresa a heredar el valor de arriba.

## 4. Los filtros, uno por uno

Los filtros se aplican **solos** al tocarlos, sin botón, y se combinan entre
sí. **Limpiar** los borra todos. En el **celular** el buscador queda siempre a
la vista y el resto se abre con el botón **Filtros**, que muestra cuántos tienes
activos.

> **Qué tienes según tu plan.** En **Gratis** filtras con **Buscar**,
**Precio desde / hasta**, ** Estado**y el ** árbol de categorías**— o sea,
navegas el catálogo tú mismo. Todo lo demás de esta sección (acotar por ventas,
reordenar, y el bloque **Señales** que arma la lista corta) es **Pro**. Los controles se ven apagados con la
marca PRO, no escondidos, para que sepas qué hay del otro lado. Sin reordenar, el
catálogo sale por **más vendidos**, que es el orden por defecto.

Los que acotan la búsqueda

Buscar | Palabras dentro del título, en cualquier orden y sin importar tildes: «led moto» encuentra «Faro Led U7 … Moto», y «bateria» encuentra «Batería». Escribe y espera medio segundo, se aplica solo.
Ventas | De aquí para arriba: +500 o más, +1.000 o más… Si quieres SOLO un escalón (para cazar nichos que aún no despegaron), está en Señales → Escalón exacto.
Precio desde / hasta | Sobre el precio REAL (el de paralelo), no el que muestra ML.
Ganancia posible | Deja solo lo que te puede dejar al menos $1, $3, $5 o $10 por unidad. Si ya cargaste el costo, usa tu margen real; si no, el techo (ver «Cómo se calcula el margen»). Sirve sobre todo para sacar de la vista lo que no puede dejarte plata.
Estado | Los cuatro chips de tu cabina. Puedes marcar varios a la vez.
Categorías (izquierda) | El árbol lateral. Las categorías con menos de 50 productos se agrupan en «Otros».

> Las ventas de ML vienen **en escalones**: solo existen +50, +100, +500, +1.000,
+5.000 y +10.000. No hay números intermedios, por eso el selector muestra
justamente esos.

Los que buscan oportunidades

Estos son el corazón del Radar. Cada uno mira un **eje distinto**: que
aguante, que lo busquen, que esté subiendo, que el precio se esté moviendo.

### Sostenido — Lo que aguanta, no lo que pica. Empieza por aquí.

Productos que llevan **tres barridos seguidos** en el mercado y siguen
vendiendo (+500). No aparecieron ayer ni dieron un salto: llevan meses
funcionando.

> Es el filtro pensado **para importar**. Entre que le pides al proveedor y te llega
la mercancía pasan semanas: una moda que picó puede estar muerta cuando aterriza
el pedido. Lo que lleva tres meses vendiendo es mucho más difícil que se apague
justo en ese hueco. Y a diferencia de los filtros de alza, elegir lo sostenido
**no te empuja hacia productos con menos margen**.

Es lo **contrario** de En alza, y por eso son filtros distintos: busca
el que despega, busca el que no se cae. Tres de cada cuatro sostenidos no
tienen ninguna señal de alza — son productos que el radar antes no te mostraba
por ningún lado.

### Visitas al mes · Preguntas al mes — Movimiento REAL, medido. No una deducción.

Las ventas que muestra MercadoLibre van en **escalones** (+50, +100, +500…):
una publicación en «+100» no cambia de número hasta vender 400 más, así que
con eso solo no se ve si un producto se sigue moviendo. Estos dos filtros usan
datos **medidos** de cada publicación en los **últimos 30 días**:

- **Visitas al mes**— cuánta gente entró a ver la publicación (100, 300, 1.000 o 3.000 o más).

- **Preguntas al mes**— cuántas preguntas recibió (3, 10 o 30 o más). Quien pregunta suele estar a punto de comprar.

> Sirven sobre todo para **descartar**. Un producto puede decir «+500 vendidos»
y llevar meses casi sin visitas ni preguntas: vendió antes, ya no. Con 
**Visitas: 100 o más** te quedas solo con lo que hoy tiene movimiento.

> Se miden una vez al mes y **solo en los productos con alguna señal**: vigentes con
+500 ventas, Sostenidos, En alza, Frescos, En tendencia o que bajaron de precio. Al usar estos filtros, los productos
que no están en esa lista salen del resultado. Las visitas cuentan gente que
miró, no ventas: un producto caro puede tener muchas visitas y vender poco.

### Candidatos fuertes — Lo que está despegando. Mira el margen con lupa.

Cruza **los tres ejes a la vez**: que la gente lo busque ahora (tendencia
vigente), que esté subiendo (emergente o fresco) y que ya venda de verdad. Es
la lista de lo que más se está moviendo en el mercado.

> Lo que más se busca y más se vende es también lo que **más vendedores
atrae**. En la práctica, los productos con suelen terminar con 
**menos margen** que el resto una vez que buscas el costo. Úsalo para ver
hacia dónde va el mercado, no como atajo a la ganancia: el margen lo decides tú
con el costo real.

Vive dentro del selector **Oportunidad**, junto con En alza, porque el uno
está contenido en el otro: **todo** candidato fuerte está en alza. Son dos
niveles de exigencia de lo mismo, no dos cosas distintas — por eso eliges uno,
no los dos.

Al elegirlo, **Demanda** se apaga sola: no es un error, es que este filtro ya
la incluye. Marcarla encima no cambiaría ni un resultado.

### Demanda — ¿La gente lo está buscando?

Un selector con tres niveles, de más amplio a más exigente:

- **Cualquiera**— sin filtro de demanda.

- **Con tendencia**— el producto apareció por un término que ML destaca como tendencia en su categoría, ** y ML lo sigue destacando**en el último barrido. Cuando ML saca el término de sus tendencias, el sello se apaga solo.

- **Confirmada en Google**— además, ese término ** también sube en Google Trends Venezuela**. Doble señal: no es solo ruido interno de ML, la gente lo busca de verdad.

Es una escalera: cada nivel es un subconjunto del anterior, por eso es un
selector y no casillas sueltas.

### En alza — ¿Está subiendo AHORA?

Agrupa dos señales distintas de movimiento reciente:

- **Emergente**— cruzó un escalón de ventas, o dio un ** salto grande de
posición**en el listado (se redujo al menos a la mitad y llegó a la
primera página). El umbral es exigente a propósito: la posición en ML se
mueve mucho sola, y una mejora pequeña es solo ruido.

- **Fresco**— publicación ** nueva**que ya vende bien para el poco
tiempo que lleva. Sirve para pescar lo que acaba de salir, antes de que se
llene de vendedores.

Es el nivel **amplio** del selector **Oportunidad**; Candidatos fuertes
es el nivel exigente del mismo selector.

### Subiendo (medido) — Visitas y preguntas creciendo de verdad.

La tercera opción del selector **Oportunidad**. Mientras En alza
**deduce** el movimiento de la posición en el listado, esta lo **mide**:
las visitas de los últimos 30 días frente a los 30 anteriores, y las preguntas
del último mes y medio frente al mes y medio anterior. Si las dos crecen (o una
crece y la otra se mantiene), el producto está subiendo.

Como las preguntas guardan su fecha desde siempre, la tendencia se ve
**desde la primera medición**: no hace falta esperar meses de historia.

### Bajó de precio — Alerta, no oportunidad.

Productos cuyo precio cayó **10% o más** desde la medición anterior. Suele
significar que entró competencia y está peleando por precio.

> Míralo sobre todo en tus **Ganadores**: si a uno le bajó el precio, el margen
que calculaste con el precio viejo ya no es el real. Ojo también con caídas
enormes (−80%), que suelen ser publicaciones carnada, no competencia.

### Solo vigentes — Esconde lo que ya no está.

Cada barrido recorre el mercado y vuelve a ver los productos. Los que **ya no
aparecen**siguen guardados en el catálogo, pero su precio quedó congelado en
el último barrido que sí los encontró. Este filtro los oculta.

> Importante para decidir compras: **el margen se calcula con el precio**. Si el
precio es de un barrido anterior, el margen que ves puede no ser el real —
y la publicación quizá ni siga publicada. Enciéndelo antes de sentarte a
investigar proveedores, para no gastar trabajo en productos que ya no están.

Si ya marcaste **Sostenido**, este se apaga solo: un producto sostenido
estuvo en el último barrido por definición, así que ya es vigente.

Ordenar por

Más vendidos | Por defecto. Los de mayor volumen acumulado.
Más nuevos | Publicaciones recientes primero. Importante: el orden por ventas HUNDE lo nuevo (lleva poco tiempo vendiendo). Este es el que saca a flote lo fresco.
Precio real ↑ / ↓ | Del más barato al más caro, o al revés, siempre sobre el precio real.
Más visitas | Lo que más gente está mirando este mes, medido. Los productos sin medición van al final.
Mejor margen | Solo tiene sentido con productos que ya tengan costo cargado: crúzalo con los estados Investigando o Ganador.

## 5. Los sellos de cada tarjeta

Son las etiquetas de colores arriba del título. Te dicen por qué ese producto es
interesante sin tener que abrirlo. Para que la tarjeta se lea rápido se muestran
**como máximo dos**, por orden de importancia ( Sin ver, Sostenido, / ,
, tendencia); si tiene más, verás **+1** o **+2** y al pasar el mouse te dice
cuáles son.

Fresco | Publicación nueva que ya vende bien para su antigüedad. Si un producto es fresco Y emergente, se muestra este, porque «es nuevo» es el dato menos obvio.
Emergente | Subió de escalón de ventas o dio un salto grande de posición.
Sostenido | Lleva tres barridos seguidos vendiendo. Demanda que aguanta, no un pico. La apuesta de menor riesgo para importar.
En tendencia | Salió por un término que ML destaca y que lo sigue destacando en el último barrido (si ML lo quita, el sello se apaga). Si además trae , Google Trends confirma que sube; significa que las búsquedas están cayendo.
−15% | El precio bajó ese porcentaje desde la medición anterior.
Sin ver desde… | El último barrido NO volvió a encontrar esta publicación. Puede estar dada de baja o haber caído del listado. Su precio (y el margen) son del mes que indica: confírmalos en ML antes de comprar. Es una advertencia, no una oportunidad — por eso va en gris.
Línea de visitas | Debajo de las ventas: visitas y preguntas de los últimos 30 días, medidas. El punto de color es el termómetro: verde = activo (100+ visitas o 3+ preguntas al mes), ámbar = tibio, rojo = muerto (casi sin visitas y sin preguntas en 3 meses). «↑ subiendo» / «↓ bajando» compara contra el período anterior. Solo aparece en los productos medidos.
Triángulo arriba / abajo | Junto a las ventas o la calificación: subió o bajó respecto a la medición anterior.

> El catálogo se mide con un **barrido mensual completo** de MercadoLibre
Venezuela. Los sellos de movimiento (, , ) comparan la
medición de hoy contra la del barrido anterior, así que un producto recién
descubierto necesita **dos mediciones** para poder mostrarlos — si no los trae,
muchas veces es porque todavía no hay con qué compararlo. Y lo que el último
barrido ya no encontró se queda igual en el catálogo con el sello :
**nunca se borra nada**, solo deja de actualizarse su precio.

## 6. La cabina: los cuatro estados

La parte baja de cada tarjeta es tu espacio de trabajo. Es **privado**: cada
usuario tiene el suyo, aunque el catálogo sea el mismo para todos.

Pendiente (reloj) | Por defecto. Aún no lo has mirado. (En la tarjeta y en el filtro cada estado es un ícono; el activo o los marcados muestran su nombre.)
Investigando (lupa) | Está en investigación: parece buena opción, pero le faltan datos para determinar si será ganador o no. Se pone solo al teclear un costo.
Ganador (trofeo) | Tiene margen y lo quieres traer.
Descartado (círculo tachado) | Ya lo estudiaste y no sirve. Guárdalo aunque no lo vayas a comprar: el mes que viene te evita volver a investigar lo mismo.

> La lista **no se reordena mientras editas**. Aunque cambies un estado y el
producto ya no encaje en el filtro activo, la tarjeta se queda quieta hasta que
cierres el panel o recargues. Así puedes terminar de anotar sin que se te mueva
bajo el cursor.

## 7. Cómo se calcula el margen

Margen = Precio real − Comisión ML − Envío − Costo puesto en Venezuela

El **costo puesto** es lo que te sale el producto ya en tu mano: lo que pagas
por la unidad **más** lo que cuesta traerla. Los dos son montos en dólares que
tecleas tú en la parte baja de la tarjeta.

> **Ojo, hay dos “envíos” y son cosas distintas.** El **Envío $** de aquí
abajo es lo que te cuesta **traer** una unidad desde tu proveedor. El
**M. Envíos** del botón Cálculo es lo que te cuesta **mandársela al
comprador**dentro de Venezuela. Van en direcciones opuestas y los dos restan
del margen.

Costo $ | Lo que te cuesta una unidad con tu proveedor. Da igual de dónde salga el número: Lens, otro portal o una cotización.
MOQ (en la ficha) | Cantidad mínima que exige el proveedor. No entra en el cálculo; es para que sepas cuánto tienes que comprar. Con el MOQ, la ficha te dice cuánto ganarías en ese lote.
Envío $ | Lo que te cuesta traer UNA unidad hasta destino. Acepta decimales (también menos de $1). Sumado al costo da el costo puesto, que es sobre lo que se calcula el margen.

> El margen que ves es una estimación con los datos que TÚ cargaste. No incluye
aduana, impuestos ni tu tiempo. Trátalo como un semáforo para priorizar, no como
tu utilidad final.

Antes de tener el costo: el techo

Mientras un producto no tiene costo, en el lugar del margen verás el 
**techo** en gris (**hasta +$3,13 · máx. por unidad**): lo máximo que te dejaría cada unidad si lo consigues muy bien —
puesto en tu casa, flete incluido, a **un cuarto del precio real**. Ya descuenta
tu comisión y tu envío del botón Cálculo.

Es un techo, no una promesa: con tu costo real el margen va a salir **más bajo**,
nunca más alto. Por eso sirve para descartar. Si sale en **ámbar**, ni en el mejor
caso deja $1 por unidad.

> **Por qué importa:** la comisión y el envío cuestan casi lo mismo en un producto
de $4 que en uno de $40. Comprar a un tercio del precio suena igual de bueno en los
dos, pero en el de $4 esos costos fijos se comen casi toda la ganancia. Antes de
gastar tiempo buscando proveedor, mira el techo.

## 8. Panel de competencia

El botón verde **Competencia** de cada tarjeta (la acción principal) busca productos parecidos en
**todo el catálogo** y calcula qué margen tendrías tú si vendieras al precio
de cada competidor, usando tu mismo costo. Sirve para saber rápido si alguien ya
está vendiendo por debajo de lo que tú podrías.

No compara títulos completos: detecta las **palabras distintivas** (ignora las
genéricas del rubro) y por eso te muestra “comparte: bomba, aire, inflador”. Si
nada supera el mínimo de parecido, prefiere decir **“Sin competencia clara”**
antes que rellenar con ruido.

Arriba tienes el **resumen**: cuántos venden más barato que tú y cuál es el
precio más bajo. La lista viene **ordenada por precio**, del más barato al más caro.
Si todavía no anotaste tu costo, un solo aviso te lo recuerda (el margen contra cada
uno aparece apenas lo anotes).

Los **posibles packs** (una caja de 10 cuando tú vendes una unidad) salen marcados
y más tenues, y no cuentan en el resumen: se detectan porque cuestan más de 3 veces lo
normal o porque su título dice caja, pack, x10… El botón **✕** descarta para siempre
un resultado que no sea competencia real.

> **En el plan Gratis el panel se abre igual**, y te dice ** quiénes**te
compiten y **qué palabras** comparten con tu producto — que es lo que sirve para
saber si de verdad estás ante el mismo producto. Lo que no ves es **a cuánto vende
cada uno**, el margen que te quedaría con ese precio, ni los botones «usar este
precio» y ✕. Puedes hacer lo mismo a mano: abre cada publicación, mira el precio en
MercadoLibre y anótalo abajo con **¿Viste uno más barato allá?**.

Ver todos en MercadoLibre

El panel te muestra los competidores **que están en el catálogo**— los que el
barrido alcanzó a capturar. En MercadoLibre están **todos**, incluidos los que
venden poco: esos no te quitan volumen, pero **sí marcan el piso de precio**,
porque el comprador los ve igual que a ti.

El botón **Ver todos en MercadoLibre** abre esa búsqueda en vivo. El término no
es el título completo (que arrastra el ruido de cada vendedor) sino las
**palabras que más competidores comparten**, o sea el nombre genérico real del
producto.

> Allá los precios están a **tasa oficial**, no real. Sirven para ver quién es el
más barato, pero el número que ves **no** es tu precio real — para eso vuelve
al catálogo.

> Cuando usas ese botón, el Radar anota qué término necesitaste consultar afuera.
No se comparte con nadie ni se muestra en ninguna parte: sirve para detectar en
qué zonas el catálogo se queda corto y ampliarlas en los próximos barridos.

Si el más barato no está en el catálogo

Es lo normal cuando sales a mirar en MercadoLibre: el barrido no captura a
todos, sobre todo a los que venden poco. Debajo del botón hay una línea para
**anotarlo a mano**: el precio y, si quieres, el enlace.

> Copia el precio **tal como aparece en MercadoLibre**. No hagas ninguna
cuenta: el Radar le aplica la conversión a dólar real igual que a todos los
demás precios. Si tecleas $3,80 de ML, el margen se calcula sobre los ~$3,20
que de verdad entran.

Funciona igual que elegir uno del catálogo — el margen se recalcula contra ese
precio — pero con una diferencia que conviene tener presente: **ese número no
se actualiza nunca**. El del catálogo sí, porque el barrido vuelve a pasar por
esa publicación cada mes. El tuyo es una foto del día que lo anotaste.

Por eso se muestra con su antigüedad (manual · hace 3 d) y, pasado un mes,
el sistema te avisa que conviene re-verificarlo. El enlace guardado es para
hacerlo de un clic.

Usar el precio de un competidor

Cada competidor tiene un botón **usar este precio**. Al tocarlo, el margen de
tu tarjeta pasa a calcularse contra **ese** precio en lugar del tuyo.

La razón: si alguien vende más barato que tú, ese es el precio al que
realmente tendrías que vender para competir. El margen calculado sobre tu propia
publicación está **inflado**, y lo normal es descubrirlo tarde — después de
haber hecho todo el trabajo de buscar el costo.

Cuando está activo, la tarjeta lo dice en ámbar (margen sobre $X de la
competencia) y puedes volver a tu precio con **volver al mío**. No se
guarda el número sino **cuál competidor elegiste**: si mañana él baja más, tu
margen se actualiza solo; si su publicación desaparece, vuelve a tu precio.

> El orden **Mejor margen** también usa este precio. Es a propósito: si un
producto se ordenara arriba por un margen que su propia competencia ya
desmintió, el orden te estaría mintiendo justo donde más confías en él.

## 9. La página de Tendencias

la pestaña **Tendencias** (arriba) muestra lo que la gente **busca**,
organizado por categoría. Es la cara de la demanda: mientras el catálogo te dice
qué se vende, esto te dice qué se busca.

- **Búsquedas que más crecieron**— lo que viene subiendo. Lo más valioso.

- **Tendencias más populares**— lo que más se busca ahora mismo.

- Un término en gris con la etiqueta **pendiente** aún no se ha procesado; vuelve más adelante.

- Toca cualquier término para ver los productos del catálogo que le calzan.

- El **buscador** de arriba filtra al instante: escribe un término (ej. «control»)
o una categoría y quedan solo los que coinciden.

- Debajo tienes el **índice de categorías**: tócalo para saltar directo a una. Cada
categoría dice cuándo se actualizó; en ámbar, las que este mes aún no se volvieron a
revisar (más de 35 días).

> Esta página es **Pro**. En Gratis el enlace del menú aparece con la marca PRO y
te trae a esta explicación en vez de abrirla.

## 10. Recetas rápidas

Combinaciones que resuelven una intención concreta.

Marca **Sostenido** y ordena por **Más vendidos**. Lo que lleva meses
vendiendo, sin depender de una moda. Trabájalo de arriba hacia abajo buscando
el costo.

Pon **Oportunidad: Candidatos fuertes**. Es lo que más se mueve ahora
mismo — y por eso mismo lo que más competencia atrae. Revisa el margen con
cuidado antes de enamorarte de uno.

Ordena por **Más nuevos** y pon **Oportunidad: En alza**. Lo recién publicado
que ya muestra movimiento.

En **Ventas** elige **«Solo +50»** o **«Solo +100»**, y pon
**Demanda: Confirmada en Google**. Poca venta acumulada pero búsqueda real
creciendo.

Pon **Visitas al mes: 100 o más** junto con el filtro que uses. Saca lo que
acumuló ventas hace tiempo pero hoy nadie mira. Si además ordenas por 
**Más visitas**, arriba queda lo que más movimiento real tiene.

Pon **Oportunidad: Subiendo (medido)** y **Preguntas al mes: 3 o más**.
Visitas y preguntas creciendo, con gente preguntando para comprar.

Filtra por estado **Ganador** y marca **Bajó de precio**. Los que salgan
necesitan que recalcules el margen.

Marca **Sostenido** y ordena por **Más vendidos**. Productos que llevan
meses vendiendo, no modas. Si además le sumas **Demanda: Con tendencia**,
tienes lo que aguanta y la gente sigue buscando.

Marca **Solo vigentes** junto con el filtro que uses. Así no gastas horas
de Lens en publicaciones que el último barrido ya no encontró y cuyo precio
quedó viejo.

Marca los estados **Investigando** y **Ganador** y ordena por **Mejor margen**.
Solo lo que ya investigaste, de mejor a peor.

Elige la categoría en el panel izquierdo y pon **Demanda: Con tendencia**.
Dentro de ese rubro, lo que la gente busca.

## 11. Planes: Gratis y Pro

La diferencia cabe en una frase: **en Gratis buscas tú; en Pro el Radar busca
por ti.**

Con **Gratis** tienes el catálogo entero con el **precio real** a dólar
paralelo, el **buscador**, las ** categorías**y tu ** cabina completa**.
Los productos salen ordenados por los que más venden. Y los **sellos de las
tarjetas**( ) se ven igual: cuando te encuentres un producto,
sabes qué vio el Radar en él.

**Y esto ya es muy distinto a buscar en MercadoLibre.** Allá te toca abrir
publicación por publicación sin saber cuál vende: la mayoría de lo que ves está
quieto, sin una sola venta. Acá **ese filtro ya está hecho**— el Radar solo
trae productos con **ventas y rotación reales**, y encima con el precio pasado
a dólar paralelo, que es la plata que de verdad te queda. Empiezas a trabajar
sobre una lista que ya mueve, no sobre un catálogo lleno de ruido.

Lo que **Pro** agrega es la parte que te ahorra la tarde: poder **acotar y
reordenar**el catálogo (ventas, precio, orden) y los ** ejes que arman la
lista corta**— Candidatos fuertes, Sostenido, En alza, Demanda,
Bajó de precio, Vigentes. Más los precios del **panel de Competencia** y
la página de **Tendencias**.

Catálogo con precio real | Todo | Todo
Buscador y categorías | Sí | Sí
Sellos de las tarjetas () | Sí | Sí
Techo de ganancia en cada tarjeta | Sí | Sí
Tu cabina: costos, notas, estados | Sin límite | Sin límite
Filtrar por precio | Sí | Sí
Filtrar por ventas y ganancia posible · reordenar | — | Sí
Candidatos · Sostenido · En alza · Demanda | — | Sí
Bajó de precio · Solo vigentes | — | Sí
Visitas y preguntas al mes · Subiendo (medido) · Más visitas | — | Sí
Competencia: ver quiénes son | Sí | Sí
Competencia: a cuánto vende cada uno y tu margen | — | Sí
Página de Tendencias | — | Sí
Tiempo de uso y búsquedas | Sin límite | Sin límite

> **Tu trabajo nunca se toca.** Los costos, las notas y los estados que
guardes son tuyos para siempre, sin límite de cantidad y sin importar el plan
que tengas. Si algún día pasas de Pro a Gratis, conservas todo: lo único que
dejas de ver son las señales. Y como el filtro de **estado** es libre, sigues
encontrando lo que ya investigaste con **Investigando** y **Ganador**.

> En Gratis, el panel de **Competencia** sí se abre y te dice **quiénes** te
compiten y **qué palabras** comparten con tu producto. Lo que no ves es a
cuánto venden ni el margen que te quedaría con ese precio — pero puedes abrir
cada publicación, mirar el precio en MercadoLibre y anotarlo a mano ahí mismo.
Con **Pro** tienes esos precios ahí mismo, junto al margen que te quedaría
con cada uno: sin salir de la página ni buscar nada a mano.

> Se abrirá una **ventana** en la que el Radar queda completo para todos por
unos días, y **se anunciará con anticipación en nuestra comunidad**. Se apaga
sola. Es la forma de probarlo entero sin pagar.

> **Si entraste por un programa o una prueba** (por ejemplo, el **Programa Despegue** o
la **prueba de un día**), tu Radar abre ** solo los días de tu programa o tu prueba**: ese día, de 00:00 a 23:59 (hora de Venezuela),
lo tienes **completo**, como Pro. Los demás días no se puede entrar; si lo intentas,
te dice cuándo abre. Aprovecha el día: trae la lista de lo que te tocó buscar esa semana.
Lo que guardes en tu cabina queda guardado para el siguiente día de Radar.

## 12. Tu cuenta: entrar con tu usuario

Tu cuenta es la de **El Comerciante Digital**: la misma para el Radar y para los
demás productos que tengas (por ejemplo, el inventario). Entras con tu 
**usuario** y tu contraseña; si escribes tu correo en lugar del usuario, también
te deja pasar.

Tu plan, tus productos en la cabina y tus costos siguen siendo tuyos dentro del
Radar: la cuenta única no cambia nada de eso.

**¿Olvidaste tu contraseña o tienes una duda?** Toca el botón de **Ayuda** (el globo de mensaje abajo a
la derecha, en todas las pantallas): pregúntale al asistente o escríbenos en Soporte (también
por Telegram). Te respondemos de lunes
a sábado, de 8am a 6pm (hora de Venezuela). Para cambiarte la contraseña te pediremos
tu usuario.

## 13. Ayuda y soporte

- Botón de **mensaje** abajo a la derecha (al pasar el cursor dice «Ayuda»): preguntas frecuentes, una caja para
  preguntar (responde un asistente con este manual) y **Soporte** para escribirnos a una persona, con capturas.
  Si quedaste dentro de una conversación, «↺ Empezar de nuevo» vuelve a las preguntas frecuentes.
- **Horario:** lunes a sábado, 8:00 am a 6:00 pm (hora de Venezuela). También por Telegram: t.me/elcomerciantedigital.
- **Olvidé mi contraseña:** escríbenos a Soporte con tu usuario y te la cambiamos (no hay recuperación por correo).
- **Prueba de un día / programa:** el Radar abre solo los días de tu prueba o programa, completo como Pro, de 00:00 a
  23:59 (hora de Venezuela). Los otros días no deja entrar y te dice cuándo abre. Lo que guardes en tu cabina queda.
- **Automatizaciones para MercadoLibre** (otro producto de El Comerciante Digital: preguntas con IA, mensajes,
  guías, calificaciones): si vendes en MercadoLibre Venezuela y quieres probarlas, escríbenos (15 días gratis).

## 14. Privacidad y tus datos

*Cómo lo pregunta la gente:* privacidad, mis datos, quién ve mis costos, ven lo que busco, es seguro.

- **Tu cabina es privada:** tus costos, envíos, estados y notas solo los ves tú. El catálogo es el mismo para todos.
- **Tu contraseña no la puede ver nadie.** Solo se puede poner una nueva (escríbenos a Soporte).
- Cualquier otra duda sobre tus datos o la privacidad: escríbenos a **Soporte** y te respondemos personalmente.
