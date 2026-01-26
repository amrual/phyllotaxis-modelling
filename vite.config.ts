import { defineConfig } from 'vite';

export default defineConfig({
  // Base path for deployment under /sim/ subpath
  base: '/sim/',

  build: {
    // Output directory
    outDir: 'dist',
    // Asset naming
    assetsDir: 'assets',
  },

  server: {
    // For local development, simulate the /sim/ base path
    // Access at http://localhost:5173/sim/
    // Note: `npm run dev` will serve at root by default,
    // but `npm run preview` will respect the base path.
  }
});
