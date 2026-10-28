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
**Phase 2 step 4 (`apps/web` login/signup) is done**: verified through the dev server (rewrite signup/login/logout, cookie HttpOnly on localhost, proxy redirect, forged cookie -> /login, dashboard streams user + workspace) and `next build` (/dashboard is Partial Prerender, login/signup static). Not yet click-tested in a real browser by Claude (no browser automation until Playwright in phase 4). Next: step 5, documents page.

Observed so far: Gemini similarity scores bunch together (on-topic ~0.82, off-topic ~0.81 on the sample doc), so `MIN_RELEVANCE` alone can't separate them; guardrail 2 (`NO_ANSWER`) does most of the work. Tune with more docs and logs.

```
apps/api/
  src/config.ts             env validation (Zod), constants (EMBEDDING_DIMENSIONS=768, VECTOR_INDEX_NAME)
  src/db.ts                 Mongo client, DocumentRecord / ChunkRecord types
  src/lib/extract.ts        PDF (unpdf, per page) and .txt/.md extraction
  src/lib/chunk.ts          recursive splitter, ~1000 chars, 150 overlap, keeps page numbers
  src/lib/embed.ts          embedDocuments (RETRIEVAL_DOCUMENT), embedQuery (RETRIEVAL_QUERY)
  src/lib/retrieve.ts       $vectorSearch top 5, filtered by workspaceId, returns score
  src/lib/answer.ts         relevance guardrail, grounded generation with [n] citations, NO_ANSWER -> handoff
  src/lib/auth.ts           argon2id hashing, HS256 JWT (jose) in httpOnly cookie, requireAuth, getAuth
  src/lib/errors.ts         HttpError / UnauthorizedError / ConflictError, mapped in index.ts
  src/lib/workspace.ts      getWorkspaceId(req) from the verified session
  src/routes/auth.ts        POST signup (transaction: user + workspace + owner membership), login, logout; GET me
  src/routes/documents.ts   POST / (save to GridFS + queue, 202), GET /, GET /:id (status), DELETE /:id
  src/lib/ingest.ts         worker pipeline: extract, chunk, embed, replace chunks, waitUntilSearchable, mark ready
  src/lib/files.ts          GridFS bucket "uploads", file _id = document _id
  src/queue.ts              BullMQ "ingest" queue on Upstash (REDIS_URL); jobId = documentId
  src/worker.ts             separate process; concurrency 1; drainDelay 60s + stalledInterval 5m to save Upstash commands
  src/routes/chat.ts        POST / { question } -> { answer, sources, handoff, usage, latencyMs }
  scripts/create-indexes.ts creates collections, indexes, vector index; waits until queryable
apps/web/                        Next.js 16 dashboard: (auth)/login, (auth)/signup, dashboard/ (layout + page + error)
  next.config.ts            /api/* rewrite to API_URL (same-origin cookie, no CORS); / redirects to /dashboard
  src/proxy.ts              optimistic check: no session cookie on /dashboard/* -> /login (never the reverse: loop risk)
  src/lib/session.ts        getCurrentUser(): forwards cookie to GET /api/auth/me; redirect('/login') on 401; not cached
  src/lib/api.ts            browser fetch helpers (apiFetch, postJson, ApiRequestError)
  src/components/auth/      login/signup forms (react-hook-form + zodResolver with shared schemas), logout button
packages/shared/                 @deskmate/shared: Zod schemas + API response types (auth, chat, documents, errors)
samples/brewbox-help-center.md   fake coffee-subscription help center for testing
```

`@deskmate/shared` ships TypeScript source with no build step (`exports` map each subpath to `src/*.ts`; tsx and Next.js compile it). Import by subpath, e.g. `@deskmate/shared/auth`; there is no index, so shared files don't need `.js` relative imports. Request schemas and response types live there; DB record types stay in `apps/api/src/db.ts`. API responses use `id` (string), never `_id` or `workspaceId`. Root `npm run typecheck` checks every workspace.

**Next.js 16 differs from older versions** (Middleware is now `proxy.ts`, Cache Components on). Before writing web code, read `apps/web/AGENTS.md` and the matching guide in `node_modules/next/dist/docs/`. With Cache Components, anything reading `cookies()` (e.g. `getCurrentUser`) must sit inside `<Suspense>`, never at the top of a layout. Run `npm run build -w apps/web` to catch that; dev only warns. shadcn/ui uses the Radix base, Nova preset, and the `cn` package (shadcn's clsx + tailwind-merge replacement). Pin new frontend deps to releases at least ~2 weeks old.

Commands (from `apps/api`): `npm run db:setup`, `npm run dev` (API), `npm run dev:worker` (worker, separate terminal), `npm run typecheck`. Test calls are in the root `README.md`.

Two guardrails against hallucination:
1. If no retrieved chunk scores ≥ `MIN_RELEVANCE` (default 0.7, needs tuning from real logs), return a handoff without calling the LLM.
2. The system prompt makes the model reply `NO_ANSWER` when the passages don't contain the answer; that also becomes a handoff. The prompt also treats passages as data, not instructions (prompt-injection defense).

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

Chunking size and overlap, asymmetric embeddings (document vs query task types), tenant isolation via filtered vector search, two-layer hallucination guardrail, prompt-injection handling, why ingestion moves to a queue, why a monorepo, `0.0.0.0/0` trade-off vs private endpoints, free-tier data-privacy trade-off.
