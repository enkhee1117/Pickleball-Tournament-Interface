import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';
import { currentMixerRound, sortMixerRounds } from '@/lib/mixer-rounds';
import type { ConfigRow, PairingRow, PlayerRow, RoundRow, StateRow, TournamentRow } from '../_types';
import { RosterRecovery } from './RosterRecovery';

type PageProps = { params: Promise<{ id: string }> };

export default async function MixerRecoveryPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();
  const store = await cookies();
  const theme = readThemeFromCookie(store.get(THEME_COOKIE)?.value);

  const [{ data: tournament }, { data: member }, { data: config }, { data: rounds }, { data: players }, { data: states }] =
    await Promise.all([
      supabase.from('tournaments').select('id,name,format,owner_user_id,status,invite_code').eq('id', id).single(),
      user
        ? supabase.from('tournament_members').select('role').eq('tournament_id', id).eq('user_id', user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('event_config').select('*').eq('tournament_id', id).maybeSingle(),
      supabase.from('mixer_rounds').select('id,round_no,state,lock_at').eq('tournament_id', id).order('round_no', { ascending: true }),
      supabase.from('tournament_players').select('id,display_name,gender,profile_id,withdrawn_at').eq('tournament_id', id).order('created_at', { ascending: true }),
      supabase.from('player_event_state').select('player_id,pairing_pool,tokens_base_remaining,tokens_bought_remaining,chips_remaining,sit_out_count,boosts_used').eq('tournament_id', id),
    ]);

  if (!tournament) notFound();
  const t = tournament as TournamentRow;
  if (t.format !== 'partner_mixer') notFound();
  const role = (member as { role?: string } | null)?.role ?? null;
  const isManager = !!user && (user.id === t.owner_user_id || role === 'organizer' || role === 'admin');
  if (!isManager) notFound();

  const cfg = config as ConfigRow | null;
  const roundRows = sortMixerRounds((rounds ?? []) as RoundRow[]);
  const currentRound = currentMixerRound(roundRows);
  const roster = (players ?? []) as PlayerRow[];
  const stateRows = (states ?? []) as StateRow[];

  const active = roster.filter((p) => !p.withdrawn_at);
  const withdrawn = roster.filter((p) => p.withdrawn_at);
  const courts = cfg?.courts ?? 3;

  // ODD COUNT — active players that can't fill full courts of four.
  const seatable = Math.floor(active.length / 4) * 4;
  const leftover = active.length - seatable; // 0..3 players who'd sit / need a fix
  // Fairest sitter = fewest sit-outs so far (matches the draw's rotating bye).
  const sitCount = (pid: string) => stateRows.find((s) => s.player_id === pid)?.sit_out_count ?? 0;
  const byeCandidates = [...active]
    .sort((a, b) => sitCount(a.id) - sitCount(b.id))
    .slice(0, leftover)
    .map((p) => ({ name: p.display_name, sitOuts: sitCount(p.id) }));

  // current-round pairings to spot a short/incomplete court (a no-show proxy)
  let shortCourt: number | null = null;
  if (currentRound) {
    const { data: pairings } = await supabase
      .from('mixer_pairings')
      .select('id,player_a_id,player_b_id,court_no')
      .eq('round_id', currentRound.id)
      .order('court_no', { ascending: true });
    const pairingRows = (pairings ?? []) as PairingRow[];
    const byCourt = new Map<number, number>();
    for (const p of pairingRows) byCourt.set(p.court_no, (byCourt.get(p.court_no) ?? 0) + 1);
    for (const [courtNo, teams] of byCourt) {
      if (teams < 2) {
        shortCourt = courtNo;
        break;
      }
    }
  }

  return (
    <RosterRecovery
      theme={theme}
      tournamentId={id}
      tournamentName={t.name}
      roundNo={currentRound?.round_no ?? 0}
      roundState={currentRound?.state ?? 'setup'}
      activeCount={active.length}
      courts={courts}
      leftover={leftover}
      byeCandidates={byeCandidates}
      withdrawn={withdrawn.map((p) => ({ name: p.display_name }))}
      shortCourt={shortCourt}
    />
  );
}
