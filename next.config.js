/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/quakesettings', // Replace with your repository name
  images: {
    unoptimized: true,
  },
  // Add trailingSlash to ensure consistent routing
  trailingSlash: true,
  // Disable unnecessary features for static export
  experimental: {
    appDir: true,
    serverActions: false
  }
}

module.exports = nextConfig

