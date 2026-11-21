import { PaginaLegal, Seccion, LEGAL_TELEGRAM } from '@/components/legal/PaginaLegal'

// Política de privacidad general (21-11-2026): pública, sin sesión (proxy.ts "privacidad$"). La pide Meta para la
// publicidad (enlace en la bio y anuncios que llevan a /registro, con píxel). La de la extensión de Chrome sigue en
// /extension/privacidad (la exige la Chrome Web Store) y se enlaza desde aquí.
export const metadata = {
  title: 'Política de privacidad · El Comerciante Digital',
  description: 'Qué datos usa El Comerciante Digital, para qué y cómo se protegen.',
}

export default function Privacidad() {
  return (
    <PaginaLegal titulo="Política de privacidad">
      <p className="text-neutral-700 leading-relaxed">
        El Comerciante Digital es un sistema para vendedores de MercadoLibre Venezuela: preguntas, mensajes, despachos,
        inventario y herramientas relacionadas. Aquí explicamos qué datos usamos, para qué y cómo los cuidamos.
      </p>

      <Seccion titulo="Datos que nos das al registrarte">
        <ul className="list-disc pl-5 space-y-1">
          <li>Nombre de tu negocio, tu nombre y tu correo.</li>
          <li>WhatsApp y Telegram, si decides escribirlos (son opcionales), para poder ayudarte con tu cuenta.</li>
          <li>Tu contraseña, que guardamos solo como huella cifrada (hash): nadie, ni nosotros, puede leerla.</li>
        </ul>
      </Seccion>

      <Seccion titulo="Datos de tu cuenta de MercadoLibre">
        <p>
          Cuando conectas tu cuenta de MercadoLibre, el sistema lee lo necesario para darte el servicio: tus
          publicaciones, ventas, preguntas, mensajes y envíos. Nunca vemos tu contraseña de MercadoLibre: la conexión
          se hace con el permiso oficial de MercadoLibre y puedes quitarlo cuando quieras.
        </p>
      </Seccion>

      <Seccion titulo="Respuestas con inteligencia artificial">
        <p>
          Si activas las respuestas con IA, el texto de la pregunta o mensaje y los datos de tu negocio que tú cargaste
          se envían a nuestro proveedor de IA solo para redactar la respuesta. No se usan para entrenar modelos ni para
          ningún otro fin.
        </p>
      </Seccion>

      <Seccion titulo="Medición de visitas y publicidad (cookies)">
        <p>
          En la página de registro usamos el píxel de Meta (Facebook e Instagram) para saber si nuestros anuncios
          traen registros. El píxel usa cookies de tu navegador; Meta trata esos datos según su propia política. Puedes
          bloquear las cookies en tu navegador o ajustar tus preferencias de anuncios en tu cuenta de Facebook o
          Instagram.
        </p>
        <p>
          También contamos las visitas a esa página sin guardar tu dirección IP: solo una huella cifrada para no contar
          dos veces a la misma persona.
        </p>
      </Seccion>

      <Seccion titulo="Para qué usamos los datos">
        <p>
          Solo para darte el servicio, ayudarte con tu cuenta y avisarte cosas de ella (por ejemplo, cuándo termina tu
          prueba). No vendemos, alquilamos ni compartimos tus datos ni los de tus compradores con nadie.
        </p>
      </Seccion>

      <Seccion titulo="Cómo los protegemos">
        <ul className="list-disc pl-5 space-y-1">
          <li>Cada empresa ve solo sus propios datos: la separación la hace la base de datos misma.</li>
          <li>Las conexiones van cifradas (HTTPS) y las claves se guardan solo como huella, no en texto.</li>
          <li>Dentro de tu empresa, cada usuario ve solo las secciones que su administrador le permite.</li>
        </ul>
      </Seccion>

      <Seccion titulo="Cuánto tiempo los guardamos y cómo borrarlos">
        <p>
          Mientras tu cuenta exista. Puedes pedirnos que borremos tu cuenta y tus datos cuando quieras: los eliminamos
          en un plazo de 30 días.
        </p>
      </Seccion>

      <Seccion titulo="Asistente de envíos (extensión de Chrome)">
        <p>
          Si usas nuestra extensión de Chrome, lo que lee y envía está explicado en su{' '}
          <a href="/extension/privacidad" className="text-emerald-700 underline">política propia</a>.
        </p>
      </Seccion>

      <Seccion titulo="Contacto">
        <p>
          Por Telegram:{' '}
          <a href={`https://t.me/${LEGAL_TELEGRAM}`} className="text-emerald-700 underline" target="_blank" rel="noreferrer">
            @{LEGAL_TELEGRAM}
          </a>
        </p>
      </Seccion>
    </PaginaLegal>
  )
}
