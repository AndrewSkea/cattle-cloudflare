/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export served by the Cloudflare Worker (same origin as the /api routes).
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
};

module.exports = nextConfig;
