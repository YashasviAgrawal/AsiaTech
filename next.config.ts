import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `pg` and `exceljs` are Node-only; keep them out of the bundler.
  serverExternalPackages: ['pg', 'exceljs', 'bcryptjs'],
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
  },
};

export default nextConfig;
