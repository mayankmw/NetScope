/**
 * The only module that reads import.meta.env. Everything else imports `env` from here,
 * so configuration is validated and defaulted in one place.
 * Only VITE_* variables are exposed to the browser — never put secrets in them.
 */
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

// A path on the page's own origin (proxied by Vite in development), or a full ws(s):// URL.
const wsPath = import.meta.env.VITE_WS_PATH || '/ws';

export const env = Object.freeze({
  apiBaseUrl,
  wsPath,
  mode: import.meta.env.MODE,
  isDev: import.meta.env.DEV,
});
