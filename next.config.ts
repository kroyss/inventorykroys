import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Disable x-powered-by header
  poweredByHeader: false,
  // Build a self-contained server bundle for the production Docker image
  output: 'standalone',
  // Versión de esta compilación (la pone el deploy: commit + hora). Con dos copias corriendo
  // mientras se actualiza, Next compara la del navegador con la del server y, si cambió, recarga la
  // página al navegar (en vez de mezclar archivos viejos y nuevos). Ver scripts/rolling.sh.
  deploymentId: process.env.DEPLOYMENT_ID || undefined,
  // El manual del Sistema (docs/ayuda/sistema.md) lo lee la ayuda con IA (lib/ayuda.ts) en tiempo de ejecución.
  outputFileTracingIncludes: { '/api/ayuda/preguntar': ['./docs/ayuda/**/*'], '/api/externo/ayuda': ['./docs/ayuda/**/*'] },
}

export default nextConfig
