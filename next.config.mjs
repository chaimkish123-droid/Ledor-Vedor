/** @type {import('next').NextConfig} */
const nextConfig = {
  // A self-contained server bundle, so the image does not need node_modules.
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],

  // The family's archive must never be traced into a build artifact. It lives
  // on a mounted volume; a bundle carrying a copy of it is a quiet way to leak
  // an entire family history.
  //
  // The pattern is anchored deliberately. A loose "./data/**" also matches
  // next/dist/lib/metadata, which strips a module the server needs — and the
  // build still succeeds, so the failure only appears once it is deployed.
  outputFileTracingExcludes: {
    '*': ['./data/*.db', './data/*.db-*', './data/backups/**'],
  },

  eslint: { ignoreDuringBuilds: true },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // A private family archive should not be framed, sniffed, or leaked
          // through a referrer.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          // Family pages are never for search engines.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
