import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

// Three pages: the 3D simulator (index.html), the story game (play.html) and the barangay operations dashboard (dashboard.html).
export default defineConfig({
  build: {
    // Top-level await (characters load before the world is built).
    target: 'es2022',
    rollupOptions: {
      input: {
        simulator: page('./index.html'),
        game: page('./play.html'),
        dashboard: page('./dashboard.html'),
      },
    },
    // three.js alone is ~600 kB minified; that's expected for the simulator page.
    chunkSizeWarningLimit: 800,
  },
});
