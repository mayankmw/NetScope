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
        // Real-time events. changeOrigin stays off so the server sees the browser's Origin and
        // can apply its allowlist.
        '/ws': {
          target: env.DEV_API_PROXY_TARGET || DEFAULT_API_PROXY_TARGET,
          ws: true,
          changeOrigin: false,
        },
      },
    },
    build: {
      rolldownOptions: {
        output: {
          // Third-party code in its own chunk: it changes far less often than app code, so
          // browsers keep it cached across NetScope updates. Pages are split per route.
          codeSplitting: {
            groups: [{ name: 'vendor', test: /node_modules/ }],
          },
        },
      },
      // The vendor chunk (React, React Router, Motion, Radix) is ~600 kB minified / ~195 kB
      // gzipped and loads once; the limit flags regressions beyond that baseline.
      chunkSizeWarningLimit: 650,
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{js,jsx}'],
      setupFiles: ['./src/test/setup.js'],
      css: false,
    },
  };
});
