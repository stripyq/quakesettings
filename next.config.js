/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/quakesettings',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  experimental: {
    appDir: true,
    serverActions: false
  }
}

module.exports = nextConfig

