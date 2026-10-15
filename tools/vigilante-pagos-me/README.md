# Pagos MercadoEnvíos — programa de la PC ("vigilante")

**Desde la 1.3.0 (clientes):** instalador `public/descargas/InstalarPagosME.exe` (se arma con
`instalador/construir.ps1` y se copia ahí). Pide solo el **código** de Pagos ME → *Conectar una PC*;
el despertador lo cambia por su clave y encuentra solo los perfiles de Chrome que tienen la extensión.
En cada perfil: extensión cargada + el mismo código en su ventanita → *Conectar*. Lo de abajo es la
instalación a mano de antes (sigue funcionando: clave larga y perfiles fijos).


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

## Despertador (recomendado): Chrome cerrado, se abre solo al traer

Como el Radar: un script chico corre con un ícono **ME** junto al reloj (verde en espera, azul trayendo, rojo sin conexión; clic derecho: Ver registro / Salir) desde que se inicia sesión en Windows y cada minuto
pregunta al sistema si alguien tocó "Traer pagos y guías". Solo entonces abre Chrome en el portal con
cada perfil; la extensión trabaja y **cierra su ventana sola**. Si un perfil no tiene la sesión de
MercadoEnvíos iniciada, esa ventana queda abierta para iniciarla ahí.

1. Instalar la extensión en cada perfil (pasos de arriba, versión 1.1.0 o más nueva).
2. Editar `despertador.json` (Bloc de notas):
   - `clave`: la misma clave del vigilante.
   - `perfiles`: el nombre que se puso en la extensión (`perfil`) y la carpeta de Chrome de ese perfil
     (`carpeta`: en esa ventana, `chrome://version` → "Ruta del perfil", lo último: `Profile 1`, `Profile 2`…).
   - `chrome`: vacío (se busca solo) o la ruta de `chrome.exe`.
3. Doble clic en `instalar-despertador.cmd` (sin administrador). Queda corriendo y arranca solo al iniciar Windows (acceso directo en `shell:startup`).
4. Cerrar las ventanas de Chrome. En el sistema, **Pagos ME** debe decir **"PC en espera"**.
5. Registro: `despertador.log` en la misma carpeta. Quitar: borrar "Despertador Pagos ME" de `shell:startup`.

Necesita que Windows entre solo (sin clave) para arrancar después de un apagado.

## Uso

- Sin despertador: las dos ventanas de Chrome (un perfil cada una) quedan **abiertas**. Para que se abran solas al
  prender la PC, un acceso directo en la carpeta de Inicio:
  `chrome.exe --profile-directory="Profile 1"` (y otro con el perfil de la otra cuenta).
- En **Pagos ME** se ve si cada perfil está conectado y el resultado del último "Traer".
- **Sesión vencida** (MercadoEnvíos la cierra a diario): desde la 1.2.0 el vigilante entra solo con
  "Ingresar con mi cuenta de Mercado Libre" (pasa directo si ese Chrome tiene la sesión de ML; nunca
  escribe claves). Solo si ML pide clave o código, Pagos ME avisa "no tiene la sesión iniciada" y la
  ventana queda abierta para hacerlo a mano.
