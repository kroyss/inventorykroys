import { redirect } from 'next/navigation'

// Reputación quedó dentro de Calificaciones (vista "Me calificaron"): enlaces viejos y avisos llegan aquí.
export default function ReputacionPage() {
  redirect('/calificaciones?ver=recibidas')
}
