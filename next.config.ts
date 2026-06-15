import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Disable x-powered-by header
  poweredByHeader: false,
  // Build a self-contained server bundle for the production Docker image
  output: 'standalone',
}

export default nextConfig
