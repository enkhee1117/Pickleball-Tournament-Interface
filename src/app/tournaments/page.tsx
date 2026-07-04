import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import type { Tournament } from '@/lib/types';
import { THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';
import { DesktopNav, DesktopSurface } from '@/components/desktop';
import { Icons } from '@/components/ui/icons';

type TournamentMemberRow = {
  role: string;
  tournaments: Tournament | null;
};

const FILTERS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'past', label: 'Past' },
];

const isPast = (t: Tournament) => t.status === 'completed' || t.status === 'archived';

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; ok?: string; error?: string; welcome?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.filter ?? 'all';
  const cookieStore = await cookies();
  const theme = readThemeFromCookie(cookieStore.get(THEME_COOKIE)?.value);
  const supabase = await createClient();
  const user = await getCurrentUser();

  let rows: TournamentMemberRow[] = [];
  if (user) {
    const { data } = await supabase
      .from('tournament_members')
      .select('role,tournaments(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    rows = (data as TournamentMemberRow[] | null) ?? [];
  }

  const all = rows.map((r) => r.tournaments).filter((t): t is Tournament => !!t);
  const counts = {
    all: all.filter((t) => !isPast(t)).length,
    live: all.filter((t) => t.status === 'active').length,
    drafts: all.filter((t) => t.status === 'draft').length,
    past: all.filter(isPast).length,
  };
  const tournaments = all.filter((t) => {
    if (filter === 'live') return t.status === 'active';
    if (filter === 'drafts') return t.status === 'draft';
    if (filter === 'past') return isPast(t);
    return !isPast(t);
  });
  const liveEvent = all.find((t) => t.status === 'active') ?? null;
  const showHero = !!liveEvent && (filter === 'all' || filter === 'live');

  return (
    <DesktopSurface withCommandBar>
      <DesktopNav
        theme={theme}
        active="Tournaments"
        live={!!liveEvent}
        event={liveEvent?.name}
        primaryAction="＋ New event"
        primaryHref="/tournaments/new"
      />
      <main id="main" className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        {/* page head */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="serif text-[34px] leading-none text-ink sm:text-[40px]">Your tournaments</h1>
            <div className="mt-2 text-sm text-ink-3">
              {counts.live} live now · {counts.drafts} draft{counts.drafts === 1 ? '' : 's'} · {counts.past} wrapped
            </div>
          </div>
          <Link
            href="/tournaments/new"
            className="rounded-btn px-5 py-3 text-sm font-semibold"
            style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          >
            ＋ New event
          </Link>
        </div>

        {/* toolbar */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const on = filter === f.id;
            const c = counts[f.id as keyof typeof counts];
            return (
              <Link
                key={f.id}
                href={f.id === 'all' ? '/tournaments' : `/tournaments?filter=${f.id}`}
                className="rounded-full border px-4 py-2 text-[13.5px] font-semibold"
                style={
                  on
                    ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' }
                    : { background: 'white', color: 'var(--ink-2)', borderColor: 'var(--line)' }
                }
              >
                {f.label}
                <span className="mono ml-1.5 text-[11px] opacity-70">{c}</span>
              </Link>
            );
          })}
        </div>

        {sp.error && (
          <div className="mb-4 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--berry)', color: 'var(--berry)', background: 'oklch(0.96 0.04 12)' }}>
            {sp.error}
          </div>
        )}
        {sp.ok && (
          <div className="mb-4 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--court-deep)', color: 'var(--court-deep)', background: 'oklch(0.96 0.04 140)' }}>
            {sp.ok}
          </div>
        )}
        {sp.welcome === '1' && (
          <div className="mb-4 rounded-2xl px-4 py-3.5" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>
            <div className="text-sm font-semibold">🎉 Account created — welcome aboard.</div>
            <div className="mt-0.5 text-[12px]">Spin up your first tournament or join one with a code.</div>
          </div>
        )}

        {!user && (
          <div className="mb-4 rounded-2xl bg-white p-4 text-sm text-ink-2" style={{ border: '1px solid var(--line)' }}>
            <strong className="text-ink">Sign in to see your tournaments.</strong>
            <div className="mt-1 text-[12px] text-ink-3">
              Got an invite code?{' '}
              <Link href="/join" className="font-semibold underline">
                Join with code
              </Link>
              .
            </div>
          </div>
        )}

        {user && all.length === 0 && filter === 'all' ? (
          <FirstRunEmpty />
        ) : (
          <>
            {showHero && liveEvent && <LiveHero t={liveEvent} />}

            {tournaments.length === 0 ? (
              <div className="rounded-2xl bg-white p-6 text-center" style={{ border: '1px dashed var(--line)' }}>
                <div className="text-[15px] font-semibold text-ink">No tournaments here yet</div>
                <div className="mt-1 text-xs text-ink-3">Create a Mixer, round robin, or bracket when the next game night appears.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tournaments.map((t) => (
                  <TournamentCard key={t.id} t={t} />
                ))}
                <Link
                  href="/tournaments/new"
                  className="flex min-h-[190px] flex-col items-center justify-center gap-2.5 rounded-[18px] text-center"
                  style={{ border: '1.5px dashed var(--line)', color: 'var(--ink-3)' }}
                >
                  <span className="grid h-11 w-11 place-items-center rounded-[13px]" style={{ background: 'var(--paper-2)' }}>
                    {Icons.plus}
                  </span>
                  <span className="text-sm font-semibold">New tournament</span>
                  <span className="text-[12px]">Mixer · round robin · bracket</span>
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </DesktopSurface>
  );
}

// Live-event hero (handoff list.html .livehero): the active event promoted
// above the grid with quick cockpit / present / scores actions.
function LiveHero({ t }: { t: Tournament }) {
  const isMixer = t.format === 'partner_mixer';
  return (
    <div
      className="relative mb-6 flex flex-col gap-5 overflow-hidden rounded-[22px] px-6 py-6 text-white sm:flex-row sm:items-center sm:justify-between sm:px-8"
      style={{ background: 'linear-gradient(135deg, oklch(0.24 0.05 150), oklch(0.17 0.02 140) 60%, oklch(0.16 0.02 260))' }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-50" aria-hidden>
        <div className="absolute left-[4%] right-[4%] top-[28%] h-px" style={{ background: 'rgba(255,255,255,.08)' }} />
        <div className="absolute bottom-[28%] left-[4%] right-[4%] h-px" style={{ background: 'rgba(255,255,255,.08)' }} />
      </div>
      <div className="relative min-w-0">
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="chip" style={{ background: 'rgba(255,255,255,.14)', borderColor: 'rgba(255,255,255,.2)', color: '#fff' }}>
            <span className="dot" style={{ background: 'var(--serve)' }} />
            Live now
          </span>
          <span className="chip" style={{ background: 'rgba(255,255,255,.1)', borderColor: 'rgba(255,255,255,.16)', color: '#fff' }}>
            {formatDisplay(t.format)}
          </span>
        </div>
        <h2 className="serif text-[30px] leading-none sm:text-[36px]">{t.name}</h2>
        <div className="mono mt-2.5 text-[12.5px]" style={{ color: 'rgba(255,255,255,.72)' }}>
          {t.status.toUpperCase()} · TAP OPEN TO RUN THE ROOM
        </div>
      </div>
      <div className="relative flex min-w-[220px] flex-col gap-2.5">
        <Link href={isMixer ? `/tournaments/${t.id}/mixer/admin` : `/tournaments/${t.id}`} className="btn btn-accent justify-center">
          Open cockpit →
        </Link>
        {isMixer && (
          <div className="flex gap-2.5">
            <Link href={`/tournaments/${t.id}/mixer/present`} className="btn btn-glass btn-sm flex-1 justify-center">
              Present
            </Link>
            <Link href={`/tournaments/${t.id}/mixer/score`} className="btn btn-glass btn-sm flex-1 justify-center">
              Scores
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function TournamentCard({ t }: { t: Tournament }) {
  const live = t.status === 'active';
  const past = isPast(t);
  const draft = t.status === 'draft';
  const date = new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const discStyle: React.CSSProperties = live
    ? { background: 'color-mix(in oklch, var(--court) 18%, transparent)' }
    : draft
      ? { background: 'var(--paper-2)', color: 'var(--ink-3)' }
      : { background: 'var(--paper-2)', color: 'var(--amber)' };
  return (
    <Link
      href={`/tournaments/${t.id}`}
      className="group relative rounded-[18px] bg-white p-[18px] transition-shadow"
      style={{ border: '1px solid var(--line)' }}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="grid h-[46px] w-[46px] place-items-center rounded-[13px]" style={discStyle}>
          {live ? (
            <span className="h-3 w-3 animate-pulse-dot rounded-full" style={{ background: 'var(--court)', boxShadow: '0 0 0 4px color-mix(in oklch, var(--court) 25%, transparent)' }} />
          ) : (
            <span style={{ color: 'inherit' }}>{Icons.trophy}</span>
          )}
        </span>
        <StateChip t={t} live={live} past={past} draft={draft} />
      </div>
      <div className="mb-1.5 text-[18px] font-semibold tracking-tight text-ink">{t.name}</div>
      <div className="flex items-center gap-2 text-[13px] text-ink-2">
        <span className="h-2 w-2 rounded-full" style={{ background: formatColor(t.format) }} />
        {formatDisplay(t.format)}
      </div>
      <div className="mt-4 flex items-center justify-between border-t pt-3.5" style={{ borderColor: 'var(--line)' }}>
        <span className="text-xs capitalize text-ink-3">{t.status}</span>
        <span className="mono text-[11px] tracking-[0.03em] text-ink-3">{date}</span>
      </div>
    </Link>
  );
}

function StateChip({ t, live, past, draft }: { t: Tournament; live: boolean; past: boolean; draft: boolean }) {
  if (live) {
    return (
      <span className="chip chip-live">
        <span className="dot" />
        Live
      </span>
    );
  }
  if (draft) return <span className="chip">Draft</span>;
  if (past) return <span className="chip">Final</span>;
  return (
    <span className="chip" style={{ color: 'var(--sky)', borderColor: 'color-mix(in oklch, var(--sky) 40%, var(--line))' }}>
      Scheduled
    </span>
  );
}

// First-run empty state (handoff first-run.html, step 1): coach Dink, one
// clear action, an honest time estimate, and a real "join with a code" path.
function FirstRunEmpty() {
  return (
    <div className="mx-auto max-w-[520px] rounded-[22px] bg-white p-7 text-center" style={{ border: '1px solid var(--line)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/design-handoff/dink/coach.png" alt="" width={104} height={104} className="mx-auto mb-3" style={{ width: 104, height: 104, objectFit: 'contain' }} />
      <div className="serif text-[26px] leading-none text-ink">No events yet — let&apos;s fix that</div>
      <div className="mx-auto mt-2.5 max-w-[26em] text-[13px] leading-[1.5] text-ink-3">
        Most first nights are up and running in about <b className="text-ink-2">90 seconds</b>. Templates carry the defaults, so there&apos;s almost nothing to decide.
      </div>
      <Link
        href="/tournaments/new"
        className="mt-5 block w-full rounded-2xl px-5 py-4 text-center text-base font-semibold tracking-tight"
        style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)', boxShadow: '0 4px 14px oklch(0.2 0.05 100 / 0.12)' }}
      >
        ＋ Create your first event
      </Link>
      <Link href="/join" className="mt-3 block text-[13px] font-semibold" style={{ color: 'var(--court-deep)' }}>
        Have a code? Join an event →
      </Link>
      <div className="mt-6 flex items-center justify-center gap-5 border-t pt-4 text-[11px] text-ink-3" style={{ borderColor: 'var(--line)' }}>
        <span>
          <b className="mono text-ink-2">4</b> taps to live
        </span>
        <span>
          <b className="mono text-ink-2">~90s</b> median
        </span>
        <span>
          <b className="mono text-ink-2">0</b> required decisions
        </span>
      </div>
    </div>
  );
}

function formatDisplay(format: string): string {
  switch (format) {
    case 'round_robin':
      return 'Round Robin';
    case 'fixed_partners':
      return 'Fixed Partners';
    case 'bracket':
      return 'Bracket';
    case 'partner_mixer':
      return 'Partner Mixer';
    case 'rr-mixed':
      return 'Round Robin · Mixed';
    case 'rr-same':
      return 'Round Robin · Same gender';
    case 'fp-mixed':
      return 'Fixed Partners · Mixed';
    case 'fp-same':
      return 'Fixed Partners · Same gender';
    default:
      return format;
  }
}

function formatColor(format: string): string {
  if (format === 'partner_mixer') return 'var(--court)';
  if (format.startsWith('rr') || format === 'round_robin') return 'var(--amber)';
  if (format.startsWith('fp') || format === 'fixed_partners') return 'var(--sky)';
  if (format === 'bracket') return 'var(--berry)';
  return 'var(--ink-3)';
}
