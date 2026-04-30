# MLP Scoreboard

Pickleball league scoreboard with real auth, invite-only signups, role-based admin, profiles, and realtime chat. Built with **Next.js 15 (App Router)** + **Supabase** (auth, Postgres, storage, realtime), deployed on **Vercel**.

The original vanilla-JS scoreboard is preserved at `public/legacy/` and embedded behind auth at `/scoreboard` while the scoring logic is being ported.

---

## 1. Local setup

```bash
npm install
cp .env.example .env.local
# fill in the values from your Supabase project — Settings > API
npm run dev
```

Open http://localhost:3000.

## 2. Supabase setup

1. Create a project at https://supabase.com
2. **SQL Editor > new query** > paste & run, in order:
   - `supabase/migrations/0001_initial.sql`
   - `supabase/migrations/0002_storage.sql`
3. **Authentication > URL Configuration**
   - Site URL: `https://<your-vercel-domain>` (and `http://localhost:3000` for dev)
   - Redirect URLs: add `http://localhost:3000/auth/confirm` and `https://<your-vercel-domain>/auth/confirm`
4. **Authentication > Providers > Email**: enable magic link.
5. **Settings > API**: copy anon key and service-role key into `.env.local`.

### Make yourself admin

After your first sign-in (insert an `invites` row for your email first, then visit `/login`):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

## 3. Deploy to Vercel

1. Push this branch and import at https://vercel.com/new
2. **Environment variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` = `https://<your-vercel-domain>`
3. Re-add the Vercel domain to Supabase Auth > URL Configuration.
4. Deploy.

---

## Architecture

```
src/
  middleware.ts          refreshes Supabase session, gates private routes
  lib/supabase/          browser / server / middleware / service-role clients
  lib/auth.ts            requireUser / requireProfile / requireRole helpers
  app/
    layout.tsx           top-level shell + Nav
    page.tsx             landing
    login/               magic-link sign-in (gated by invite OR existing user)
    signup/              token-gated invite acceptance
    auth/                confirm + signout routes
    profile/             editable profile + avatar upload (Supabase Storage)
    admin/               invite mgmt (organizer+) and role mgmt (admin)
    chat/                realtime general channel
    scoreboard/          embeds public/legacy/index.html behind auth
public/legacy/           original vanilla-JS app (Firebase RTDB sync)
supabase/migrations/     SQL schema + RLS + storage policies
```

### Roles

- **player** (default) — edit own profile, chat, view scoreboard.
- **organizer** — + create invites.
- **admin** — + delete invites, change any user's role.

### Invite-only signup, in two layers

1. The `/login` server action checks `invites` (or existing users) before sending a magic link — strangers can't trigger Supabase to email anyone.
2. `/signup?token=...` lets an invitee accept, prefilling display name. The DB trigger `handle_new_user` looks up the invite by email at sign-up time, grants the attached role, and marks the invite accepted.

---

## Pickleball ecosystem integrations

### DUPR (Dynamic Universal Pickleball Rating)

DUPR is the de-facto rating standard. There **is** a partner API, but access is gated — apply at <https://dupr.com/developers>. No public OAuth.

What this app supports today:

- **DUPR ID + ratings on the profile** (singles + doubles) so organizers can use them for seeding.
- Manual entry. The form hints at the public profile URL (`dashboard.dupr.com/dashboard/player/<id>`).

Roadmap when API access is granted:

- Server-side nightly rating sync (Vercel Cron + service token).
- Match result push so league games count toward DUPR.

### Other useful integrations

- **Pickleball Brackets / PickleballTournaments.com** — public scrapeable brackets, no API. Useful for importing rosters; brittle.
- **PicklePlay / Pickle Pro Labs** — open-play check-ins. Mobile-first, no public API.
- **Pickleheads** — court finder + open play. Public web, no documented API.
- **Stripe** — paid league registration / tournament fees.
- **Resend / Postmark** — transactional email for invites if you outgrow Supabase's built-in email rate limit.
- **Twilio Verify or Supabase phone OTP** — phone-based sign-in, useful at courtside.
- **Vercel Cron** — nightly DUPR sync, weekly digests.

### Near-term wins (no DUPR partnership needed)

1. Profile + manual DUPR field — shipped here.
2. Invite-driven roster so organizers seed brackets from the app instead of a spreadsheet.
3. Chat channels per tournament (extra column on `messages` + channel switcher).
4. Stripe Checkout for league fees.
5. Public player pages at `/p/[displayName]` with avatar + DUPR badge.

---

## Migration status

- [x] Auth + invites + roles + chat + profiles.
- [ ] Port round-robin / fixed-partners scoring from `public/legacy/index.html` into React.
- [ ] Replace Firebase RTDB sync with Supabase realtime.
- [ ] Tournament + match tables in Postgres.

Until the scoring logic is ported, `/scoreboard` iframes the legacy app — which still uses Firebase RTDB for live sync, and works as it always did.
