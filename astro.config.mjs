import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://quantledge.local',
  integrations: [react(), sitemap()],
  vite: {
    server: {
      watch: {
        ignored: ['**/backend/.venv/**'],
      },
    },
  },
});
