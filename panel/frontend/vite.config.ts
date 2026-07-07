import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The Vue dev server proxies /api to the local panel backend, so the app makes
// same-origin requests (no CORS, no hardcoded backend origin in source).
//
// The backend port comes from this project's OWN .env (PANEL_PORT). Vite does
// not populate process.env from .env for the config itself, so load it here.
// It must match the PANEL_PORT the backend runs on. Falls back to 4321.
try {
  process.loadEnvFile();
} catch {
  // No .env in this project — rely on the ambient environment / default below.
}
const API_PORT = process.env.PANEL_PORT ?? '4321';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: true },
    },
  },
});
