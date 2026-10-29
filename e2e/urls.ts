// Ports of the E2E stack: not the dev ports (4000, 3000, 5173), so both can run at once.
export const API_URL = 'http://localhost:4100';
export const WEB_URL = 'http://localhost:3100';
// A different host from the API (127.0.0.1 vs localhost), so the widget is cross-origin, as on a real customer site.
export const SITE_URL = 'http://127.0.0.1:4173';
