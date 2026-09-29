# MIU Portal

Project management and stakeholder portal for the **Mombasa International
University** project, under the African University Trust of Kenya (AUTK).

The portal is the shared record for a project whose participants are spread
across Türkiye, Mombasa and Nairobi: what was decided, who committed to what,
which obligations the trust carries, and how the site and the budget stand.

> **Status: early.** The requirements are written up in
> [`docs/URUN-GEREKSINIMLERI.md`](docs/URUN-GEREKSINIMLERI.md) (Turkish, 240
> numbered requirements across 15 modules). The application itself is at the
> start of Phase 0 of that plan — the groundwork phase, whose goal is a build
> that runs, verifies and does not overstate what it holds.
>
> There is **no authentication yet**, and no row level security. Do not put
> real confidential project material into a deployment until Phase 1
> (identity, roles and the four-tier confidentiality model) is done.

## Requirements

- Node.js 22+
- A Supabase project (optional for local work — the app runs without one and
  says so on screen)

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

Without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` the app still starts.
Every screen shows a banner explaining that no data source is connected, so an
empty list is never mistaken for "no records".

## Scripts

| Script               | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `npm run dev`        | Development server                                        |
| `npm run build`      | Production build                                          |
| `npm run preview`    | Serve the production build locally                        |
| `npm run typecheck`  | `tsc --noEmit`                                            |
| `npm run lint`       | ESLint                                                    |
| `npm run format`     | Prettier, writing in place                                |
| `npm run test:smoke` | Browser smoke test over every route (needs a build first) |
| `npm run verify`     | Everything above, in the order CI runs it                 |

## The AI assistant

The contextual assistant calls a **server-side** function; the model API key
must never reach the browser. Deploy `supabase/functions/ai-assistant`, set
`GEMINI_API_KEY` as a function secret, and point `VITE_AI_PROXY_URL` at it.
Until then the assistant renders in a disabled state that says so.

Note that the proxy does not yet filter retrieval by the caller's clearance
(requirements M13-02 and M13-03). Do not widen what it can read until it does.

## Stack

React 19 · TypeScript · Vite · Tailwind · TanStack Query · Supabase · PWA

## Layout

```
src/
  api/          data fetching and mutations (Supabase)
  components/   shared UI
  context/      app-wide state (language, current user)
  i18n/         Turkish and English strings
  lib/          Supabase client, date and unit helpers
  types/        domain model
  views/        one per route
supabase/
  functions/    server-side functions
tests/
  smoke.mjs     route-level smoke test
docs/
  URUN-GEREKSINIMLERI.md   requirements
```

## Language and units

Turkish and English are treated as equals, not as a base language plus a
translation. Land area is recorded in acres and converted for Turkish readers
by `src/lib/units.ts` — 84 acres is about 340 dönüm, not 84.
