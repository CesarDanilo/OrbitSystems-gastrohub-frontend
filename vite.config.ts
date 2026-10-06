import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3340';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    strictPort: true,
    // Same-origin in development: the session cookie is first-party and SameSite=Lax works.
    proxy: {
      '/api': API_URL,
      '/uploads': API_URL,
    },
  },
  preview: { port: 5180 },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
