/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
    outputFileTracingIncludes: {
      '/api/export-pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
    },
  },
};
module.exports = nextConfig;
