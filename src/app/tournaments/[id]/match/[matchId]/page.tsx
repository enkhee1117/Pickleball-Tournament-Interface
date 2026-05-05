import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ALL_PLAYOFF_LABELS } from '@/lib/playoffs';
import { MatchScreen } from './MatchScreen';

type PageProps = {
  params: Promise<{ id: string; matchId: string }>;
};

type MatchRow = {
  id: string;
  tournament_id: string;
  round_label: string | null;
  court_label: string | null;
  team_a_label: string;
  team_b_label: string;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_side: 'a' | 'b' | null;
  completed_at: string | null;
};

type SiblingRow = {
  id: string;
  round_label: string | null;
  completed_at: string | null;
};

type RosterPlayer = {
  id: string;
  display_name: string;
  profile_id: string | null;
};

export default async function MatchPage({ params }: PageProps) {
  const { id, matchId } = await params;
  const supabase = await createClient();

  const [{ data }, { data: siblings }, { data: roster }, { data: { user } }] = await Promise.all([
    supabase
      .from('matches')
      .select('id,tournament_id,round_label,court_label,team_a_label,team_b_label,team_a_score,team_b_score,winner_side,completed_at')
      .eq('id', matchId)
      .eq('tournament_id', id)
      .single(),
    supabase
      .from('matches')
      .select('id,round_label,completed_at')
      .eq('tournament_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('tournament_players')
      .select('id,display_name,profile_id')
      .eq('tournament_id', id),
    supabase.auth.getUser(),
  ]);
  if (!data) notFound();
  const row = data as MatchRow;
  const players = (roster ?? []) as RosterPlayer[];
  const userHasClaimedSlot = !!user && players.some((p) => p.profile_id === user.id);
  // Map player names to {id, claimable} so MatchScreen can offer "I am
  // [name]" buttons for unclaimed slots whose label matches a roster row.
  const claimables = !user || userHasClaimedSlot
    ? null
    : players
        .filter((p) => !p.profile_id)
        .map((p) => ({ id: p.id, displayName: p.display_name }));

  const isPlayoff = (ALL_PLAYOFF_LABELS as readonly string[]).includes(row.round_label ?? '');
  const returnTab: 'matches' | 'bracket' = isPlayoff ? 'bracket' : 'matches';

  // Walk only the siblings on the same side of the playoff/RR split — that's
  // also how the scoreboard tabs partition them, so swipe order matches what
  // the user just navigated from.
  const sameSection = ((siblings ?? []) as SiblingRow[]).filter((m) => {
    const playoff = (ALL_PLAYOFF_LABELS as readonly string[]).includes(m.round_label ?? '');
    return playoff === isPlayoff;
  });
  const idx = sameSection.findIndex((m) => m.id === matchId);
  // Chevron buttons + swipe walk every sibling so the user can review any
  // match. The "Score next match →" CTA skips completed ones so they keep
  // landing on something that actually needs a score.
  const prevId = idx > 0 ? sameSection[idx - 1].id : null;
  const nextId = idx >= 0 && idx < sameSection.length - 1 ? sameSection[idx + 1].id : null;
  let nextUnscoredId: string | null = null;
  for (let i = idx + 1; i < sameSection.length; i += 1) {
    if (!sameSection[i].completed_at) {
      nextUnscoredId = sameSection[i].id;
      break;
    }
  }
  // No unscored match after this one? Fall back to the first unscored one in
  // the section so the user can keep scoring without bouncing to the
  // scoreboard.
  if (!nextUnscoredId) {
    for (let i = 0; i < idx; i += 1) {
      if (!sameSection[i].completed_at) {
        nextUnscoredId = sameSection[i].id;
        break;
      }
    }
  }

  return (
    <MatchScreen
      tournamentId={id}
      matchId={row.id}
      court={row.court_label ?? 'Court'}
      round={row.round_label ?? 'Round'}
      teamALabel={row.team_a_label}
      teamBLabel={row.team_b_label}
      initialScoreA={row.team_a_score ?? 0}
      initialScoreB={row.team_b_score ?? 0}
      initialDone={!!row.completed_at && row.winner_side !== null}
      returnTab={returnTab}
      prevMatchId={prevId}
      nextMatchId={nextId}
      nextUnscoredMatchId={nextUnscoredId}
      position={idx >= 0 ? idx + 1 : 0}
      total={sameSection.length}
      claimables={claimables}
    />
  );
}
