import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Tournament } from '@/lib/types';
import { TopBar } from '@/components/ui/TopBar';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { Icons } from '@/components/ui/icons';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { InviteTopBar } from './InviteTopBar';
import { WhatsAppToggle } from './WhatsAppToggle';
import { addInvitePlayer, setInviteWhatsApp } from './actions';

type PlayerRow = {
  id: string;
  display_name: string;
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string; ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = sp.new === '1';
  const supabase = await createClient();

  const [{ data: tournament }, { data: players }] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', id).single(),
    supabase
      .from('tournament_players')
      .select('id,display_name')
      .eq('tournament_id', id)
      .order('created_at', { ascending: true }),
  ]);
  if (!tournament) notFound();
  const t = tournament as Tournament;
  const roster = (players ?? []) as PlayerRow[];
  const inviteCode = makeInviteCode(t.id, t.name);

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <InviteTopBar tournamentId={id} isNew={isNew} />

      <div className="flex-1 overflow-y-auto px-[18px] pb-6 pt-1">
        {isNew && (
          <div
            className="mb-4 flex items-center gap-3 rounded-2xl p-4"
            style={{ background: 'var(--court)' }}
          >
            <div className="text-[28px]">🎉</div>
            <div>
              <div className="text-sm font-semibold text-ink">Tournament created!</div>
              <div className="mt-0.5 text-xs" style={{ color: 'oklch(0.3 0.05 140)' }}>
                Now get the gang in here.
              </div>
            </div>
          </div>
        )}

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

        <div
          className="relative mb-[18px] overflow-hidden rounded-[22px] p-5"
          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
        >
          <div className="text-[11px] tracking-[0.08em]" style={{ color: 'oklch(0.78 0.18 135)' }}>
            SHARE CODE
          </div>
          <div className="mono mt-1.5 text-[38px] font-bold tracking-widest">{inviteCode}</div>
          <div className="mt-1 text-xs opacity-60">Players join with this code in the app.</div>
          <CopyLinkRow code={inviteCode} />
        </div>

        <WhatsAppToggle
          tournamentId={t.id}
          initialUrl={t.whatsapp_group_url ?? null}
          updateAction={setInviteWhatsApp}
        />

        <SectionHeader
          title="Roster"
          mute={`${roster.length} confirmed`}
          action={<span>Add player</span>}
        />

        <form
          action={addInvitePlayer}
          className="mb-3 flex gap-2"
        >
          <input type="hidden" name="tournament_id" value={t.id} />
          <input
            name="display_name"
            placeholder="Player name"
            required
            className="flex-1 rounded-xl bg-white px-3.5 py-3 text-sm text-ink outline-none"
            style={{ border: '1px solid var(--line)' }}
          />
          <button
            type="submit"
            className="rounded-xl px-4 text-sm font-semibold"
            style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          >
            Add
          </button>
        </form>

        <div className="grid gap-2">
          {roster.length === 0 ? (
            <div
              className="rounded-2xl bg-white p-4 text-center text-sm text-ink-3"
              style={{ border: '1px dashed var(--line)' }}
            >
              No players yet. Add a few above to get started.
            </div>
          ) : (
            roster.map((p) => {
              const player = playerFromName(p.display_name);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-[14px] bg-white px-3.5 py-2.5"
                  style={{ border: '1px solid var(--line)' }}
                >
                  <Avatar player={player} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{p.display_name}</div>
                    <div className="text-[11px] text-ink-3">Confirmed roster</div>
                  </div>
                  <Chip tone="court">IN</Chip>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-5">
          <Link
            href={`/tournaments/${t.id}`}
            className="block w-full rounded-2xl px-5 py-[18px] text-center text-base font-semibold tracking-tight"
            style={{
              background: 'var(--ink)',
              color: 'var(--paper)',
              boxShadow: '0 4px 14px oklch(0.2 0.05 100 / 0.12)',
            }}
          >
            Open scoreboard →
          </Link>
        </div>
      </div>
    </div>
  );
}

function CopyLinkRow({ code }: { code: string }) {
  return (
    <div className="mt-4 flex gap-2">
      <button
        className="flex-1 rounded-xl px-3.5 py-3 text-[13px] font-semibold"
        style={{ background: 'oklch(0.28 0.04 140)', color: 'var(--paper)' }}
      >
        Copy link
      </button>
      <button
        className="rounded-xl px-4 py-3 text-[13px] font-semibold"
        style={{ background: 'oklch(0.28 0.04 140)', color: 'var(--paper)' }}
        aria-label="Share"
      >
        {Icons.share}
      </button>
    </div>
  );
}

function makeInviteCode(id: string, name: string): string {
  const prefix = name
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, 'X');
  const suffix = id.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase().padEnd(4, '0');
  return `${prefix}-${suffix}`;
}
