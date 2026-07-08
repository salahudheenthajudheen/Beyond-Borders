// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: process.env.CF_PAGES ? 'https://beyond-borders-44c.pages.dev' : 'https://salahudheenthajudheen.github.io',
  base: process.env.CF_PAGES ? '/' : '/Beyond-Borders',
  vite: {
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  },
});
