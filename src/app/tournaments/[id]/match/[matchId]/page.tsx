import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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

export default async function MatchPage({ params }: PageProps) {
  const { id, matchId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('matches')
    .select('id,tournament_id,round_label,court_label,team_a_label,team_b_label,team_a_score,team_b_score')
    .eq('id', matchId)
    .eq('tournament_id', id)
    .single();
  if (!data) notFound();
  const row = data as MatchRow;

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
    />
  );
}
