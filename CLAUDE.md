# Deskmate: project context for Claude Code

## What this project is

Deskmate is a multi-tenant AI customer support platform. A business signs up, uploads its help docs, and embeds a chat widget on its own site with one script tag. An AI agent answers customer questions from those docs with citations, and hands the chat to a human agent live when it isn't confident. The owner sees conversations, unanswered questions and answer quality in a dashboard.

## Why it exists (read this first)

This is a **portfolio project** for Rishabh, a frontend developer (4+ years: React, Next.js, TypeScript, Tailwind) moving into **full-stack + AI agent** roles. It must show strong frontend, real backend, and real AI engineering depth in one system.

How to work with Rishabh:

- **He is learning while building, and must be able to explain every decision in interviews.** Explain the *why* behind each choice briefly as you go. Prefer clear, readable code over clever code. Put a short comment on any non-obvious decision.
- Build in small steps he can run and verify. After each step, tell him exactly how to test it.
- Don't add features beyond the current phase without asking.
- Keep commits small with clear messages; recruiters read commit history.
- Resume claims must stay true: only describe what's actually built.

## Tech stack

- **Monorepo** with npm workspaces (root `package.json` → `"workspaces": ["apps/*"]`; later `packages/*`). One repo, not separate ones.
- **API (`apps/api`)**: Node 22+, Express 5, TypeScript (ESM, `module: NodeNext`), Zod 4, MongoDB driver 7, multer, unpdf.
- **AI**: Vercel AI SDK v7 (`ai`, `@ai-sdk/google`). Chat model `gemini-flash-lite-latest` (free tier; Flash was too slow and capped at 20 requests/day). Embeddings `gemini-embedding-001` at 768 dimensions.
- **Database**: MongoDB Atlas (free M0) with Atlas Vector Search.
- **Planned**: Next.js dashboard (`apps/web`), Vite widget (`apps/widget`), shared types (`packages/shared`), BullMQ + Redis, Socket.io, Jest, Supertest, React Testing Library, Playwright, GitHub Actions, Sentry.

## Conventions

- ESM everywhere. Relative imports in the API use the `.js` extension (`import { env } from './config.js'`).
- Validate all input with Zod. Validate env in `src/config.ts`; never read `process.env` elsewhere.
- Express 5 forwards async errors to the error handler in `src/index.ts`. Throw typed errors; map them to status codes there.
- **Every query is scoped by `workspaceId`.** Get it only via `getWorkspaceId(req)` in `src/lib/workspace.ts`. Never trust a workspace id from the request body. Mutations filter by `_id` AND `workspaceId`.
- Chunks duplicate `workspaceId` and `documentTitle` so vector search can filter by tenant and citations need no extra lookup.
- Run `npm run typecheck` (in `apps/api`) before considering a step done.
- Secrets live only in `.env` (git-ignored). `.env.example` documents every variable.

## Current status

**Phase 1 (core RAG) runs end to end against live Atlas + Gemini.** All five README test questions pass (three cited answers, two correct handoffs). Fixed along the way: free-tier 429s now fail fast with 503/504 instead of hanging; chat model switched to Flash-Lite for speed and quota; chat logs include `topScore` and `handoffReason` even on handoff. 
**Phase 2 step 1 (accounts + login) is done** and verified with curl: signup/login/logout/me, `/api/documents` and `/api/chat` behind `requireAuth`, tenant isolation checked with two accounts. 
**Phase 2 step 2 (background ingestion) is done** and verified: upload returns 202 in ~0.25s, the worker marks the sample `ready` in ~12s and a question asked immediately after is answered (fixes the Atlas indexing delay seen in step 1). Unreadable files fail once with no retries (`UnrecoverableError`); delete during processing leaves no chunks or file; retry-until-final detection checked with a throwaway queue. BullMQ 6 needs `ioredis` installed explicitly (optional peer). Upstash free tier = 500K commands/month, so don't lower the worker's polling settings. 
**Phase 2 step 3 (`packages/shared`) is done**: API validates with the shared schemas and returns the shared types (`DocumentSummary`, `AuthResponse`, `ChatResponse`); renaming a shared field breaks the API typecheck as intended. 
**Phase 2 step 4 (`apps/web` login/signup) is done**: verified through the dev server (rewrite signup/login/logout, cookie HttpOnly on localhost, proxy redirect, forged cookie -> /login, dashboard streams user + workspace) and `next build` (/dashboard is Partial Prerender, login/signup static). Not yet click-tested in a real browser by Claude (no browser automation until Playwright in phase 4). 
**Phase 2 step 5 (documents page) is done**: verified through the rewrite (upload 202, polling to ready, 9.2 MB upload OK, 10.1 MB -> 413 with a clear message, 415 for unsupported, delete, 401 without cookie) and `next build`. Known gap: deleting a document while the worker is *already* embedding it doesn't stop the embedding (chunks are cleaned up afterwards, but Gemini quota is spent); a queued job is removed correctly. 
**Phase 2 step 6 (test-chat playground) is done, so Phase 2 is complete.** Verified: `next build` (/dashboard/playground is Partial Prerender), page renders, chat via the rewrite returns the cited answer and the `no_answer` handoff the UI expects, `parseCitations` checked on edge cases. Playground turns are independent (single-shot RAG); multi-turn comes with the phase 3 agent. Answers render as plain text with line breaks (no Markdown renderer yet). 
**Phase 3 plan**: (1) agent with tools, (2) conversations + multi-turn + streaming, (3) widget key, public API, rate limiting, (4) Vite widget in Shadow DOM, (5) Socket.io live handoff inbox.

**Phase 3 step 1 (agent with tools) is done.** Verified with real Gemini calls: cited price and cancellation answers; espresso machines -> searched twice then `not_in_docs` handoff (consistent across runs); "ship to Dubai?" -> answered no with citations (explicit in docs); order lookup with id+email -> status, without email -> asks for it; "talk to a person" -> `customer_requested`; damaged bag + email -> `createTicket` (saved under the right workspace); prompt injection refused. Typically 2-3 model calls and ~2.5-4.5s per question. `tickets` collection added.

**Phase 3 step 2 (conversations, multi-turn, streaming) is done.** `conversations` + `messages` collections (one doc per message, UIMessage parts stored as-is; run `npm run db:setup`). Client sends only `{ text }`; the server builds the user UIMessage, loads history, streams the reply as an AI SDK UI message stream (`pipeUIMessageStreamToResponse`), and saves it in `onEnd`. The model sees history as plain text only (last 12 messages, `[n]` stripped, no old tool results); every turn re-searches, so citations restart at [1] per reply. Verified with curl: follow-up "can I pause it?" resolved to the Explorer plan; order id in one message + email in the next -> lookupOrder; espresso -> handoff, conversation `handed_off`; other workspace / bad id -> 404; empty text -> 400; client disconnect after 1s -> full reply still saved (the UI stream is `tee()`d, one branch drained on the server); stream arrives incrementally through the Next rewrite. Timeout/abort and error replies are not saved and don't mark a handoff. Not click-tested in a browser yet. The bot still replies after a handoff (stopping it is step 5).

**Phase 3 step 3 (widget key, public API, rate limiting) is done** (API only; the dashboard page for the key comes with the widget in step 4). Widget key `wk_...` is public (stored plain, unique partial index on `widget.key`, created lazily by `ensureWidget`); `allowedOrigins` empty = any site. Public routes at `/api/public/w/:widgetKey` (key in the path so CORS preflights can be checked): GET config, POST conversations (returns `visitorToken` once; only its SHA-256 is stored), GET/POST conversation messages with `Authorization: Bearer <visitorToken>`; wrong/missing token = 404. Customers get `toPublicStream`/`toWidgetMessage` output (allowlist: text, step markers, errors, `data-sources` titles, `handedOff`; the handoff becomes plain text). The owner can read widget chats in the dashboard API but gets 409 posting into them. Rate limits (`RATE_LIMITS` in config.ts, fixed windows via a Lua INCR+EXPIRE script on a separate fail-fast ioredis connection, fail open if Redis is down): per IP 60 req/min, 10 chats/hour, 10 messages/min; per workspace 300 messages/hour, counted only after validation + token check (otherwise junk requests with the public key could exhaust a company's allowance). `TRUST_PROXY_HOPS` sets Express `trust proxy` for real client IPs. Verified with curl: filtered stream has no scores/tools/usage, handoff, history reload, tokens, bad key, origins (403 for others and for no Origin once set), CORS preflight headers, key rotation, each limit -> 429 + Retry-After. Known gaps: per-IP limits use the full IPv6 address (a /64 would be stricter); sources are streamed even on a handoff, so the widget must show only cited ones.

**Phase 3 step 4 (widget) is done.** `apps/widget`: Vite 8 library build to one IIFE (`dist/widget.js`), CSS imported `?inline` into a shadow root (`:host { all: initial !important }`, because inherited properties cross the boundary and important rules from inside the shadow win). Written as React, aliased to `preact/compat` in vite.config.ts: 57 KB gzipped vs 115 KB measured with real React; the rest is the AI SDK client (protocol + zod). Snippet: `<script src="PUBLIC_URL/widget.js" data-widget-key="wk_..." async>`; the API serves the file (5 min cache, CORP cross-origin) and the widget defaults its API URL to the script's origin (`data-api-url` overrides). Visitor session `{conversationId, visitorToken}` in the host's localStorage under `deskmate:<key>`. No API calls until first open; chat created on first send; only cited sources shown. Dashboard `/dashboard/widget`: snippet + copy, allowed origins editor (shared schema), rotate key with confirm. The 403 for a disallowed origin now carries CORS headers so the widget can show why. Verified in headless Brave with a scratchpad playwright-core (not a project dependency; real E2E tests are phase 4): host CSS isolation, no calls before open, streamed cited answer, follow-up, reload restores chat, Escape returns focus, handoff without sources, no console errors, phone full-screen panel, dashboard page save/validation, allowed vs refused origin. Known gap: one bundle for everything; a tiny loader that fetches the chat code on first open would cut the initial download. Gemini free tier had a slow spell (17-25s for a 5-token reply, no reasoning tokens), which can hit the 45s cap; it recovered to ~3s.

Observed so far: Gemini similarity scores bunch together (on-topic ~0.82, off-topic ~0.81 on the sample doc), so `MIN_RELEVANCE` alone can't separate them; guardrail 2 (`NO_ANSWER`) does most of the work. Tune with more docs and logs.

```
apps/api/
  src/config.ts             env validation (Zod), constants (EMBEDDING_DIMENSIONS=768, VECTOR_INDEX_NAME)
  src/db.ts                 Mongo client, DocumentRecord / ChunkRecord types
  src/lib/extract.ts        PDF (unpdf, per page) and .txt/.md extraction
  src/lib/chunk.ts          recursive splitter, ~1000 chars, 150 overlap, keeps page numbers
  src/lib/embed.ts          embedDocuments (RETRIEVAL_DOCUMENT), embedQuery (RETRIEVAL_QUERY)
  src/lib/retrieve.ts       $vectorSearch top 5, filtered by workspaceId, returns score
  src/lib/agent.ts          streamSupportAgent: ToolLoopAgent (max 6 steps, stops on handoffToHuman, step 0 forced to searchDocs); tools built per request, closing over workspaceId; text-only history; returns a tee'd UI message stream, onEnd saves
  src/lib/ai-errors.ts      describeAiError: Gemini 429 / timeout -> readable line sent inside the stream (status is already 200)
  src/lib/mock-orders.ts    MOCK order data for lookupOrder (needs order id AND email)
  src/lib/auth.ts           argon2id hashing, HS256 JWT (jose) in httpOnly cookie, requireAuth, getAuth
  src/lib/errors.ts         HttpError / UnauthorizedError / ConflictError, mapped in index.ts
  src/lib/workspace.ts      getWorkspaceId(req) from the verified session
  src/routes/auth.ts        POST signup (transaction: user + workspace + owner membership), login, logout; GET me
  src/routes/documents.ts   POST / (save to GridFS + queue, 202), GET /, GET /:id (status), DELETE /:id
  src/lib/ingest.ts         worker pipeline: extract, chunk, embed, replace chunks, waitUntilSearchable, mark ready
  src/lib/files.ts          GridFS bucket "uploads", file _id = document _id
  src/queue.ts              BullMQ "ingest" queue on Upstash (REDIS_URL); jobId = documentId
  src/worker.ts             separate process; concurrency 1; drainDelay 60s + stalledInterval 5m to save Upstash commands
  src/routes/conversations.ts dashboard: POST / (create playground chat), GET /:id, POST /:id/messages { text } -> streamed reply (playground chats only)
  src/routes/public.ts      widget API at /api/public/w/:widgetKey: per-IP limit, key lookup + origin check + CORS, visitor-token chats, filtered stream
  src/routes/widget.ts      owner: GET /api/widget, PUT /allowed-origins, POST /rotate-key
  src/lib/conversations.ts  createConversation, findConversation, loadMessages, replyToMessage (save user msg, run agent, save reply)
  src/lib/public-messages.ts toPublicStream / toWidgetMessage: customer-safe projection of replies
  src/lib/rate-limit.ts     rateLimit middleware + checkRateLimit; Redis Lua fixed window; fail open
  src/lib/widget.ts         widget key, visitor token (SHA-256 hash, timingSafeEqual), ensureWidget
  scripts/create-indexes.ts creates collections, indexes, vector index; waits until queryable
apps/web/                        Next.js 16 dashboard: (auth)/login, (auth)/signup, dashboard/ (layout + page + error)
  next.config.ts            /api/* rewrite to API_URL (same-origin cookie, no CORS); / redirects to /dashboard
  src/proxy.ts              optimistic check: no session cookie on /dashboard/* -> /login (never the reverse: loop risk)
  src/lib/session.ts        getCurrentUser(): forwards cookie to GET /api/auth/me; redirect('/login') on 401; not cached
  src/lib/api.ts            browser fetch helpers (apiFetch, postJson, ApiRequestError)
  src/components/auth/      login/signup forms (react-hook-form + zodResolver with shared schemas), logout button
  src/lib/documents.ts      TanStack Query hooks: useDocuments (polls every 2s only while any doc is processing), upload, delete; validateFile
  src/components/documents/ upload zone (click + drag-drop, multiple, client-side type/size check), table (status badges, failed reason, delete confirm)
  src/lib/chat.ts           useConversation, createConversation, messageText/messagePassages, chatErrorMessage, parseCitations
  src/components/playground/ useChat + DefaultChatTransport (sends only { text }; creates the conversation on first send; ?c=<id> in the URL reloads it); assistant-message renders live tool steps, cited text, passages, handoff box, latency/tokens
  src/components/providers.tsx  QueryClient (any 401 -> /login, no retry on 4xx) + sonner Toaster; wraps the dashboard layout
packages/shared/                 @deskmate/shared: Zod schemas + API response types (auth, chat, documents, errors)
apps/widget/                     embeddable widget (Vite lib build, IIFE, Shadow DOM, React code on preact/compat); index.html = demo host page with hostile CSS
  src/main.tsx              reads data-widget-key / data-api-url from the script tag, mounts in an open shadow root
  src/widget.tsx            launcher + panel (lazy-loaded on first open) + ChatView (useChat, DefaultChatTransport with Bearer visitor token)
  src/api.ts                public API client, chatErrorMessage, localStorage session
samples/brewbox-help-center.md   fake coffee-subscription help center for testing
```

`@deskmate/shared` ships TypeScript source with no build step (`exports` map each subpath to `src/*.ts`; tsx and Next.js compile it). Import by subpath, e.g. `@deskmate/shared/auth`; there is no index, so shared files don't need `.js` relative imports. Request schemas and response types live there; DB record types stay in `apps/api/src/db.ts`. API responses use `id` (string), never `_id` or `workspaceId`. Root `npm run typecheck` checks every workspace.

**Next.js 16 differs from older versions** (Middleware is now `proxy.ts`, Cache Components on). Before writing web code, read `apps/web/AGENTS.md` and the matching guide in `node_modules/next/dist/docs/`. With Cache Components, anything reading `cookies()` (e.g. `getCurrentUser`) must sit inside `<Suspense>`, never at the top of a layout. Run `npm run build -w apps/web` to catch that; dev only warns. shadcn/ui uses the Radix base, Nova preset, and the `cn` package (shadcn's clsx + tailwind-merge replacement). Pin new frontend deps to releases at least ~2 weeks old. The AI SDK is pinned exactly and identically in api, web and shared (`ai` 7.0.140, `@ai-sdk/react` 4.0.143, `@ai-sdk/google` 4.0.95, all sharing `@ai-sdk/provider-utils` 5.0.59) so there is one copy of `ai` and its types match; upgrade them together. In v7, `agent.stream()` returns a Promise. `experimental.proxyClientMaxBodySize: '11mb'` in next.config.ts is required: Next only buffers 10 MB of a forwarded body by default, which truncated uploads at the limit into a bare 500.

Root commands: `npm run dev:widget` (demo page on :5173, needs apps/widget/.env.local), `npm run build:widget` (needed before the API can serve /widget.js). Commands (from `apps/api`): `npm run db:setup`, `npm run dev` (API), `npm run dev:worker` (worker, separate terminal), `npm run typecheck`. Test calls are in the root `README.md`.

Guardrails against hallucination (agent version, Phase 3):
0. Step 0 is forced to `searchDocs`, so the model never answers from general knowledge without looking.
1. `searchDocs` drops passages below `MIN_RELEVANCE` (0.7) before the model sees them.
2. The instructions make the model call `handoffToHuman` (`not_in_docs`) when the passages don't answer; the loop stops and the customer gets a fixed handoff message. Absence is not a "no": "don't mention X" -> hand off; only an explicit statement in the docs (e.g. "we do not ship outside India") may be answered as no.
3. Passages and tool results are data, not instructions (prompt-injection defense). Answers are plain text, no Markdown.
Citation numbers are assigned per request across all searches (same chunk = same [n]).

## Environment notes

- Atlas Network Access: add current IP for local dev. Use `0.0.0.0/0` only when deploying to a host without a static IP, together with a long random password and a least-privilege DB user (readWrite on `deskmate` only).
- Gemini free tier: Flash models and embeddings are free but rate-limited per project (check limits in Google AI Studio). Pro models are paid; don't use them. Free-tier inputs may be used by Google, so only sample data goes in. Handle 429s gracefully.

## Roadmap

### Phase 2: accounts, workspaces, dashboard
- `users`, `workspaces`, `memberships` collections. Signup/login with hashed passwords (argon2 or bcrypt), JWT in an httpOnly cookie for the dashboard.
- Replace `getWorkspaceId` stub with auth middleware. Routes should not need other changes.
- Move ingestion to a **BullMQ** queue (Redis, Upstash in prod). Upload returns `202` with `status: processing`; the worker extracts, chunks, embeds with retry/backoff on 429; dashboard polls status.
- `apps/web`: Next.js App Router, Tailwind, shadcn/ui. Pages: login/signup, documents (upload, status, delete), a test-chat playground showing sources and scores.
- `packages/shared`: Zod schemas and types shared by API, web and widget.

### Phase 3: widget, agent, live handoff
- `conversations` and `messages` collections. Per-workspace **public widget key** (store only a hash of any secret key).
- Replace single-shot RAG with an AI SDK agent loop (`ToolLoopAgent`, step cap) and tools: `searchDocs`, `lookupOrder` (mock API), `createTicket`, `handoffToHuman`.
- Stream responses to the UI (AI SDK UI message stream, `useChat`).
- `apps/widget`: Vite build into one script; render inside **Shadow DOM** so host CSS can't break it; accessible, mobile-friendly.
- **Socket.io**: dashboard inbox where a human takes over a conversation in real time; the bot stops replying once handed off.
- Per-IP and per-workspace rate limiting.

### Phase 4: evals, tests, CI, monitoring
- **Eval suite**: a JSONL golden set (~50 questions: answerable, unanswerable, prompt-injection). Measure retrieval hit rate (expected source in top 5), answer faithfulness (LLM-as-judge), and correct handoff rate. Script prints a report; fails CI below thresholds. Pace calls for free-tier limits.
- Tests: **Jest** (Rishabh's resume lists Jest) for units like `chunk.ts`; **Supertest** for API routes; **React Testing Library** for components; **Playwright** E2E (upload → ask → cited answer; unanswerable → handoff).
- **GitHub Actions**: lint, typecheck, tests on every push; evals on main.
- **Sentry** in API and web. Log cost and latency per conversation; show them in the dashboard.

### Phase 5: MCP, deployment, polish
- **MCP server** exposing a workspace's knowledge base (`search_knowledge_base` tool), authenticated by workspace API key, so tools like Claude or Cursor can query it.
- Deploy: web on Vercel (`apps/web` root), API + worker on Render or Railway (`apps/api` root), Upstash Redis, Atlas. Docker Compose for local dev.
- README: architecture diagram, screenshots, live demo link, how evals work, privacy note (real customer data needs a paid LLM tier).
- 2-minute demo video. Then update Rishabh's resume Projects section with true, specific bullets.

## Interview talking points to keep accurate

Chunking size and overlap, asymmetric embeddings (document vs query task types), tenant isolation via filtered vector search, two-layer hallucination guardrail, prompt-injection handling, why ingestion moves to a queue, why a monorepo, `0.0.0.0/0` trade-off vs private endpoints, free-tier data-privacy trade-off, text-only history vs replaying tool results, client sends only text (server owns history), tee'd stream so replies survive disconnects, why stream errors can't be HTTP status codes, public widget key vs hashed visitor token (SHA-256 vs argon2), Origin allowlist limits (browsers can't fake it, scripts can), allowlist filtering of the customer stream, fixed-window trade-off, fail-open limiter, counting the workspace limit only after validation, Shadow DOM isolation (and the inherited-property caveat), React code on Preact for bundle size (measured), widget served by the API so the snippet is one URL.
