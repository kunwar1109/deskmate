import { createRoot } from 'react-dom/client';
import type { WidgetOptions } from './api';
import styles from './styles.css?inline';
import { Widget } from './widget';

const HOST_ID = 'deskmate-widget';

/**
 * Reads the settings from the snippet:
 *   <script src="https://api.example.com/widget.js" data-widget-key="wk_..." async></script>
 * Must run right away, while the script executes: document.currentScript is null afterwards.
 * (It's also null for type="module" scripts, so the dev page is found by its data attribute instead.)
 */
function readOptions(): WidgetOptions | null {
  const script =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>('script[data-widget-key]');
  const widgetKey = script?.dataset.widgetKey;
  if (!script || !widgetKey) {
    console.error('[Deskmate] Add data-widget-key="..." to the widget <script> tag.');
    return null;
  }
  // By default the API is wherever this script came from (the API serves /widget.js), so the snippet needs only the key.
  const apiUrl = script.dataset.apiUrl || new URL(script.src, location.href).origin;
  return { widgetKey, apiUrl: apiUrl.replace(/\/$/, '') };
}

function mount(options: WidgetOptions) {
  if (document.getElementById(HOST_ID)) return; // the snippet was pasted twice

  const host = document.createElement('div');
  host.id = HOST_ID;
  // Shadow DOM: the site's CSS can't restyle the widget, and the widget's CSS can't leak onto the site.
  // "open" lets developers inspect it in devtools; "closed" wouldn't add real security, since scripts on
  // the page run with the same rights as ours either way.
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = styles;
  const container = document.createElement('div');
  container.className = 'root';
  shadow.append(style, container);
  document.body.append(host);

  createRoot(container).render(<Widget {...options} />);
}

const options = readOptions();
if (options) {
  // An async script can run before <body> exists; wait for it if so.
  if (document.body) mount(options);
  else document.addEventListener('DOMContentLoaded', () => mount(options), { once: true });
}
