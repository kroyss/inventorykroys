import { PaginaLegal, Seccion, LEGAL_TELEGRAM } from '@/components/legal/PaginaLegal'

// Términos del servicio y de la prueba gratis (21-11-2026): públicos, sin sesión (proxy.ts "terminos$"). Dejan
// claro lo que Meta revisa en la publicidad: prueba sin tarjeta, sin cobro automático, sin promesas de ventas.
export const metadata = {
  title: 'Términos · El Comerciante Digital',
  description: 'Condiciones de uso de El Comerciante Digital y de su prueba gratis de 15 días.',
}

export default function Terminos() {
  return (
    <PaginaLegal titulo="Términos del servicio y de la prueba gratis">
      <p className="text-neutral-700 leading-relaxed">
        El Comerciante Digital es un sistema para vendedores de MercadoLibre Venezuela. Al crear una cuenta aceptas
        estas condiciones, escritas en lenguaje simple.
      </p>

      <Seccion titulo="Prueba gratis de 15 días">
        <ul className="list-disc pl-5 space-y-1">
          <li>Es gratis y <b>no pedimos tarjeta</b> ni ningún dato de pago para empezar.</li>
          <li><b>No hay cobros automáticos.</b> Al terminar los 15 días la cuenta se pausa y tú decides si eliges un plan.
            Si no eliges ninguno, no pagas nada.</li>
          <li>Hay una prueba por negocio y por cuenta de MercadoLibre.</li>
        </ul>
      </Seccion>

      <Seccion titulo="Planes y pagos">
        <ul className="list-disc pl-5 space-y-1">
          <li>Los planes y sus precios están publicados en <a href="/precios" className="text-emerald-700 underline">Precios</a>.</li>
          <li>Se paga por mes, cuando tú lo decides, desde «Mi plan». Nunca te cobramos sin que tú hagas el pago.</li>
          <li>Puedes dejar de usar el sistema cuando quieras: basta con no renovar.</li>
        </ul>
      </Seccion>

      <Seccion titulo="Lo que hace y lo que no hace el sistema">
        <ul className="list-disc pl-5 space-y-1">
          <li>Es una herramienta para ordenar y ahorrar tiempo en tu negocio. <b>No garantiza una cantidad de ventas</b>:
            eso depende de tu producto, tus precios y tu trabajo.</li>
          <li>No somos MercadoLibre ni estamos afiliados a MercadoLibre. Tu cuenta de MercadoLibre sigue sujeta a sus
            propias reglas, y eres responsable de cumplirlas.</li>
          <li>Las respuestas con inteligencia artificial salen con los datos que tú cargas y puedes revisarlas o
            apagarlas en cualquier momento. Lo que se publica en tu cuenta es responsabilidad tuya.</li>
        </ul>
      </Seccion>

      <Seccion titulo="Uso correcto">
        <p>
          No uses el sistema para engañar a compradores, enviar mensajes no deseados ni hacer nada que viole la ley o las
          reglas de MercadoLibre. Si eso pasa, podemos suspender la cuenta.
        </p>
      </Seccion>

      <Seccion titulo="Tus datos">
        <p>
          Cómo usamos y cuidamos tus datos está en la{' '}
          <a href="/privacidad" className="text-emerald-700 underline">Política de privacidad</a>.
        </p>
      </Seccion>

      <Seccion titulo="Cambios">
        <p>
          Si cambiamos estas condiciones, actualizamos la fecha de arriba y te avisamos dentro del sistema cuando el
          cambio sea importante.
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
