import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // Docker builds set NEXT_OUTPUT=standalone: `.next/standalone` then holds the server and only the node_modules
  // files it uses, and the image copies just that. Plain `npm run build && npm start` keeps the usual output.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // Files read from disk at run time, which the build cannot see through imports: the invoice PDF fonts and the
  // print agent that staff download.
  outputFileTracingIncludes: {
    '/*': ['./node_modules/geist/dist/fonts/geist-sans/*.ttf', './node_modules/geist/dist/fonts/geist-mono/*.ttf', './print-agent/asiatech-print-agent.mjs'],
  },
  // Node-only packages stay out of the bundler (@react-pdf/renderer is external by default).
  serverExternalPackages: ['pg', 'exceljs', 'bcryptjs', 'nodemailer'],
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
  },
};

export default nextConfig;
