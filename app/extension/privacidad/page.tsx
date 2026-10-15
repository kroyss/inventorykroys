// Política de privacidad: app.elcomerciantedigital.com/extension/privacidad (pública, sin sesión). La exige la
// Chrome Web Store para publicar la extensión "Asistente de envíos" (tools/vigilante-pagos-me); todo lo de la
// extensión vive bajo /extension. Cubre también el sistema en general.
export const metadata = {
  title: 'Política de privacidad · El Comerciante Digital',
  description: 'Qué datos usa El Comerciante Digital y su Asistente de envíos para Chrome, para qué y cómo se protegen.',
}

const TELEGRAM_OFICIAL = 'elcomerciantedigital'
const ACTUALIZADA = '15 de octubre de 2026'

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-neutral-900">{titulo}</h2>
      <div className="space-y-2 text-neutral-700 leading-relaxed">{children}</div>
    </section>
  )
}

export default function Privacidad() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8 text-[15px]">
        <header className="space-y-1">
          <p className="text-sm text-neutral-500">El Comerciante Digital</p>
          <h1 className="text-2xl font-bold text-neutral-900">Política de privacidad</h1>
          <p className="text-sm text-neutral-500">Actualizada el {ACTUALIZADA}</p>
        </header>

        <p className="text-neutral-700 leading-relaxed">
          El Comerciante Digital es un sistema para vendedores de MercadoLibre Venezuela: preguntas, mensajes,
          despachos, inventario y herramientas relacionadas. Esta página explica qué datos usamos, para qué y cómo
          los cuidamos, incluida la extensión de Chrome <b>Asistente de envíos</b>.
        </p>

        <Seccion titulo="Asistente de envíos (extensión de Chrome)">
          <p>
            La extensión trae a tu cuenta de El Comerciante Digital los pagos y las guías de <b>tu propio</b> portal de
            vendedor de MercadoEnvíos, para que no tengas que descargarlos uno por uno.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Solo trabaja cuando tú (o el horario que configuraste) lo pide desde el sistema.</li>
            <li>Usa la sesión que ya tienes abierta en tu Chrome. <b>Nunca lee, guarda ni envía tu contraseña.</b></li>
            <li>Solo <b>lee</b> el portal: no confirma, no paga y no cambia nada en tu cuenta de MercadoEnvíos.</li>
            <li>No lee tu historial de navegación ni ninguna otra página.</li>
          </ul>
          <p>Lo que lee del portal y envía a tu cuenta del sistema:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>De cada orden pagada de los últimos 7 días: número de venta, fecha, montos, método de pago, bancos,
              referencia, comprobante de pago (imagen o PDF), tipo de envío, transportista y la guía en PDF (que trae
              los datos de envío del comprador).</li>
            <li>El nombre de tu cuenta de vendedor en MercadoEnvíos, para mostrarlo en pantalla.</li>
          </ul>
          <p>
            Todo se envía por conexión cifrada (HTTPS) únicamente a <b>app.elcomerciantedigital.com</b>, a la empresa
            que conectaste con tu código. La extensión guarda en tu Chrome solo su clave de conexión y el resultado de
            la última vez que trabajó.
          </p>
        </Seccion>

        <Seccion titulo="Para qué usamos los datos">
          <p>
            Solo para darte el servicio: que verifiques tus pagos, imprimas tus guías y lleves tus ventas. No vendemos,
            alquilamos ni compartimos tus datos ni los de tus compradores con nadie, ni los usamos para publicidad.
          </p>
        </Seccion>

        <Seccion titulo="Cómo los protegemos">
          <ul className="list-disc pl-5 space-y-1">
            <li>Cada empresa ve solo sus propios datos: la separación la hace la base de datos misma.</li>
            <li>Las conexiones van cifradas y las claves se guardan solo como huella (hash), no en texto.</li>
            <li>Dentro de tu empresa, cada usuario ve solo las secciones que su administrador le permite.</li>
          </ul>
        </Seccion>

        <Seccion titulo="Cuánto tiempo los guardamos y cómo borrarlos">
          <p>
            Mientras tu cuenta esté activa. Puedes desconectar la extensión cuando quieras (Pagos ME → Desconectar PCs, o
            quitarla de Chrome) y pedirnos que borremos tus datos: los eliminamos en un plazo de 30 días.
          </p>
        </Seccion>

        <Seccion titulo="Contacto">
          <p>
            Por Telegram:{' '}
            <a href={`https://t.me/${TELEGRAM_OFICIAL}`} className="text-emerald-700 underline" target="_blank" rel="noreferrer">
              @{TELEGRAM_OFICIAL}
            </a>
          </p>
        </Seccion>
      </div>
    </main>
  )
}
