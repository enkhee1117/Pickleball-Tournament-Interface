# Handoff — finish Vercel + Supabase deploy

You are picking up a Next.js 15 + Supabase migration that has been merged to `main`. The user already started a Vercel deployment from the GitHub repo but **did not add any environment variables or finish setup**. Your job: use the **Vercel MCP** and **Supabase MCP** to complete the deploy and verify it works.

## Repo & branch

- Repo: `enkhee1117/mlp-scoreboard`
- Active branch: `main` (PR #5 merged)
- Working dir locally (if you need it): `/home/user/mlp-scoreboard`

## What's already done

| Item | Status |
|---|---|
| Next.js 15 + Supabase + Tailwind scaffold | done in repo |
| Auth: magic link, invite-only, RLS | done |
| Admin UI (invites + roles) | done |
| Profile page + avatar upload | done |
| Realtime chat (`#general`) | done |
| Legacy scoreboard preserved at `/public/legacy/`, embedded at `/scoreboard` | done |
| `npm run build` passes locally | done |
| Supabase project created by user | done |
| Migrations `0001_initial.sql` + `0002_storage.sql` run | done (per user) |
| Supabase Auth -> URL Configuration set for `localhost:3000` | done (per user) |
| User self-invited as admin via `insert into invites` | done (per user) |
| Vercel project created from GitHub repo (deploy started) | NO env vars yet |

## What you need to do

### 1. Find the Vercel project

Use the Vercel MCP to list projects and find the one for `enkhee1117/mlp-scoreboard`. Capture:

- The project ID (or slug)
- The production domain (something like `https://<slug>.vercel.app`)

### 2. Find the Supabase project

Use the Supabase MCP to list projects. Find the one tied to this app (the user has only set up one for this). Capture:

- The project ref / URL: `https://<ref>.supabase.co`
- The anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- The service role key (`SUPABASE_SERVICE_ROLE_KEY`)

If the Supabase MCP doesn't expose the keys directly, ask the user to paste them once.

### 3. Set Vercel environment variables

Set the following four env vars on the Vercel project, scope = **Production, Preview, Development** (all three):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from step 2 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from step 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 2 — **mark as secret, server-only** |
| `NEXT_PUBLIC_SITE_URL` | the Vercel production domain from step 1, no trailing slash |

### 4. Trigger a redeploy

The first build (started by the user) almost certainly failed or built without env vars. Trigger a fresh production deploy via the Vercel MCP so the env vars take effect.

Wait for build completion. If the build fails, read the build log, identify the issue, fix in the repo, push to `main`, and redeploy. Common failure modes:

- Missing env var at build time -> only happens for vars used during static page generation; ours are used at request time so this should be fine.
- TypeScript error -> verified `npx tsc --noEmit` passes locally on the merged code.
- ESLint error -> Next.js fails build on errors by default. Either fix it or temporarily set `eslint: { ignoreDuringBuilds: true }` in `next.config.mjs` (prefer fixing).

### 5. Update Supabase Auth URL configuration

Use the Supabase MCP (or update via API if MCP doesn't expose it) to set:

- **Site URL**: the Vercel production domain
- **Additional Redirect URLs**: add
  - `https://<vercel-domain>/auth/confirm`
  - `https://<vercel-domain>/**`
  - keep `http://localhost:3000/auth/confirm` and `http://localhost:3000/**` for local dev

If the MCP can't change auth URL config, ask the user to do it in the dashboard (Authentication -> URL Configuration) and tell them exactly what to enter.

### 6. Smoke test the production deploy

Use `WebFetch` to GET the production URL and confirm:

- `/` returns 200 with the landing page (will redirect to `/login` since you're not authed — that's the expected behavior)
- `/login` returns 200 and shows the email form
- `/legacy/index.html` returns 200 (legacy scoreboard, public)

Then **ask the user to test the signed-in flow manually** because magic-link sign-in requires their email inbox:

> Please test:
> 1. Visit `<vercel-url>/login`, enter the email you self-invited with, click "Send magic link"
> 2. Check your inbox, click the link -> you should land on `/` signed in
> 3. Visit `/admin` -> invite + role panels should render
> 4. Visit `/profile` -> upload an avatar
> 5. Visit `/chat` -> send a message
> 6. Visit `/scoreboard` -> legacy app loads behind auth
>
> Tell me which steps work and paste any error messages from the browser, the URL bar, or Supabase Auth -> Logs.

### 7. Fix anything that breaks

Anticipated likely failures and fixes:

| Symptom | Likely cause | Fix |
|---|---|---|
| Magic link redirects to `localhost:3000` | `NEXT_PUBLIC_SITE_URL` not set or build was cached | Re-set env var, redeploy |
| Magic link errors with "redirect_to is not allowed" | Vercel domain not in Supabase Auth -> Redirect URLs | Add it (step 5) |
| Avatar upload fails with policy error | `0002_storage.sql` didn't run, or `avatars` bucket missing | Use Supabase MCP to re-run the storage migration |
| `/admin` shows "redirected to /" | Your profile's role isn't `admin` | `update profiles set role='admin' where id = (select id from auth.users where email='<user-email>')` |
| Build fails with `Module not found: @supabase/ssr` | Vercel didn't install deps | Check `package.json`, force redeploy with **Redeploy -> without cache** |
| Build fails complaining about Supabase env vars at build time | `next.config.mjs` is using them statically | They aren't currently — but if you find one, switch to runtime read |

### 8. Update the GitHub repo (optional)

If you needed to fix any code to make the deploy work:

- Commit the fixes to `main` directly (no PR needed for small fixups, or use a PR if substantial).
- The user has subscribed to PR activity in past sessions — they prefer draft PRs for review.

## Useful repo paths

- `src/app/login/actions.ts` — invite-only sign-in gate (uses service-role to check `auth.users` and `invites`)
- `src/app/auth/confirm/route.ts` — magic-link redirect handler
- `src/lib/supabase/middleware.ts` — session refresh + route guard (`PUBLIC_PATHS = ['/login','/signup','/auth','/legacy']`)
- `src/middleware.ts` — middleware matcher
- `supabase/migrations/0001_initial.sql` — schema, RLS, `handle_new_user` trigger
- `supabase/migrations/0002_storage.sql` — `avatars` bucket + storage policies
- `README.md` — full setup walkthrough including DUPR/pickleball integration notes

## Notes on tone & process

- The user prefers short, direct messages with concrete next steps.
- Don't redo work that's already done — they've already run the migrations and self-invited.
- If the Vercel or Supabase MCP can't perform an action, ask the user to do it via the dashboard with exact click-paths instead of explaining at length.
- Any tasks you add to the user's plate, batch them — don't send 5 messages each asking for one thing.

## Quick reference: re-running migrations via Supabase MCP

If you ever need to re-run the migrations (e.g. on a fresh Supabase project), the Supabase MCP typically exposes an `apply_migration` or `execute_sql` tool. Files to apply, in order:

1. `supabase/migrations/0001_initial.sql`
2. `supabase/migrations/0002_storage.sql`

Both are idempotent-ish (most use `create`, not `create if not exists`) so don't blindly re-run on a populated DB.

---

End of handoff. Start by listing Vercel and Supabase projects, then drive steps 1-7.
