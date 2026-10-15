# Chrome Web Store: Asistente de envíos

Todo lo que se copia y pega en el panel de la tienda (`chrome.google.com/webstore/devconsole`).

- **ZIP:** `tools/vigilante-dist/extension-tienda-<versión>.zip`, armado con `tienda/construir-zip.ps1`.
- **Imágenes:** carpeta `tienda/capturas/`.
- **En cada versión nueva:** subir `"version"` en `manifest.json`, rearmar el ZIP y en el panel ir a *Paquete → Subir nuevo paquete*.

---

## 1. Ficha de Play Store ("Store listing")

**Nombre** (sale del manifest): El Comerciante Digital · Asistente de envíos

**Resumen** (sale del manifest): Trae a El Comerciante Digital los pagos y guías de tu portal de MercadoEnvíos, con tu propia sesión. Solo lee.

**Descripción:**

```
Para vendedores de MercadoLibre Venezuela que usan El Comerciante Digital.

El Asistente de envíos trae a tu cuenta de El Comerciante Digital los pagos y las guías de tu portal de vendedor de MercadoEnvíos, para que no tengas que descargarlos uno por uno.

CÓMO FUNCIONA
• En el sistema tocas "Traer pagos y guías" (o eliges a qué horas se hace solo).
• El asistente abre tu portal de MercadoEnvíos con la sesión que ya tienes en Chrome, lee las órdenes pagadas de los últimos 7 días y trae cada pago con su comprobante y su guía en PDF.
• En el sistema verificas los pagos contra tu banco y las guías ya están listas en Despachos para imprimir.

TU CUENTA, SEGURA
• Tu contraseña nunca sale de tu PC: el asistente usa la sesión que ya tienes abierta.
• Solo LEE el portal: no confirma, no paga y no cambia nada en tu cuenta de MercadoEnvíos.
• Solo trabaja cuando tú lo pides desde el sistema.
• Lo envía todo cifrado únicamente a tu cuenta de El Comerciante Digital.
• Lo quitas cuando quieras.

PARA EMPEZAR
1. En El Comerciante Digital entra a Pagos ME y toca "Conectar una PC".
2. Toca el ícono del asistente en Chrome, escribe el código y toca "Conectar".

¿Se fue la luz? No se pierde nada: al volver, trae todo lo que faltaba.

Requiere una cuenta de El Comerciante Digital con Pagos MercadoEnvíos activo.
MercadoEnvíos y MercadoLibre son marcas de sus dueños; esta extensión no está afiliada a ellos.
```

**Categoría:** Productividad → Herramientas (o "Flujo de trabajo y planificación")
**Idioma:** Español (Latinoamérica)

**Imágenes:**
| Campo | Archivo |
|---|---|
| Ícono de la tienda (128×128) | `iconos/icono128.png` |
| Capturas de pantalla (1280×800) | `capturas/captura1-1280x800.jpg`, `capturas/captura2-1280x800.jpg` |
| Mosaico promocional pequeño (440×280) | `capturas/mosaico-440x280.jpg` |

**Sitio web oficial:** https://app.elcomerciantedigital.com (opcional)
**URL de asistencia:** https://t.me/elcomerciantedigital

---

## 2. Prácticas de privacidad ("Privacy practices")

**Propósito único:**

```
Traer los pagos y las guías del portal de vendedor de MercadoEnvíos del propio usuario a su cuenta de El Comerciante Digital, solo cuando el usuario lo pide desde ese sistema.
```

**Justificación de cada permiso:**

| Permiso | Justificación (copiar) |
|---|---|
| `alarms` | Cada minuto pregunta, solo al servidor de El Comerciante Digital, si el usuario pidió traer pagos y guías. No toca ninguna otra página. |
| `storage` | Guarda en el navegador la clave de conexión con la cuenta del usuario y el resultado de la última vez que trabajó. |
| `scripting` | Lee, dentro de la página del portal de MercadoEnvíos abierta con la sesión del usuario, la lista de órdenes pagadas y descarga sus comprobantes y guías. No escribe ni cambia nada en el portal. |
| `tabs` | Abre el portal de MercadoEnvíos en segundo plano para leerlo, reconoce la ventana que abrió el programa de escritorio del usuario y la cierra al terminar. |
| Permisos de host | mercadoenvios.com.ve: leer el portal de vendedor del usuario. app.elcomerciantedigital.com: enviar los datos a la cuenta del usuario. staging.elcomerciantedigital.com: entorno de pruebas del mismo servicio. |

**¿Usas código remoto?** No.

**Uso de datos.** Marcar que recopila:
- ☑ Información de identificación personal (las guías traen nombre y dirección de envío del comprador)
- ☑ Información financiera y de pagos (montos, bancos y referencias de los pagos de las órdenes)
- ☑ Contenido de sitios web (datos de las órdenes leídos del portal)
- Todo lo demás, sin marcar (salud, autenticación, comunicaciones personales, ubicación, historial web, actividad del usuario).

**Certificar las tres casillas:**
- ☑ No vendo ni transfiero datos de usuarios a terceros, salvo en los casos aprobados.
- ☑ No uso ni transfiero datos de usuarios con fines no relacionados con el propósito único del elemento.
- ☑ No uso ni transfiero datos de usuarios para determinar la solvencia crediticia ni para otorgar préstamos.

**Política de privacidad:** https://app.elcomerciantedigital.com/extension/privacidad

---

## 3. Distribución

- **Pago:** Gratis.
- **Visibilidad:** **No listado.** Solo la instala quien tiene el enlace, que se comparte desde app.elcomerciantedigital.com/extension.
- **Regiones:** todas (o solo Venezuela).

## 4. Instrucciones para el revisor (si las pide)

```
The extension only works for sellers with an El Comerciante Digital account (Venezuelan MercadoLibre sellers) and a MercadoEnvíos seller portal session in the same Chrome profile. It does nothing on its own: every minute it asks only our server (app.elcomerciantedigital.com) whether the user requested "Traer pagos y guías" from the web app. Only then it reads the user's own orders from www.mercadoenvios.com.ve (read-only, using the session already open in that profile) and uploads payment data, receipts and shipping labels to the user's account. It never reads or stores passwords and never changes anything on the portal. To connect, the user types a short code generated in the web app into the extension popup.
```

## 5. Después de aprobada

1. Copiar el enlace de la extensión en la tienda: `https://chromewebstore.google.com/detail/...`
2. Pegarlo en `TIENDA_EXTENSION_URL` (`lib/pagosMEComun.ts`) y desplegar. Desde ese momento, app.elcomerciantedigital.com/extension lleva a la tienda, y el instalador y Pagos ME ya apuntan ahí.
3. El programa de la PC (despertador 1.3.1) reconoce tanto la extensión de la tienda como la cargada a mano.
