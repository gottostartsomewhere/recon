import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend (5173) proxies /api to the Node research server (8787) in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
