/** @type {import('[v0-no-op-code-block-prefix]next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/quakesettings',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  experimental: {
    serverActions: false,
  }
}

module.exports = nextConfig

