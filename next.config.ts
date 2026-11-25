import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // Node-only packages stay out of the bundler (@react-pdf/renderer is external by default).
  serverExternalPackages: ['pg', 'exceljs', 'bcryptjs', 'nodemailer'],
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
  },
};

export default nextConfig;
