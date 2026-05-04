import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Tournament } from '@/lib/types';
import { TopBar } from '@/components/ui/TopBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Chip } from '@/components/ui/Chip';
import { Icons } from '@/components/ui/icons';

type TournamentMemberRow = {
  role: string;
  tournaments: Tournament | null;
};

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let past: Tournament[] = [];
  let counts = { champion: 0, finalist: 0, played: 0 };

  if (user) {
    const { data } = await supabase
      .from('tournament_members')
      .select('role,tournaments(*)')
      .eq('user_id', user.id);
    const rows = ((data as TournamentMemberRow[] | null) ?? [])
      .map((r) => r.tournaments)
      .filter((t): t is Tournament => !!t);
    past = rows.filter((t) => t.status === 'completed' || t.status === 'archived');
    counts.played = rows.length;
  }

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <TopBar
        title="History"
        left={
          <Link
            href="/"
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ color: 'var(--ink)' }}
          >
            {Icons.back}
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto px-[18px] pb-24">
        <div className="serif px-1 py-2 text-[28px] leading-[1.1] text-ink">
          Your <span className="italic" style={{ color: 'var(--court-deep)' }}>trophy case</span>
          .
        </div>

        <div className="mb-[22px] grid grid-cols-3 gap-2.5">
          {[
            { count: counts.champion, label: 'Champion', icon: '🏆' },
            { count: counts.finalist, label: 'Finalist', icon: '🥈' },
            { count: counts.played, label: 'Played', icon: '🎾' },
          ].map((t) => (
            <div
              key={t.label}
              className="rounded-2xl bg-white p-3.5 text-center"
              style={{ border: '1px solid var(--line)' }}
            >
              <div className="text-[28px]">{t.icon}</div>
              <div className="mono mt-1 text-[22px] font-bold tracking-tight text-ink">{t.count}</div>
              <div className="text-[11px] uppercase tracking-[0.04em] text-ink-3">{t.label}</div>
            </div>
          ))}
        </div>

        <SectionHeader title="Past tournaments" />
        {past.length === 0 ? (
          <div
            className="rounded-2xl bg-white p-5 text-center text-sm text-ink-3"
            style={{ border: '1px dashed var(--line)' }}
          >
            Nothing in the books yet. Finish a tournament to see it here.
          </div>
        ) : (
          <div className="relative pl-6">
            <div
              className="absolute bottom-2 top-2 left-[9px] w-[1.5px]"
              style={{ background: 'var(--line)' }}
            />
            {past.map((t) => {
              const date = new Date(t.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              });
              return (
                <div key={t.id} className="relative mb-3.5">
                  <div
                    className="absolute -left-5 top-3.5 h-3.5 w-3.5 rounded-full"
                    style={{
                      background: 'var(--paper)',
                      border: '2px solid var(--ink-3)',
                    }}
                  />
                  <Link
                    href={`/tournaments/${t.id}`}
                    className="block rounded-2xl bg-white p-3.5"
                    style={{ border: '1px solid var(--line)' }}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <div className="text-[11px] uppercase tracking-[0.04em] text-ink-3">
                        {date} · {t.format}
                      </div>
                      {t.status === 'completed' && <Chip tone="ghost">DONE</Chip>}
                    </div>
                    <div className="text-[15px] font-semibold tracking-tight text-ink">{t.name}</div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
