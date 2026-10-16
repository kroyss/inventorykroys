import NovedadesPagina from '@/components/layout/NovedadesPagina'

export const metadata = { title: 'Novedades' }

// Celular: "Más" → Novedades (en la computadora es el megáfono de la barra, components/layout/NovedadesNav.tsx).
export default function Novedades() {
  return <NovedadesPagina />
}
