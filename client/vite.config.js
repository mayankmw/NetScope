import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Used only when DEV_API_PROXY_TARGET is not set. 127.0.0.1 (not "localhost") avoids Node
// resolving to ::1 while the API server listens on IPv4 loopback.
const DEFAULT_API_PROXY_TARGET = 'http://127.0.0.1:4000';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix loads non-VITE_ variables too. They are available here only and are never
  // exposed to browser code (only VITE_* variables reach import.meta.env).
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // The browser talks only to the Vite origin; Vite forwards API calls to the server.
        // Mirrors production, where the client and API share one origin.
        '/api': {
          target: env.DEV_API_PROXY_TARGET || DEFAULT_API_PROXY_TARGET,
          changeOrigin: false,
        },
      },
    },
  };
});
