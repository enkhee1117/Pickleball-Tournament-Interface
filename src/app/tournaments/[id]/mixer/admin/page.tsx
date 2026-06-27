import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { TopBar } from '@/components/ui/TopBar';
import { Chip } from '@/components/ui/Chip';
import { Icons } from '@/components/ui/icons';
import {
  confirmMixerPayment,
  drawMixerRound,
  finalizeMixerEvent,
  initializeMixerEvent,
  scoreMixerCourt,
  setMixerRoundState,
} from '../actions';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
};

type TournamentRow = {
  id: string;
  name: string;
  format: string;
  owner_user_id: string;
  status: string;
};

type ConfigRow = {
  starting_tokens: number;
  starting_chips: number;
  rounds: number;
  courts: number;
  lock_seconds: number;
  entry_fee: number;
  betting_enabled: boolean;
  raffle_enabled: boolean;
  downvotes_enabled: boolean;
};

type RoundRow = {
  id: string;
  round_no: number;
  state: string;
  lock_at: string | null;
};

type PlayerRow = {
  id: string;
  display_name: string;
  gender: 'm' | 'f' | 'x' | null;
  profile_id: string | null;
  withdrawn_at: string | null;
};

type PairingRow = {
  id: string;
  player_a_id: string;
  player_b_id: string;
  court_no: number;
};

type ScoreRow = {
  court_no: number;
  team_a_score: number;
  team_b_score: number;
};

type PaymentRow = {
  id: string;
  player_id: string;
  type: string;
  amount: number;
  method: string;
  status: string;
};

export default async function MixerAdminPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentUser();

  const [
    { data: tournament },
    { data: member },
    { data: config },
    { data: rounds },
    { data: players },
  ] = await Promise.all([
    supabase.from('tournaments').select('id,name,format,owner_user_id,status').eq('id', id).single(),
    user
      ? supabase.from('tournament_members').select('role').eq('tournament_id', id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('event_config').select('*').eq('tournament_id', id).maybeSingle(),
    supabase.from('mixer_rounds').select('id,round_no,state,lock_at').eq('tournament_id', id).order('round_no', { ascending: false }),
    supabase.from('tournament_players').select('id,display_name,gender,profile_id,withdrawn_at').eq('tournament_id', id).order('created_at', { ascending: true }),
  ]);

  if (!tournament) notFound();
  const t = tournament as TournamentRow;
  if (t.format !== 'partner_mixer') notFound();
  const role = (member as { role?: string } | null)?.role ?? null;
  const isManager = !!user && (user.id === t.owner_user_id || role === 'organizer' || role === 'admin');
  if (!isManager) notFound();

  const cfg = config as ConfigRow | null;
  const currentRound = ((rounds ?? []) as RoundRow[])[0] ?? null;
  const roster = (players ?? []) as PlayerRow[];

  const [{ data: pairings }, { data: scores }, { data: payments }] = await Promise.all([
    currentRound
      ? supabase.from('mixer_pairings').select('id,player_a_id,player_b_id,court_no').eq('round_id', currentRound.id).order('court_no', { ascending: true })
      : Promise.resolve({ data: [] }),
    currentRound
      ? supabase.from('mixer_scores').select('court_no,team_a_score,team_b_score').eq('round_id', currentRound.id)
      : Promise.resolve({ data: [] }),
    supabase.from('payments').select('id,player_id,type,amount,method,status').eq('tournament_id', id).order('created_at', { ascending: false }).limit(50),
  ]);

  const pairingRows = (pairings ?? []) as PairingRow[];
  const scoreRows = (scores ?? []) as ScoreRow[];
  const paymentRows = (payments ?? []) as PaymentRow[];
  const name = (playerId: string) => roster.find((p) => p.id === playerId)?.display_name ?? 'TBD';

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <div className="bg-ink px-[18px] pb-[18px] text-paper">
        <TopBar
          dark
          title={t.name}
          sub="Mixer organizer"
          left={<Link href={`/tournaments/${id}`} className="flex h-10 w-10 items-center justify-center rounded-xl">{Icons.back}</Link>}
          right={<Link href={`/tournaments/${id}/mixer/present`} className="flex h-10 w-10 items-center justify-center rounded-xl">{Icons.share}</Link>}
        />
        <div className="pl-1">
          <Chip tone="live">{currentRound ? currentRound.state : 'SETUP'}</Chip>
          <div className="serif mt-2 text-[34px] leading-none">Run the draw</div>
          <div className="mt-1 text-xs opacity-60">{roster.length} players · {cfg?.courts ?? 3} courts</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-[18px] py-4 pb-24">
        {sp.error && <Notice tone="error">{sp.error}</Notice>}
        {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}

        {!cfg || !currentRound ? (
          <form action={initializeMixerEvent} className="rounded-2xl bg-white p-5 text-center" style={{ border: '1px dashed var(--line)' }}>
            <input type="hidden" name="tournament_id" value={id} />
            <div className="text-[15px] font-semibold text-ink">Mixer config is not initialized</div>
            <div className="mt-1 text-xs text-ink-3">Create default tokens, chips, Round 1, and player event state.</div>
            <button className="mt-4 rounded-2xl px-5 py-3 text-sm font-semibold" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>
              Initialize Mixer
            </button>
          </form>
        ) : (
          <>
            <Section title="Round controls">
              <div className="grid grid-cols-2 gap-2">
                <StateButton tournamentId={id} roundId={currentRound.id} state="open" label="Open vote" />
                <StateButton tournamentId={id} roundId={currentRound.id} state="locked" label="Lock vote" />
                <form action={drawMixerRound}>
                  <input type="hidden" name="tournament_id" value={id} />
                  <input type="hidden" name="round_id" value={currentRound.id} />
                  <button className="w-full rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>
                    Draw + reveal
                  </button>
                </form>
                <StateButton tournamentId={id} roundId={currentRound.id} state="playing" label="Start play" />
                <StateButton tournamentId={id} roundId={currentRound.id} state="done" label="Mark done" />
              </div>
              <form action={finalizeMixerEvent} className="mt-2">
                <input type="hidden" name="tournament_id" value={id} />
                <button className="w-full rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
                  Finalize standings, raffle, and pools
                </button>
              </form>
            </Section>

            <Section title="Setup">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Tokens" value={cfg.starting_tokens} />
                <Stat label="Chips" value={cfg.starting_chips} />
                <Stat label="Entry" value={`$${cfg.entry_fee}`} />
                <Stat label="Lock" value={`${cfg.lock_seconds}s`} />
              </div>
              <div className="mt-2 text-xs text-ink-3">
                Betting {cfg.betting_enabled ? 'on' : 'off'} · Raffle {cfg.raffle_enabled ? 'on' : 'off'} · Downvotes {cfg.downvotes_enabled ? 'on' : 'off'}
              </div>
            </Section>

            <Section title="Courts and scores">
              {pairingRows.length === 0 ? (
                <div className="rounded-2xl bg-white p-4 text-center text-sm text-ink-3" style={{ border: '1px dashed var(--line)' }}>
                  No pairings revealed yet.
                </div>
              ) : (
                <div className="grid gap-3">
                  {[...new Set(pairingRows.map((p) => p.court_no))].map((courtNo) => {
                    const teams = pairingRows.filter((p) => p.court_no === courtNo);
                    const score = scoreRows.find((s) => s.court_no === courtNo);
                    return (
                      <div key={courtNo} className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
                        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">Court {courtNo}</div>
                        <div className="grid gap-1 text-sm font-semibold text-ink">
                          {teams.map((team, idx) => (
                            <div key={team.id}>{idx === 0 ? 'A' : 'B'} · {name(team.player_a_id)} & {name(team.player_b_id)}</div>
                          ))}
                        </div>
                        <form action={scoreMixerCourt} className="mt-3 flex items-center gap-2">
                          <input type="hidden" name="tournament_id" value={id} />
                          <input type="hidden" name="round_id" value={currentRound.id} />
                          <input type="hidden" name="court_no" value={courtNo} />
                          <input name="team_a_score" type="number" min={0} defaultValue={score?.team_a_score ?? 0} className="mono h-10 w-16 rounded-xl bg-paper-2 text-center text-ink" />
                          <span className="text-xs text-ink-3">to</span>
                          <input name="team_b_score" type="number" min={0} defaultValue={score?.team_b_score ?? 0} className="mono h-10 w-16 rounded-xl bg-paper-2 text-center text-ink" />
                          <button className="ml-auto rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>Post</button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section title="Roster health">
              <div className="grid gap-2">
                {roster.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm" style={{ border: '1px solid var(--line)' }}>
                    <span className="font-semibold text-ink">{p.display_name}</span>
                    <span className="text-xs text-ink-3">{p.profile_id ? 'linked' : 'anonymous'} · {p.gender ?? 'pool?'}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Payments">
              {paymentRows.length === 0 ? (
                <div className="text-sm text-ink-3">No payment records yet.</div>
              ) : (
                <div className="grid gap-2">
                  {paymentRows.map((p) => (
                    <div key={p.id} className="rounded-xl bg-white p-3 text-sm" style={{ border: '1px solid var(--line)' }}>
                      <div className="flex justify-between">
                        <span className="font-semibold text-ink">{name(p.player_id)}</span>
                        <span className="mono text-ink">${p.amount}</span>
                      </div>
                      <div className="mt-1 text-xs text-ink-3">{p.type} · {p.method} · {p.status}</div>
                      {p.status === 'pending' && (
                        <div className="mt-3 flex gap-2">
                          <PaymentButton tournamentId={id} paymentId={p.id} status="confirmed" label="Confirm" />
                          <PaymentButton tournamentId={id} paymentId={p.id} status="refunded" label="Refund" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function PaymentButton({ tournamentId, paymentId, status, label }: { tournamentId: string; paymentId: string; status: 'confirmed' | 'refunded'; label: string }) {
  return (
    <form action={confirmMixerPayment}>
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="status" value={status} />
      <button className="rounded-xl px-3 py-2 text-xs font-semibold" style={{
        background: status === 'confirmed' ? 'var(--court)' : 'transparent',
        color: status === 'confirmed' ? 'oklch(0.2 0.04 140)' : 'var(--berry)',
        border: status === 'confirmed' ? 'none' : '1px solid var(--berry)',
      }}>
        {label}
      </button>
    </form>
  );
}

function StateButton({ tournamentId, roundId, state, label }: { tournamentId: string; roundId: string; state: string; label: string }) {
  return (
    <form action={setMixerRoundState}>
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="round_id" value={roundId} />
      <input type="hidden" name="state" value={state} />
      <button className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-ink" style={{ border: '1px solid var(--line)' }}>
        {label}
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{title}</div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
      <div className="text-[10px] uppercase tracking-[0.08em] text-ink-3">{label}</div>
      <div className="mono mt-1 text-[24px] font-bold text-ink">{value}</div>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) {
  return (
    <div className="mb-3 rounded-xl border px-3 py-2 text-sm" style={{
      borderColor: tone === 'ok' ? 'var(--court-deep)' : 'var(--berry)',
      color: tone === 'ok' ? 'var(--court-deep)' : 'var(--berry)',
      background: tone === 'ok' ? 'oklch(0.96 0.04 140)' : 'oklch(0.96 0.04 12)',
    }}>
      {children}
    </div>
  );
}
