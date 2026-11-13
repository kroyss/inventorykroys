import { redirect } from 'next/navigation'

// 13-11-2026: Usuarios vive ahora en Mi cuenta → Mi equipo (los enlaces viejos siguen sirviendo).
export default function UsuariosPage() {
  redirect('/mi-cuenta?ver=equipo')
}
