import path from 'node:path';
import type { NextConfig } from 'next';

const repositoryRoot = path.resolve(process.cwd(), '..');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: ['*.e2b.app'],
  output: 'standalone',
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
  experimental: { optimizePackageImports: ['lucide-react'] },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/app/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }] },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ];
  },
};
export default nextConfig;
