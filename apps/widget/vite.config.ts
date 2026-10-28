import { defineConfig } from 'vite';

/**
 * The widget is written as ordinary React, but bundled with Preact's React-compatible runtime:
 * about 5 KB gzipped instead of about 60 KB for react + react-dom. It loads on every page of a
 * customer's website, phones included, so its size is the customer's page speed.
 */
const reactToPreact = [
  { find: /^react$/, replacement: 'preact/compat' },
  { find: /^react-dom$/, replacement: 'preact/compat' },
  { find: /^react-dom\/client$/, replacement: 'preact/compat/client' },
  { find: /^react\/jsx-runtime$/, replacement: 'preact/compat/jsx-runtime' },
  { find: /^react\/jsx-dev-runtime$/, replacement: 'preact/compat/jsx-dev-runtime' },
];

export default defineConfig(({ mode }) => ({
  resolve: { alias: reactToPreact },
  // Library builds don't replace this by default, and some dependencies check it. A browser has no `process`.
  define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
  server: { port: 5173 },
  build: {
    // One classic script (IIFE): works from a plain <script src> tag on any site, no module loader needed.
    // The CSS is imported as a string (styles.css?inline) and injected into the Shadow DOM, so there's no CSS file.
    lib: { entry: 'src/main.tsx', name: 'DeskmateWidget', formats: ['iife'], fileName: () => 'widget.js' },
    target: 'es2020',
  },
}));
