/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/quakesettings',
  assetPrefix: '/quakesettings/',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
}

module.exports = nextConfig

