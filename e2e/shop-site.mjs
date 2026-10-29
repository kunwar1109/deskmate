// A fake customer website for the E2E tests: one page with the widget snippet and deliberately hostile CSS.
// GET /?key=wk_... embeds the widget with that key. Plain node:http, nothing to install.
import { createServer } from 'node:http';

const PORT = 4173;
const API_URL = 'http://localhost:4100';

const escape = (value) => value.replace(/[^\w-]/g, ''); // widget keys are wk_ + base64url

const page = (key) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BrewBox shop</title>
    <link rel="icon" href="data:," />
    <style>
      /* The kind of CSS real sites ship. None of it may reach the widget inside its shadow root. */
      * { font-family: 'Comic Sans MS', cursive !important; color: #c00 !important; letter-spacing: 2px !important; }
      button { background: lime !important; border: 5px dashed purple !important; padding: 30px !important; }
      body { max-width: 720px; margin: 40px auto; background: #fffbe6; }
    </style>
  </head>
  <body>
    <h1>BrewBox</h1>
    <p>Fresh coffee, delivered monthly.</p>
    <button type="button">A host page button</button>
    <script src="${API_URL}/widget.js" data-widget-key="${escape(key)}" async></script>
  </body>
</html>`;

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname !== '/') {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(url.searchParams.get('key') ?? ''));
}).listen(PORT, '127.0.0.1', () => console.log(`Shop site on http://127.0.0.1:${PORT}`));
