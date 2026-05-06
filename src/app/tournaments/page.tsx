import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Tournament } from '@/lib/types';
import { TopBar } from '@/components/ui/TopBar';
import { Chip } from '@/components/ui/Chip';
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

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; ok?: string; error?: string; welcome?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.filter ?? 'all';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let rows: TournamentMemberRow[] = [];
  if (user) {
    const { data } = await supabase
      .from('tournament_members')
      .select('role,tournaments(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    rows = (data as TournamentMemberRow[] | null) ?? [];
  }

  const tournaments = rows
    .map((r) => r.tournaments)
    .filter((t): t is Tournament => !!t)
    .filter((t) => {
      if (filter === 'live') return t.status === 'active';
      if (filter === 'drafts') return t.status === 'draft';
      if (filter === 'past') return t.status === 'completed' || t.status === 'archived';
      // Default "All" hides completed + archived; those live in Past.
      return t.status !== 'completed' && t.status !== 'archived';
    });

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <TopBar
        title="Your tournaments"
        right={
          <Link
            href="/tournaments/new"
            aria-label="New tournament"
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          >
            {Icons.plus}
          </Link>
        }
      />

      <div className="px-[18px] pb-24 pt-1">
        <div className="mb-3.5 flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              href={f.id === 'all' ? '/tournaments' : `/tournaments?filter=${f.id}`}
              className="shrink-0"
            >
              <Chip tone={filter === f.id ? 'dark' : 'ghost'} size="md">
                {f.label}
              </Chip>
            </Link>
          ))}
        </div>

        {sp.error && (
          <div
            className="mb-3 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--berry)', color: 'var(--berry)', background: 'oklch(0.96 0.04 12)' }}
          >
            {sp.error}
          </div>
        )}
        {sp.ok && (
          <div
            className="mb-3 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--court-deep)', color: 'var(--court-deep)', background: 'oklch(0.96 0.04 140)' }}
          >
            {sp.ok}
          </div>
        )}
        {sp.welcome === '1' && (
          <div
            className="mb-3 rounded-2xl px-4 py-3.5"
            style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}
          >
            <div className="text-sm font-semibold">🎉 Account created — welcome aboard.</div>
            <div className="mt-0.5 text-[12px]">
              Spin up your first tournament or join one with a code.
            </div>
          </div>
        )}

        {!user && (
          <div
            className="mb-3 rounded-2xl bg-white p-4 text-sm text-ink-2"
            style={{ border: '1px solid var(--line)' }}
          >
            Sign in to see your tournaments. You can still browse anything public below.
          </div>
        )}

        {tournaments.length === 0 ? (
          <div
            className="rounded-2xl bg-white p-6 text-center"
            style={{ border: '1px dashed var(--line)' }}
          >
            <div className="text-[15px] font-semibold text-ink">No tournaments here yet</div>
            <div className="mt-1 text-xs text-ink-3">
              Spin up your first round robin in 90 seconds.
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {tournaments.map((t) => (
              <TournamentRow key={t.id} t={t} />
            ))}
          </div>
        )}

        <div className="mt-5">
          <Link
            href="/tournaments/new"
            className="block w-full rounded-2xl px-5 py-[18px] text-center text-base font-semibold tracking-tight"
            style={{
              background: 'var(--court)',
              color: 'oklch(0.2 0.04 140)',
              boxShadow: '0 4px 14px oklch(0.2 0.05 100 / 0.12)',
            }}
          >
            ＋ Create new tournament
          </Link>
        </div>
      </div>
    </div>
  );
}

function TournamentRow({ t }: { t: Tournament }) {
  const live = t.status === 'active';
  const formatLabel = formatDisplay(t.format);
  const date = new Date(t.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return (
    <Link
      href={`/tournaments/${t.id}`}
      className="relative flex items-center gap-3 overflow-hidden rounded-[18px] bg-white p-4"
      style={{ border: '1px solid var(--line)' }}
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
        style={{ background: live ? 'var(--court)' : 'var(--paper-2)' }}
      >
        {live ? (
          <span
            className="block h-2.5 w-2.5 animate-pulse-dot rounded-full"
            style={{ background: 'var(--ink)' }}
          />
        ) : (
          <span style={{ color: 'var(--ink-3)' }}>{Icons.trophy}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-1.5">
          {live && <Chip tone="live">LIVE</Chip>}
          <div className="text-[11px] uppercase tracking-[0.04em] text-ink-3">{date}</div>
        </div>
        <div className="text-base font-semibold tracking-tight text-ink">{t.name}</div>
        <div className="mt-0.5 text-xs text-ink-3">
          {formatLabel} · {capitalize(t.status)}
        </div>
      </div>
      <span style={{ color: 'var(--ink-3)' }}>{Icons.arrow}</span>
    </Link>
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
