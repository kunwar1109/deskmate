import type { IncomingHttpHeaders } from 'node:http';
import { env } from '../config.js';

/**
 * The visitor's IP from CLIENT_IP_HEADER, when the host's edge sets one. Undefined when not configured or
 * missing, and callers fall back to X-Forwarded-For with TRUST_PROXY_HOPS.
 *
 * Why not X-Forwarded-For on Render: requests pass through Cloudflare, then Render's load balancer. Cloudflare
 * appends to X-Forwarded-For, and the entry a fixed hop count lands on is a Cloudflare server that changes
 * between requests (measured: 62 requests from one IP in 20 s never hit the 60/minute limit). Cloudflare
 * overwrites CF-Connecting-IP on every request instead, so it is the visitor and a client can't fake it.
 */
export function headerIp(headers: IncomingHttpHeaders): string | undefined {
  if (!env.CLIENT_IP_HEADER) return undefined;
  const value = headers[env.CLIENT_IP_HEADER];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
