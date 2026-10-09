# Vigilante Pagos MercadoEnvíos (uso interno)

Extensión de Chrome para el módulo **Pagos ME** (solo la empresa de la plataforma). Va en la PC del
antiguo Reportador, **un perfil de Chrome por cuenta** (PIKEKE y SOLUCION-MC).

Cada minuto pregunta **solo al sistema** si alguien tocó "Traer pagos y guías". Únicamente entonces
abre el portal de MercadoEnvíos con la sesión de ese perfil, lee las órdenes pagadas de los últimos
7 días y sube al sistema las que faltan (datos del pago, comprobante y guía). **Solo lee**: no
confirma, no paga y no cambia nada en el portal.

## Instalar (en cada perfil)

1. Copiar esta carpeta a la PC (por ejemplo `C:\Automatizaciones\vigilante-pagos-me`).
2. En Chrome, con el perfil de la cuenta: `chrome://extensions` → activar **Modo de desarrollador**
   → **Cargar descomprimida** → elegir la carpeta.
3. Clic en el ícono de la extensión:
   - **Perfil**: `PIKEKE` o `SOLUCION-MC`.
   - **Sistema**: Producción (o Staging para pruebas; ahí también va la clave de nginx en
     "Usuario:clave de staging").
   - **Clave del vigilante**: en el sistema, **Pagos ME → Generar clave** (admin). La misma clave
     sirve para los dos perfiles. Generar una nueva invalida la anterior.
   - **Guardar** y **Probar conexión** → debe decir "Conectado ✓".
4. En ese perfil, **iniciar sesión en mercadoenvios.com.ve** con la cuenta correspondiente.

## Uso

- Las dos ventanas de Chrome (un perfil cada una) quedan **abiertas**. Para que se abran solas al
  prender la PC, un acceso directo en la carpeta de Inicio:
  `chrome.exe --profile-directory="Profile 1"` (y otro con el perfil de la otra cuenta).
- En **Pagos ME** se ve si cada perfil está conectado y el resultado del último "Traer".
- Si dice que **no tiene la sesión iniciada**: entrar al portal en ese perfil e iniciar sesión.
  MercadoEnvíos cierra la sesión cada cierto tiempo.
