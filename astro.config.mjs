import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://stripyq.github.io',
  base: '/quakesettings',
  output: 'static',
  integrations: [sitemap()],
});
