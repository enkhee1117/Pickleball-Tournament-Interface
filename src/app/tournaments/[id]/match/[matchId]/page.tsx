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
};

type SiblingRow = {
  id: string;
  round_label: string | null;
};

export default async function MatchPage({ params }: PageProps) {
  const { id, matchId } = await params;
  const supabase = await createClient();

  const [{ data }, { data: siblings }] = await Promise.all([
    supabase
      .from('matches')
      .select('id,tournament_id,round_label,court_label,team_a_label,team_b_label,team_a_score,team_b_score')
      .eq('id', matchId)
      .eq('tournament_id', id)
      .single(),
    supabase
      .from('matches')
      .select('id,round_label')
      .eq('tournament_id', id)
      .order('created_at', { ascending: true }),
  ]);
  if (!data) notFound();
  const row = data as MatchRow;

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
  const prevId = idx > 0 ? sameSection[idx - 1].id : null;
  const nextId = idx >= 0 && idx < sameSection.length - 1 ? sameSection[idx + 1].id : null;

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
      returnTab={returnTab}
      prevMatchId={prevId}
      nextMatchId={nextId}
      position={idx >= 0 ? idx + 1 : 0}
      total={sameSection.length}
    />
  );
}
