// Formato común de las páginas legales públicas (/privacidad, /terminos; 21-11-2026). Texto simple, sin sesión.
export const LEGAL_ACTUALIZADA = '21 de noviembre de 2026'
export const LEGAL_TELEGRAM = 'elcomerciantedigital'

export function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-neutral-900">{titulo}</h2>
      <div className="space-y-2 text-neutral-700 leading-relaxed">{children}</div>
    </section>
  )
}

export function PaginaLegal({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8 text-[15px]">
        <header className="space-y-1">
          <a href="https://elcomerciantedigital.com" className="text-sm text-neutral-500 hover:text-neutral-800">El Comerciante Digital</a>
          <h1 className="text-2xl font-bold text-neutral-900">{titulo}</h1>
          <p className="text-sm text-neutral-500">Actualizada el {LEGAL_ACTUALIZADA}</p>
        </header>
        {children}
        <footer className="border-t border-neutral-200 pt-6 text-xs text-neutral-400">
          <a href="/privacidad" className="hover:text-neutral-700">Política de privacidad</a>
          <span className="mx-2">·</span>
          <a href="/terminos" className="hover:text-neutral-700">Términos</a>
          <span className="mx-2">·</span>
          <a href="/registro" className="hover:text-neutral-700">Prueba gratis</a>
        </footer>
      </div>
    </main>
  )
}

/** Línea corta de aceptación para formularios y botones públicos (sin casilla: no agrega clics). */
export function LineaLegal({ accion = 'Al crear tu cuenta', className = '' }: { accion?: string; className?: string }) {
  const base = 'https://app.elcomerciantedigital.com'
  return (
    <p className={`text-xs leading-relaxed text-neutral-400 ${className}`}>
      {accion} aceptas los{' '}
      <a href={`${base}/terminos`} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-neutral-600">Términos</a>{' '}
      y la{' '}
      <a href={`${base}/privacidad`} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-neutral-600">Política de privacidad</a>.
    </p>
  )
}
