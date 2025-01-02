/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/quakesettings', // Replace with your repository name
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig

