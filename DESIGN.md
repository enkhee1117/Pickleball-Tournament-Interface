# TourneyPal Design System

This document is the source of truth for TourneyPal UI and brand consistency.
The full visual system, including reference screenshots and prototype JSX, lives
in `design_handoff_tourneypal/` — keep it in sync with this doc.

## Brand

- Product name: `TourneyPal`
- Voice: editorial, warm, playful, courtside-confident — short sentences with
  italic emphasis on the second line of headlines.
- Visual style: **mobile-first, paper-light**, with two intentional dark
  surfaces (the scoreboard hero and the match-card variant). The mark is a
  diamond court motif with a dashed center net line and two pickleball dots.

## Color Tokens (OKLCH, exposed as CSS variables)

Use the variables defined in `globals.css` and the matching Tailwind tokens
in `tailwind.config.ts`. Avoid ad-hoc colors.

| Token            | OKLCH                       | Hex (≈)   | Use                                           |
|------------------|-----------------------------|-----------|------------------------------------------------|
| `--paper`        | `oklch(0.97 0.008 95)`      | `#F8F6F1` | App background (warm off-white)                |
| `--paper-2`      | `oklch(0.94 0.012 95)`      | `#EFEBE3` | Subtle surfaces, chip backgrounds              |
| `--ink`          | `oklch(0.18 0.01 80)`       | `#27241D` | Primary text and dark surfaces                 |
| `--ink-2`        | `oklch(0.35 0.01 80)`       | `#534F45` | Secondary text                                 |
| `--ink-3`        | `oklch(0.55 0.01 80)`       | `#857F73` | Muted text, captions                           |
| `--line`         | `oklch(0.86 0.012 95)`      | `#D9D4C7` | Borders, dividers                              |
| `--court`        | `oklch(0.78 0.18 135)`      | `#9CD96B` | Brand accent (court green)                     |
| `--court-deep`   | `oklch(0.55 0.16 138)`      | `#5C8A3B` | Accent on light backgrounds                    |
| `--serve`        | `oklch(0.7 0.19 48)`        | `#E88A3F` | Live / serving indicators                      |
| `--berry`        | `oklch(0.55 0.2 12)`        | `#C13E4A` | Negative stats, destructive actions            |
| `--sky`          | `oklch(0.78 0.12 230)`      | `#7FB6D9` | Optional accent                                |

Tailwind aliases: `paper`, `paper-2`, `ink`, `ink-2`, `ink-3`, `line`, `court`,
`court-deep`, `serve`, `berry`, `sky`.

## Typography

| Family             | Tailwind   | CSS class | Use                                          |
|--------------------|------------|-----------|----------------------------------------------|
| Instrument Serif   | `font-serif` | `serif` | Editorial display headlines (italic accent)  |
| Geist              | `font-sans`  | (default) | UI text, buttons, labels                  |
| JetBrains Mono     | `font-mono`  | `mono`  | Scores, stats, codes, invite codes           |

Type scale (mobile, 480px shell):
- Hero serif: 40–56px / line-height 1.05 / tracking `-0.02em`
- H1 serif: 28–32px / 1.1
- Section header: 18px / 600 weight / tracking `-0.02em`
- Body: 13–14px / 1.45
- Caption: 11–12px / `text-ink-3`
- Stat numerals: 22–64px monospace, tracking `-0.02em` to `-0.04em`
- Eyebrow: 10–11px / uppercase / tracking `0.04em`–`0.08em`

## Spacing & Radii

- Standard side padding: `18px`
- Card radius: 16–22px (cards 16–18, hero 22)
- Button radius: 14–16px
- Chip / pill: `999px`
- Avatar: 50% (always circular)
- Stepper buttons: 12px radius, 40–44px square

## Shared UI Primitives (`src/components/ui/`)

- `TPMark` / `TPWordmark` — the diamond court mark and its wordmark pair.
- `Avatar` (+ `playerFromName`, `colorForName`, `shortFromName`) — colored
  disk with player initials. Avatar color is stable per name; never randomize
  on render.
- `Chip` — pill with tones `default | live | court | ghost | dark`; the
  `live` tone shows a pulsing white dot.
- `BigButton` — full-width primary action button with tones
  `ink | court | ghost | serve`.
- `IconBtn` — 40×40 icon button with tones `ghost | fill`.
- `TopBar` — left/right slot top bar with optional dark variant.
- `SectionHeader` — list section header with optional action and mute copy.
- `MatchCard` — court badge, status chip, two team rows with overlapping
  avatars and large monospace scores.
- `Icons` — line-glyph icon set (`back`, `close`, `plus`, `share`, `whatsapp`,
  `trophy`, `check`, `spark`, `arrow`, `flame`, `history`, `qr`, `bars`,
  `more`).

## Animations

| Name        | Use                              | Spec                                      |
|-------------|----------------------------------|-------------------------------------------|
| `pop`       | Score change                     | scale .6→1.08→1, opacity 0→1, .25s        |
| `slideUp`   | Screen transition                | translateY 12px→0, opacity 0→1, .25s      |
| `pulse`     | Live indicator dot               | opacity 1↔0.4, 1.4s infinite              |
| `shimmer`   | Active score panel sheen         | translateX -100%→200%, 2s infinite        |
| `confetti`  | Match end celebration            | rises 600px, rotates 720°, 2–3.5s         |

CSS keyframes live in `globals.css`; Tailwind animation aliases live in
`tailwind.config.ts`.

## Layout Principles

- **Mobile-first**, target a 480px width shell with a fixed-position bottom
  `TabBar` (Today / Play / Stats / Me).
- TabBar is hidden on full-bleed flows: `/login`, `/signup`,
  `/forgot-password`, `/reset-password`, `/join`, `/tournaments/new`,
  `/tournaments/[id]/invite`, `/tournaments/[id]/match/[matchId]`.
- Whitespace is intentional. Don't add filler tooltips or onboarding hints.
- Each page is one of two surfaces: paper-light (default) or `--ink` dark
  (onboarding, scoreboard hero, match card variants, DUPR card).

## Screens (canonical)

1. **Onboarding / Login** (`/login`) — full-bleed `--ink`, court-line motif
   top-right, editorial hero, email + password, court-green primary CTA.
2. **Today** (`/`) — wordmark header, editorial greeting, dark live
   tournament hero card with court-line motif and stat blocks, On-court
   `LiveMatchCard`s, 2×2 quick-start grid.
3. **Tournaments** (`/tournaments`) — filter chips (All / Live / Drafts /
   Past), tournament rows with status icon, court-tone CTA.
4. **Create wizard** (`/tournaments/new`) — 6-step wizard with progress bar:
   Name → Format → Pairing → Roster → Schedule → Review.
5. **Invite** (`/tournaments/[id]/invite`) — dark share-code card with mono
   code, WhatsApp toggle (`#25D366` icon), roster list.
6. **Scoreboard hub** (`/tournaments/[id]`) — dark hero with `LIVE` chip,
   serif name, segmented tab strip (Matches / Standings / Bracket).
7. **Match score entry** (`/tournaments/[id]/match/[matchId]`) — two large
   `ScorePanel`s with shimmer when active, 4×4 keypad, confetti on end.
8. **History** (`/history`) — editorial "trophy case" heading, 3-up trophy
   strip, vertical timeline.
9. **Profile** (`/profile`) — hero avatar, dark DUPR card with sparkline,
   settings list. `?edit=1` opens the edit form.
10. **Join** (`/join`) — six monospace input boxes, auto-advance.
11. **Admin** (`/admin`) — invite list with status chips, role assignment.

## Implementation Rules

- Always consume colors from CSS variables / Tailwind tokens. Never hardcode
  hex values inside components.
- Use the editorial italic-emphasis pattern on serif hero copy
  (`<span className="italic" style={{ color: 'var(--court-deep)' }}>`).
- All scores, codes, and DUPR ratings render in monospace via the `.mono`
  class or `font-mono` token.
- Avatar color is per-player and stable. Use `colorForName` so the same name
  always hashes to the same color.
- Reuse the shared primitives before introducing new variants. If a new
  variant is unavoidable, add it to `src/components/ui/` and document it
  here.
- Don't reintroduce the legacy `volt` / dark-bg palette or `font-display` /
  `font-sans` classes that map to Inter / Space Grotesk — those are removed
  from this system.

## Accessibility Baselines

- WCAG AA contrast for body text and interactive controls.
- Never communicate status with color alone; pair every chip with text.
- Keep focus rings visible on inputs and buttons.
- Semantic headings — every screen has a single `h1`-equivalent serif title.

## Definition of Done

Before merging UI changes, verify:

- Branding says `TourneyPal` only.
- Colors come from CSS variables / Tailwind tokens (paper / ink / court /
  serve / berry / line / sky).
- Typography uses `serif` for display, default sans (Geist) for UI, `mono`
  for numerals.
- Buttons, chips, cards, top bars, section headers come from the shared
  primitives in `src/components/ui/`.
- Animations match the names and timings in this doc.
- The TabBar appears on the four primary tabs and stays hidden on full-bleed
  flows.
- New screens align with the surface, spacing, and editorial-headline
  pattern shown in the canonical screens above.
