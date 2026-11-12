import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from GitHub Pages' /double-booked/ subpath.
  base: './',
  server: { host: true, port: 5180 },
});
