# Design Session Brief — Try to Dink (rebrand + desktop)

> For a fresh design session. Self-contained: everything here should let you produce screens, prototypes, or Figma flows without re-reading the codebase.

## 1. The rebrand — what changed
- **Product name:** TourneyPal → **Try to Dink**
- **Domain:** `trytodink.com` (live, on Vercel + Supabase)
- **Sender email:** `contact.trytodink.com` (Resend, verified)
- **The Dink mascot is now on-brand.** The character was named Dink long before the rebrand — treat this as a happy coincidence and lean into it in copy ("Try to Dink" reads as a friendly imperative to a bird, courtside, in front of the pot). Micro-interactions using the mascot get a lot more weight now.
- **The mark did NOT change.** The court-diamond `TPMark` (dashed net line + two ball dots) still holds. The wordmark just says "Try to Dink" in Instrument Serif now.
- **All brand tokens stay the same.** Court green accent, paper light default, ink dark, serif/geist/mono type. See `DESIGN.md` in the repo for the OKLCH values.

## 2. The main design job — desktop
The app was designed **mobile-first (480px shell)** and everything is polished at phone width. It was never designed for desktop; on a 1440px browser today, screens render as a phone-shaped column with paper letterboxing on both sides.

**Already handled inline (dev):** `/login`, `/signup`, `/forgot-password`, `/reset-password` — a two-column split-screen was landed as a stopgap (brand hero on the left, form ≤560px card on the right, dark ink background). It works but isn't a design artifact — feel free to redesign these too.

**Not yet designed for desktop (this is where you come in):**

### Priority 1 — presentation & spectator
- `/tournaments/[id]/mixer/present` — the courtside big-screen reveal. Currently ships at desktop-ish width but the layout is `xl:grid-cols-[1fr_360px]` with the 72px serif court number and a court selector sidebar. On a wall TV / projector it looks fine; on a laptop it feels cramped. Deserves a dedicated 16:9 layout.
- `/` (landing) — desktop landing is *okay* but the mobile-first constraints show. See §5 of the current landing (`src/app/page.tsx`) — "Reveal night" section wants a wider frame.

### Priority 2 — organizer surfaces (this is where money moves)
- `/tournaments` — list of events. Currently a single mobile column. On desktop, the organizer running 4 concurrent events wants a table or dense card grid.
- `/tournaments/[id]` — the scoreboard hub. Tabs (Matches / Standings / Bracket). On desktop, matches + standings side-by-side is the obvious win.
- `/tournaments/[id]/mixer/admin` — 5 tabs: Run, Roster, Scores, Prizes, Setup. Currently full mobile shell. Organizer likely on a laptop while running an event; deserves a real desktop layout. Note: the Run tab is the operational cockpit during a live event, treat it like a dashboard.
- `/tournaments/[id]/invite` — the roster + invite management surface. Same deal.
- `/tournaments/new` — the create-wizard. 6 steps (Name → Format → Roster → Tokens & Voting → Prizes → Review). Desktop can put step nav on the left rail, form in the middle, live summary/preview on the right — classic 3-pane.

### Priority 3 — player surfaces
- `/tournaments/[id]/mixer` — player mode. 4 tabs: Vote, Match, Pool, Me. Most players will be on phones, but tablets exist. Consider whether desktop is worth designing here at all (probably a modest widen, not a rebuild).
- `/profile`, `/history`, `/admin` — the tab-bar surfaces. All currently mobile-only.

### Priority 4 — the "join" edge
- `/join` — invite code entry. Currently 6-slot mono input, mobile-only. On desktop should be a modal-ish centered card with the code slots at ~64px each.
- `/t/[code]` — public tournament landing (QR destination). Has more content on it now, still mobile-shape.

## 3. The theme decision — please resolve this
The theme switcher in the profile page offers **Sideline (bright)**, **Night Match (dark)**, **Arcade (plum)**. It applies via `data-theme` on `<html>` and swaps CSS variables. Two visual inconsistencies today:

1. **Landing (`/`) is paper-light** with a dark hero card. **Auth pages (`/login` etc.) are fully dark ink.** Users experience a jarring color flip when they click "Sign in" from the landing. Reported by the founder.
2. **Mixer pages hardcode a dark surface** (`oklch(0.155 0.024 264)`) regardless of the user's theme. Handoff §8 said "themes change surface mood, not brand color" — so Mixer is *always* Night by design. Non-Mixer pages respect the theme.

**The design question:** what's the intended visual continuity?
- Option A — **Landing goes dark**: landing hero style becomes the whole page, matches auth, matches Mixer. Sideline theme becomes for signed-in non-Mixer surfaces only.
- Option B — **Auth goes light** in Sideline mode: auth pages respect the theme, but Mixer stays dark forever (as intended). Landing paper-light stays.
- Option C — **Auth respects landing state**: from paper-light landing → paper-light auth; from a dark internal page → dark auth. Rarely done, but coherent.
- Option D — **All auth is a hero-video-style** dark takeover regardless of theme (my current stopgap). Users accept it as "sign-in ceremony."

Recommendation lean: **B**. The Mixer's dark surface is intentional show-business. Everything else should be one theme.

## 4. Design system reminders
- **Type:** Instrument Serif for editorial moments (headlines, name-reveals). Geist for UI. JetBrains Mono for numbers, codes, DUPR, timers. See `DESIGN.md`.
- **Color:** exactly one accent — `--court` (green). `--serve` (orange) is for live/serving indicators. `--berry` (red) is for destructive actions. Everything else is ink/paper/line.
- **Radii:** cards 16–18px, hero 22px, buttons 14–16px, chips fully round, avatars circular.
- **Hit targets:** ≥44px on any interactive element. Mobile Safari will punish you for this if you're not careful.
- **Editorial voice:** short sentences, italic emphasis on the second line of headlines. "Run a tournament / *without spreadsheets.*" is the pattern.
- **Mascot:** Dink poses live in `public/design-handoff/dink/` — token, presenting, celebrating, champion, wave, won. Use them freely; they carry the personality.

## 5. What NOT to redesign
- **The Mixer voting flow (blind partner vote).** It's the load-bearing UX; changing it breaks the anonymity guardrail. Only touch the visual shell around it, not the interaction.
- **The tab-bar.** Four tabs (Today / Play / Stats / Me), fixed bottom on mobile, hides itself on auth and event surfaces. Present, working.
- **The wordmark and mark.** Keep the diamond + dashed net; wordmark text swap is done.

## 6. Deliverable format
For each priority-1 and priority-2 surface, please produce:
- **Wireframe** at ≥1440px (the actual size your desktop users will see)
- **A named breakpoint** where your desktop layout kicks in — current codebase uses Tailwind's `lg` = 1024px, feel free to change
- **Mobile fallback** — show what still needs to be preserved (mobile is polished; don't break it)
- **Notes on interaction state** — hover, loading, empty, error — that differs from mobile

An implementation session can pick up your work from a Figma link + a written spec, or an HTML/JSX prototype in the `design_handoff_tourneypal/` folder (that's how the mobile design shipped — see `TourneyPal.html`, `TourneyPal Mixer.html`, `TourneyPal Landing.html`).

## 7. Open questions worth raising early
- Should the **theme switcher** live somewhere more discoverable than the profile page? Header dropdown? Command bar?
- Do we want a **"present mode"** for the desktop scoreboard (fullscreen, projector-friendly) or is `/mixer/present` already that?
- On desktop, do organizers want **multi-tournament switching** in a sidebar, or is one-tournament-at-a-time still the mental model?
- Is there a case for a **light-mode Mixer surface** for daytime outdoor courts? (Current dark surface is designed for a lit indoor room.)
