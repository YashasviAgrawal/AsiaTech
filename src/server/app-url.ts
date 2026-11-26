/**
 * The app's public address, used in links that leave the app: invoice links on WhatsApp, payment links, the
 * booking engine URL and the print agent's server.
 *
 * Read when a link is made, not at build time. Next.js freezes `process.env.NEXT_PUBLIC_*` into the build (on the
 * server too), so a Docker image built once could only ever link to the domain it was built for. `APP_URL` is the
 * runtime setting; `NEXT_PUBLIC_APP_URL` still works for older .env files. The `env` alias stops the bundler
 * from inlining it.
 */
export function appBaseUrl(): string {
  const env = process.env;
  return (env.APP_URL || env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

export function appUrl(path: string): string {
  return `${appBaseUrl()}${path}`;
}

/** Session cookies are Secure when the app is served over https (a LAN install on http://192.168.x.x still signs in). */
export function secureCookies(): boolean {
  return appBaseUrl().startsWith('https://');
}
