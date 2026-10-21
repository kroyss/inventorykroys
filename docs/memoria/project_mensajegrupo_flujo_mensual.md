---
name: project-mensajegrupo-flujo-mensual
description: "Proceso mensual (día 15) de cruce ventas+calificaciones de Mercado Libre por cuenta, en D:\\MensajeGrupo, para escribirle a compradores sin repetir contactos entre meses"
metadata: 
  node_type: memory
  type: project
  originSessionId: 67154fac-9208-4672-8e18-63f91268f470
  modified: 2026-09-16T22:57:48.497Z
---

Cada 15 de mes, Marcos cruza el listado de "Ventas" (últimos 2 meses) contra el listado de
"Calificaciones" de Mercado Libre, por cuenta ML, para identificar compradores que compraron
Y dejaron reseña, y así poder escribirles por la mensajería de ML agradeciendo/gestionando la
calificación. Esto es independiente del repo `kroys_inventory` (Syncsora Inventory) — vive en
`D:\MensajeGrupo`, no en el proyecto Next.js.

**Cuentas ML del negocio:** `SOLUCION-MC` y `PIKEKE` (ver también en CLAUDE.md del repo
`kroys_inventory`, sección "Cuentas ML por país"). Cada cuenta tiene su propia carpeta con
compradores y calificaciones completamente distintos — no se mezclan.

**Navegador por cuenta (cada cuenta ML está logueada en un navegador distinto en la PC de Marcos):**
- `SOLUCION-MC` → Firefox
- `PIKEKE` → Chrome

`3_gen_bat.js` detecta la cuenta por el nombre de carpeta (`CUENTA_BROWSER` en el script) y
genera el `.bat` con el navegador correcto automáticamente. Pero si Marcos usa el link de la
columna del Excel en vez del `.bat`, ese abre el navegador que esté puesto como **predeterminado
de Windows** — así que antes de usar el Excel de una cuenta hay que cambiar el predeterminado en
Configuración → Aplicaciones → Aplicaciones predeterminadas a mano. Si se agrega una tercera
cuenta ML en el futuro, preguntar en qué navegador está logueada y añadirla a `CUENTA_BROWSER`.

**Estructura en disco** (ver `D:\MensajeGrupo\README.md` para el detalle completo del paso a paso):
```
D:\MensajeGrupo\
  README.md                          instrucciones completas del proceso mensual
  _scripts\                          scripts reutilizables (Node + Python/openpyxl)
    1_cruce.js                       cruza ventas_raw.txt x calificaciones_raw.txt -> matches.json/expanded.json
    2_make_xlsx.py                   genera xlsx con columna Nuevo/Repetido + hipervinculos HYPERLINK()
    3_gen_bat.js                     genera .bat que abre las URLs de mensajeria en Firefox (metodo principal)
    4_gen_html.js                    respaldo HTML con checkboxes + boton "abrir todos"
  SOLUCION-MC\
    historial_contactados.csv        acumulado de TODOS los meses (nunca se borra) — evita re-contactar
    2026-09\                         carpeta del mes: datos crudos + resultados
  PIKEKE\
    (misma estructura, se crea cuando Marcos pase esos datos)
```

**Por qué existe cada pieza (decisiones tomadas en la sesión que armó esto):**
- El cruce es por **seudónimo exacto** (case-insensitive), no por nombre — es el único dato
  confiable presente en ambos listados de ML.
- El link de mensajería directa es `https://vendedores.mercadolibre.com.ve/ventas/nueva/mensajeria/{numero_de_venta}`.
- Abrir 100+ pestañas con JS (`window.open` en loop) **no funciona**: el bloqueador de popups de
  Firefox solo permite ventanas abiertas de forma síncrona dentro del mismo clic; con `setTimeout`
  entre cada una, bloquea todas menos la primera. La solución que sí funcionó fue un **.bat** que
  lanza `firefox.exe <url>` repetidamente vía `start` — como es el SO invocando el proceso (no un
  script de la página), no pasa por el bloqueador de popups del navegador en absoluto.
- `1_cruce.js` lee `..\historial_contactados.csv` de la cuenta y marca cada match como
  `nuevo: true/false`. `3_gen_bat.js` **solo abre los NUEVOS por defecto** (flag `--todos` para
  forzar todos) — la idea es no volver a escribirle a alguien ya contactado en un mes anterior.
- El historial se actualiza **al final del mes**, después de correr el flujo y contactar, no antes
  (si se seedea con los datos del mismo mes que se está por procesar, todo sale marcado "repetido"
  incorrectamente — error que se cometió y corrigió durante el armado de este flujo).

**Mensaje que se envía a cada comprador:** guardado tal cual en
`D:\MensajeGrupo\mensaje_template.txt` — agradecimiento breve + invitación a la comunidad de
Telegram (`https://t.me/comerciantedigitalve`). Usar ese texto por defecto al escribirle a cada
comprador del listado; solo cambiarlo si Marcos pide otra redacción.

**Cómo aplicar:** cuando Marcos pida repetir esto el próximo mes o para la cuenta PIKEKE, seguir
`D:\MensajeGrupo\README.md` tal cual — no rediseñar el flujo, solo crear la carpeta del mes
correspondiente, pedirle los dos .txt crudos (ventas y calificaciones), y correr los 4 scripts
en orden.
