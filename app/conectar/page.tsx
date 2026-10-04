import { redirect } from 'next/navigation'

// Link corto para conectar una cuenta de MercadoLibre: app.elcomerciantedigital.com/conectar.
// Se puede copiar y abrir en otra PC: si no hay sesión, el middleware lleva al login y vuelve
// aquí; luego sigue al OAuth (api/ml/conectar), que conecta la cuenta de ML abierta en ESE navegador.
export default function Conectar() {
  redirect('/api/ml/conectar')
}
