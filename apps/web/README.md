# @deskmate/web

The Deskmate dashboard: Next.js 16 (App Router, Cache Components), Tailwind 4, shadcn/ui (Radix).

```bash
cp .env.example .env.local   # API_URL=http://localhost:4000
npm run dev                  # http://localhost:3000 (needs the API running)
```

- The browser calls `/api/*` on this app; `next.config.ts` rewrites it to the Express API, so the session cookie is first-party and there's no CORS.
- `src/proxy.ts` redirects to `/login` when there's no session cookie (optimistic check only).
- `src/lib/session.ts` `getCurrentUser()` forwards the cookie to `GET /api/auth/me`; the API decides if it's valid. Call it only inside `<Suspense>`.
- Forms validate with the same Zod schemas as the API (`@deskmate/shared`).
- Documents use TanStack Query; the list polls every 2 seconds only while a document is processing.
