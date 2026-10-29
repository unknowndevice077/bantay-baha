import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

// Four pages: the 3D simulator (index.html), the story game (play.html) the barangay operations dashboard (dashboard.html) and the coastal storm-surge mode (coast.html).
export default defineConfig({
  build: {
    // Top-level await (characters load before the world is built).
    target: 'es2022',
    rollupOptions: {
      input: {
        simulator: page('./index.html'),
        game: page('./play.html'),
        dashboard: page('./dashboard.html'),
        coast: page('./coast.html'),
      },
    },
    // three.js alone is ~600 kB minified; that's expected for the simulator page.
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
