import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // Solo durante el build en producción, ignora errores de ESLint
    ignoreDuringBuilds: process.env.NODE_ENV === 'production',
  },
  typescript: {
    // Solo durante el build en producción, ignora errores de TypeScript
    ignoreBuildErrors: process.env.NODE_ENV === 'production',
  },
  experimental: {
    // Habilitar características experimentales si es necesario
    esmExternals: true,
  },
};

export default nextConfig;
