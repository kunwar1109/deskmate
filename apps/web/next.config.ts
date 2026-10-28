import type { NextConfig } from "next";

// Where the Express API runs. Read on the server only; the browser never sees it.
const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The browser calls /api/* on this app, and Next forwards it to Express. To the browser the API is
  // same-origin, so the httpOnly session cookie is first-party and no CORS setup is needed. In production
  // (web on Vercel, API on Render) this is what keeps the cookie working across the two hosts.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
  // No marketing page yet: "/" goes to the dashboard, and proxy.ts sends logged-out visitors on to /login.
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
};

export default nextConfig;
