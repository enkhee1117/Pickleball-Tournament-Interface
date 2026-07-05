import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';
import { sortMixerRounds } from '@/lib/mixer-rounds';
import { buildCourtResults } from '@/lib/mixer-standings';
import type { ConfigRow, PairingRow, PaymentRow, PlayerRow, RoundRow, StateRow, TournamentRow } from '../mixer/_types';
import { computeRecapStats, resultsToCsv, type Superlative } from './recap-stats';
import { Recap } from './Recap';

type PageProps = { params: Promise<{ id: string }> };

type ScoreRowWithRound = {
  round_id: string;
  court_no: number;
  team_a_score: number;
  team_b_score: number;
  completed_at: string | null;
};

type SnapshotRow = { raffle_winner: unknown };

export default async function RecapPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();
  const store = await cookies();
  const theme = readThemeFromCookie(store.get(THEME_COOKIE)?.value);

  const [{ data: tournament }, { data: member }, { data: config }, { data: rounds }, { data: players }, { data: states }, { data: payments }, { data: snapshot }] =
    await Promise.all([
      supabase.from('tournaments').select('id,name,format,owner_user_id,status,invite_code').eq('id', id).single(),
      user ? supabase.from('tournament_members').select('role').eq('tournament_id', id).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('event_config').select('*').eq('tournament_id', id).maybeSingle(),
      supabase.from('mixer_rounds').select('id,round_no,state,lock_at').eq('tournament_id', id).order('round_no', { ascending: true }),
      supabase.from('tournament_players').select('id,display_name,gender,profile_id,withdrawn_at').eq('tournament_id', id).order('created_at', { ascending: true }),
      supabase.from('player_event_state').select('player_id,pairing_pool,tokens_base_remaining,tokens_bought_remaining,chips_remaining,sit_out_count,boosts_used').eq('tournament_id', id),
      supabase.from('payments').select('id,player_id,type,amount,method,status').eq('tournament_id', id),
      supabase.from('mixer_final_snapshots').select('raffle_winner').eq('tournament_id', id).maybeSingle(),
    ]);

  if (!tournament) notFound();
  const t = tournament as TournamentRow;
  if (t.format !== 'partner_mixer') notFound();
  const role = (member as { role?: string } | null)?.role ?? null;
  const isManager = !!user && (user.id === t.owner_user_id || role === 'organizer' || role === 'admin');
  if (!isManager) notFound();

  const cfg = config as ConfigRow | null;
  const roundRows = sortMixerRounds((rounds ?? []) as RoundRow[]);
  const roster = (players ?? []) as PlayerRow[];
  const stateRows = (states ?? []) as StateRow[];
  const paymentRows = (payments ?? []) as PaymentRow[];
  const final = snapshot as SnapshotRow | null;
  const roundIds = roundRows.map((r) => r.id);

  const [{ data: pairings }, { data: scores }] = await Promise.all([
    roundIds.length ? supabase.from('mixer_pairings').select('id,round_id,player_a_id,player_b_id,court_no,wave_no').in('round_id', roundIds) : Promise.resolve({ data: [] }),
    roundIds.length ? supabase.from('mixer_scores').select('round_id,court_no,wave_no,team_a_score,team_b_score,completed_at').in('round_id', roundIds) : Promise.resolve({ data: [] }),
  ]);

  const pairingRows = (pairings ?? []) as (PairingRow & { round_id: string })[];
  const scoreRows = (scores ?? []) as ScoreRowWithRound[];
  const roundNoById = new Map(roundRows.map((r) => [r.id, r.round_no] as const));
  const nameOf = (pid: string) => roster.find((p) => p.id === pid)?.display_name ?? 'TBD';
  const names = new Map(roster.map((p) => [p.id, p.display_name] as const));
  const sitOuts = new Map(stateRows.map((s) => [s.player_id, s.sit_out_count] as const));

  const results = buildCourtResults(pairingRows, scoreRows, roundNoById, null, nameOf);
  const stats = computeRecapStats(results, names, sitOuts);

  const entryFee = Number(cfg?.entry_fee ?? 0);
  const confirmedEntries = paymentRows.filter((p) => p.type === 'entry' && p.status === 'confirmed').length;
  const pot = Math.round((confirmedEntries || roster.length) * entryFee);

  const superlatives: { label: string; sup: Superlative }[] = [];
  if (stats.biggestClimber) superlatives.push({ label: 'Biggest climber', sup: stats.biggestClimber });
  if (stats.longestStreak)
    superlatives.push({
      label: 'Longest streak',
      sup: { playerId: stats.longestStreak.playerId, name: stats.longestStreak.name, detail: `${stats.longestStreak.streak} straight wins` },
    });
  if (stats.ironPlayer) superlatives.push({ label: 'Iron player', sup: stats.ironPlayer });
  if (stats.topScorer) superlatives.push({ label: 'Most points', sup: stats.topScorer });

  const podium = stats.standings.slice(0, 3).map((row, i) => ({
    rank: i + 1,
    name: row.name,
    record: `${row.wins}–${row.losses} · ${row.points} pts`,
  }));

  const raffleWinner = final?.raffle_winner && !Array.isArray(final.raffle_winner) ? (final.raffle_winner as { displayName?: string }) : null;
  const attendance = roster.map((p) => ({ name: p.display_name, guest: !p.profile_id }));

  return (
    <Recap
      theme={theme}
      tournamentId={id}
      tournamentName={t.name}
      inviteCode={t.invite_code}
      finalized={t.status === 'completed' || t.status === 'final'}
      champion={stats.standings[0]?.name ?? null}
      podium={podium}
      superlatives={superlatives}
      nightNumbers={{
        closestMatch: stats.closestMatch ? { label: `${stats.closestMatch.scoreA}–${stats.closestMatch.scoreB}`, detail: `Round ${stats.closestMatch.roundNo} · Court ${stats.closestMatch.courtNo}` } : null,
        avgMargin: stats.avgMargin,
        longestStreak: stats.longestStreak?.streak ?? null,
        matches: stats.matches,
      }}
      attendance={attendance}
      playersCount={roster.length}
      roundsTotal={roundRows.length}
      pot={pot}
      raffleWinner={raffleWinner?.displayName ?? null}
      csv={resultsToCsv(results, names)}
    />
  );
}
