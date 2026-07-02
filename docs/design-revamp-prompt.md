# Design Revamp Prompt — Try to Dink

> Paste this whole document into a design session (Claude Design, Figma AI, or a human designer). It is self-contained: brand, real code, the current design system, every known UX issue, and the deliverable format. You should not need the repo to start.

---

## 0. What we're building

**Try to Dink** (`trytodink.com`) is a gamified pickleball tournament app. The signature format is the **Partner Mixer**: players spend tokens to *vote* for who they want to partner with, votes stay blind, then a weighted draw reveals pairings live on a big screen. There's also pooled betting, a raffle, and standard round-robin / fixed-partner / bracket formats. Built in Next.js 15 (App Router) + Supabase, deployed on Vercel.

**The app is mobile-first and polished at 480px. It has never been designed for desktop.** On a laptop today, every screen is a phone-width column with empty margins. That's the primary job of this revamp — plus a set of UX gaps listed in §6.

**Rebrand context:** the product was called TourneyPal until recently. It's now **Try to Dink**. The mascot — a bird named **Dink** — predates the rename, so "Try to Dink" now doubles as a friendly courtside imperative. Lean into that personality. The mark (a court-diamond with a dashed net line and two ball dots) did **not** change; only the wordmark text did.

---

## 1. Brand tokens (real, from `globals.css` — do not invent new colors)

```css
:root, :root[data-theme='sideline'] {   /* Sideline = default, bright */
  --paper:      oklch(0.97 0.008 95);    /* app background, warm off-white */
  --paper-2:    oklch(0.94 0.012 95);    /* chips, subtle surfaces */
  --ink:        oklch(0.18 0.01 80);     /* primary text + dark surfaces */
  --ink-2:      oklch(0.35 0.01 80);     /* secondary text */
  --ink-3:      oklch(0.55 0.01 80);     /* muted, captions */
  --line:       oklch(0.86 0.012 95);    /* borders, dividers */
  --court:      oklch(0.78 0.18 135);    /* THE accent — court green */
  --court-deep: oklch(0.55 0.16 138);    /* accent text on light bg */
  --serve:      oklch(0.7 0.19 48);      /* live / serving indicators (orange) */
  --berry:      oklch(0.55 0.2 12);      /* destructive / negative (red) */
  --sky:        oklch(0.78 0.12 230);    /* optional accent */
}

:root[data-theme='night'] {  /* dark; also the hardcoded Mixer surface */
  --paper: oklch(0.155 0.024 264);  --paper-2: oklch(0.205 0.028 264);
  --ink:   oklch(0.96 0.008 95);    --line:    oklch(0.29 0.02 264);
  --court: oklch(0.82 0.19 135);    /* ...court green stays the accent */
}

:root[data-theme='arcade'] {  /* plum tint, light */
  --paper: oklch(0.96 0.022 320);   --ink: oklch(0.22 0.06 320);
  --court: oklch(0.78 0.18 135);    /* court green STILL the accent */
}
```

**Rule: exactly one brand accent — court green.** Themes change surface mood, never the accent. `--serve` (orange) is only for live/serving state; `--berry` (red) only for destructive actions.

### Type system
| Family | Usage |
|---|---|
| **Instrument Serif** (`.serif`) | Editorial headlines, name-reveal moments. Italic on the emphasis line. |
| **Geist** (default) | All UI text, buttons, labels. |
| **JetBrains Mono** (`.mono`) | Scores, invite codes, DUPR ratings, timers, any number. |

Signature headline pattern — plain line, then italic accent line:
```
Run a tournament
without spreadsheets.   ← italic, color: var(--court)
```

### Radii & spacing
- Cards 16–18px · hero 22px · buttons 14–16px · chips fully round · avatars circular
- Standard side padding 18px · hit targets **≥44px** everywhere

### Mascot
Dink poses ship in `public/design-handoff/dink/`: `token`, `presenting`, `celebrating`, `champion`, `wave`, `won` (each has a `-t` transparent variant). Use them in empty states, reveals, and celebrations.

---

## 2. The app shell (real code — `layout.tsx`)

Everything lives inside a **480px max-width column** with a fixed bottom tab bar. This is exactly what breaks desktop:

```tsx
<body className="bg-paper text-ink">
  <div className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col">
    <main className="flex flex-1 flex-col">{children}</main>
    <TabBar />   {/* fixed bottom: Today / Play / Stats / Me */}
  </div>
</body>
```

Auth pages opt out of the 480px cap via a `data-fullscreen` escape hatch already added:
```css
body:has([data-fullscreen]) > div { max-width: none; }
body:has([data-fullscreen='ink']) { background: var(--ink); }
```
**Your desktop designs will need this escape hatch generalized** — decide how the shell, tab bar, and max-width behave at ≥1024px for signed-in surfaces (see §5).

### TopBar (real — the only header primitive today)
```tsx
export function TopBar({ title, sub, left, right, dark }: Props) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-[18px] pt-[10px] pb-[14px]">
      <div className="flex min-w-10 shrink-0 justify-start">{left}</div>
      <div className="flex flex-1 flex-col items-center gap-0.5 text-center">
        {title && <div className="text-[15px] font-semibold tracking-tight">{title}</div>}
        {sub && <div className="text-[11px] uppercase tracking-[0.04em]">{sub}</div>}
      </div>
      <div className="flex min-w-10 shrink-0 justify-end">{right}</div>
    </div>
  );
}
```
It's center-titled and mobile-shaped. On desktop it likely becomes a real top nav (logo left, actions right, maybe tournament switcher).

---

## 3. Representative screen (real — `/tournaments`, the list)

This is a good stand-in for the "mobile column on desktop" problem. On a 1440px screen this renders as a 480px strip of cards with huge empty margins:

```tsx
<div className="flex min-h-full flex-col bg-paper">
  <TopBar title="Your tournaments" right={<Link href="/tournaments/new">＋</Link>} />
  <div className="px-[18px] pb-24 pt-1">
    {/* filter chips: All / Live / Drafts / Past */}
    {/* welcome banner on ?welcome=1 */}
    {tournaments.length === 0 ? (
      <div className="rounded-2xl bg-white p-6 text-center" style={{ border: '1px dashed var(--line)' }}>
        <div className="text-[15px] font-semibold text-ink">No tournaments here yet</div>
        <div className="mt-1 text-xs text-ink-3">Create a Mixer, round robin, or bracket…</div>
      </div>
    ) : (
      <div className="space-y-2.5">{tournaments.map((t) => <TournamentRow key={t.id} t={t} />)}</div>
    )}
  </div>
</div>
```
`TournamentRow` is a full-width card: 48px status disc (pulsing green dot if live, else trophy), name, `format · status`, chevron. **Desktop wants a dense grid or table here** — an organizer running 4 events should see them at a glance.

### The Mixer night surface (real — hardcoded dark, ignores theme)
Player + admin + present pages all hardcode:
```tsx
<div style={{ background: 'oklch(0.155 0.024 264)', color: 'oklch(0.975 0.012 264)' }}>
```
This is intentional "show business" — the Mixer is always dark. Card surfaces use `oklch(0.215 0.03 264)` with `1px solid oklch(0.36 0.04 266)` borders, court green for accents/values.

---

## 4. Auth split-screen (real — the ONE desktop pattern that exists)

Login/signup/forgot/reset already got a stopgap desktop layout. Use it as a reference for tone, or redesign:
```tsx
<div data-fullscreen="ink"
  className="relative flex min-h-[100dvh] flex-col overflow-hidden lg:flex-row"
  style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
  {/* LEFT: brand — TPMark, giant serif hero, tagline */}
  <div className="lg:flex-1 lg:justify-between lg:p-16">…</div>
  {/* RIGHT: form card ≤560px, left border */}
  <div className="lg:w-[560px] lg:justify-center lg:border-l lg:p-16">…</div>
</div>
```
Court-motif SVG floats top-right on mobile, repositions center-left at `lg:`.

---

## 5. The theme-consistency decision (please resolve in your proposal)

Today there are two visual discontinuities the founder flagged:

1. **Landing (`/`) is paper-light** with a dark hero card, but **auth pages are fully dark ink.** Clicking "Sign in" from the landing is a jarring light→dark flip.
2. **Mixer pages are always dark** regardless of the user's chosen theme (intentional). Everything else respects Sideline/Night/Arcade.

Pick one and design to it:
- **A — everything dark:** landing, auth, Mixer all share the ink surface; Sideline light theme only for signed-in non-Mixer utility screens.
- **B (lean) — auth respects theme, Mixer stays dark:** in Sideline mode auth is light and continuous with the landing; Mixer remains its dark show surface. Landing stays paper-light.
- **C — contextual:** auth inherits whatever surface the user came from.

State your choice and show the transition (landing → sign-in) explicitly so it doesn't whiplash.

---

## 6. Known UX/interface issues to fix in the revamp

Design solutions for all of these. Grouped by severity.

### 🔴 Blockers
1. **Landing → auth color whiplash** (see §5).
2. **`/tournaments/[id]` scoreboard hub** renders as a mobile column on desktop — it's the most-used organizer surface. Wants matches + standings side-by-side, bracket as a real diagram. (It's also a 1272-line god page in code — a clean desktop IA will help the eventual refactor.)
3. **`/tournaments/[id]/mixer/admin`** — 5 tabs (Run / Roster / Scores / Prizes / Setup). This is the organizer's live-event cockpit, used on a laptop while running the room. Needs a dashboard-style desktop layout; the **Run** tab especially (ballot state, draw button, live scores) should read like mission control.
4. **Mixer reveal has no animation.** The state machine advances (open→lock→drawing→revealed) and the page just re-renders. The single most emotional moment in the product is currently a silent content swap. Design the reveal choreography: suspense → draw → Instrument Serif name reveal, court by court.

### 🟡 Gaps
5. **No password-reveal (eye) toggle** on any password field.
6. **Error messages are plain text rows** with no recovery affordance. After a failed sign-in, surface "Forgot password?" inline; consider a subtle shake.
7. **`/join` invite-code input** (6 mono slots) doesn't handle a pasted full code — should distribute `ABC123` across slots. Desktop wants a centered modal-card with ~64px slots.
8. **Toasts are `?ok=` / `?error=` query params** — they linger in the URL. Replace with a real toast component (auto-dismiss, cleans the URL). A `<Notice>` component already exists to build on.
9. **Empty states are plain** except in the Mixer. Bring Dink poses into empty tournament list, empty matches, empty standings, empty history.
10. **Six routes have no `loading.tsx`**: `/tournaments/new`, `/tournaments/[id]/match/[matchId]`, `/tournaments/[id]/invite`, `/join`, `/login`, `/signup`. Design skeletons.
11. **Inconsistent back navigation** — some screens have a back arrow, some don't; browser-back sometimes breaks server-action redirects. Define a consistent nav model (esp. on desktop).
12. **First-run onboarding is a green banner** on `?welcome=1`. No guided "create your first event." Design a real activation moment.

### ⚪ Polish
13. **Score entry** — no team-color panels (A=court green, B=serve orange), no SERVE badge, no confetti on the winning score. Keyframes exist unused.
14. **Standings** — no leader spotlight card, no tiebreaker note.
15. **Sign-out** sits inside the Settings card styled in destructive red — same visual weight as a delete. Move to a header menu / de-emphasize.
16. **`viewport` sets `maximumScale=1`** — blocks pinch-zoom, an accessibility failure. Design shouldn't rely on it.
17. **`apple-touch-icon`** isn't properly sized — Add-to-Home-Screen looks cheap. Provide icon art.
18. **Theme switcher** is buried on the profile page — consider a header/command-bar affordance.
19. **DUPR field** — no format hint or inline validation.
20. **Reset-password page** can show a synthetic email (`15551234567@phone.local`) for phone-only users — hide or friendly-format it.

---

## 7. Screens to deliver, by priority

Design at **≥1440px** with a **mobile fallback** (mobile is polished — preserve it; the current `lg` = 1024px breakpoint is a suggestion, change if you like).

**Priority 1 — spectacle & the money surfaces**
- `/tournaments/[id]/mixer/present` — the courtside big-screen reveal (16:9, projector-friendly). Design the full reveal animation sequence.
- `/tournaments/[id]` — scoreboard hub (matches / standings / bracket) desktop layout.
- `/tournaments/[id]/mixer/admin` — organizer cockpit, all 5 tabs.

**Priority 2 — organizer flow**
- `/tournaments` — event list → desktop grid/table.
- `/tournaments/new` — 6-step create wizard (Name → Format → Roster → Tokens & Voting → Prizes → Review). Desktop: step rail left, form center, live summary right.
- `/tournaments/[id]/invite` — roster + invite management.

**Priority 3 — player + account**
- `/tournaments/[id]/mixer` — player mode (Vote / Match / Pool / Me tabs). Mostly phones; modest desktop widen, don't rebuild the blind-vote interaction.
- `/profile`, `/history` — desktop layouts.
- `/`, `/login`, `/join`, `/t/[code]` — resolve the theme transition; polish desktop.

---

## 8. Hard constraints — do NOT break these
- **The blind partner-vote interaction.** Never expose vote tallies, counts, who-voted-for-whom, or partner previews on any screen, at any breakpoint, in any state. This anonymity is load-bearing — redesign the shell around it, not the interaction.
- **The mark and wordmark.** Keep the court-diamond + dashed net + two dots. Wordmark reads "Try to Dink" in Instrument Serif.
- **One accent.** Court green only. No new brand colors.
- **Mobile stays polished.** Every desktop layout must degrade cleanly to the existing mobile design.

---

## 9. Deliverable format
For each Priority-1 and Priority-2 screen:
- A ≥1440px wireframe/mockup + the mobile fallback.
- The breakpoint where desktop kicks in.
- Interaction states that differ from mobile: hover, loading (skeleton), empty (with Dink), error, live/realtime.
- For the Mixer reveal: a frame-by-frame or described animation timeline.

Prototype delivery can be Figma + written spec, or HTML/JSX in `design_handoff_tourneypal/` (that's how the mobile design shipped — see `TourneyPal.html`, `TourneyPal Mixer.html`, `TourneyPal Landing.html` for the house style). An implementation session will build from your output, so annotate spacing, tokens, and component reuse.
