import { redirect } from 'next/navigation'
import { TIENDA_EXTENSION_URL } from '@/lib/pagosMEComun'

// Link fijo de la extensión "Asistente de envíos": app.elcomerciantedigital.com/extension (público). Lo abre
// el instalador al terminar y lo usa la pantalla de Pagos ME. Con la extensión ya publicada en la Chrome Web
// Store lleva a la tienda; mientras no, muestra cómo cargarla a mano. Así el instalador no cambia.
export const metadata = { title: 'Asistente de envíos para Chrome · El Comerciante Digital' }

export default function Extension() {
  if (TIENDA_EXTENSION_URL) redirect(TIENDA_EXTENSION_URL)
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-xl mx-auto px-4 py-10 space-y-5 text-[15px] text-neutral-700">
        <h1 className="text-2xl font-bold text-neutral-900">Asistente de envíos para Chrome</h1>
        <p>Hazlo una vez en cada cuenta de Chrome donde abres MercadoEnvíos:</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Escribe <code className="bg-neutral-100 px-1 rounded">chrome://extensions</code> en la barra de direcciones y activa <b>Modo de desarrollador</b> (arriba a la derecha).</li>
          <li>Toca <b>Cargar descomprimida</b> y elige la carpeta <b>extension</b> que abrió el programa
            (está en <code className="bg-neutral-100 px-1 rounded">%LOCALAPPDATA%\Programs\VigilantePagosME\extension</code>).</li>
          <li>Toca el ícono de la pieza de rompecabezas → <b>Asistente de envíos</b>, escribe tu código y toca <b>Conectar</b>.</li>
        </ol>
        <p className="text-sm text-neutral-500">Tu contraseña nunca sale de tu PC: la extensión usa la sesión que ya tienes abierta.</p>
      </div>
    </main>
  )
}
