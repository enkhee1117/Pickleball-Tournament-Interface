import type { PairingRow, PlayerRow, ScoreRow, StandingItem } from '../_types';
import { EmptyNight, ordinal } from './mixer-night';

// The player's "Match" tab — shows their current pairing/court/score plus a
// mini live standings block. When the event is finalized, defers to the
// final-standings view instead.

export function MatchTab({
  roster,
  pairings,
  scores,
  myPlayer,
  standings,
}: {
  roster: PlayerRow[];
  pairings: PairingRow[];
  scores: ScoreRow[];
  myPlayer: PlayerRow;
  standings: StandingItem[];
}) {
  if (standings.length > 0) {
    return <FinalStandingsNight standings={standings} myPlayer={myPlayer} />;
  }
  const myPairing = pairings.find((p) => p.player_a_id === myPlayer.id || p.player_b_id === myPlayer.id);
  const name = (id: string) => roster.find((p) => p.id === id)?.display_name ?? 'TBD';
  if (!myPairing) {
    return <EmptyNight title="No pairing yet" body="When the organizer draws this round, your court and partner land here." />;
  }
  const courtTeams = pairings.filter((p) => p.court_no === myPairing.court_no);
  const myTeamIndex = Math.max(0, courtTeams.findIndex((p) => p.id === myPairing.id));
  const opponent = courtTeams.find((p) => p.id !== myPairing.id);
  const score = scores.find((s) => s.court_no === myPairing.court_no);
  const isLive = !score?.completed_at;
  const myScore = !score ? 0 : myTeamIndex === 0 ? score.team_a_score : score.team_b_score;
  const theirScore = !score ? 0 : myTeamIndex === 0 ? score.team_b_score : score.team_a_score;
  const yourTeam = `${name(myPairing.player_a_id)} & ${name(myPairing.player_b_id)}`;
  const oppTeam = opponent ? `${name(opponent.player_a_id)} & ${name(opponent.player_b_id)}` : null;
  return (
    <div className="px-[18px]">
      {isLive ? (
        // In-app "you're up" court call / go-time takeover (notify.html): the
        // seat is real (this player is drawn on this court, unscored).
        <div
          className="relative overflow-hidden rounded-[18px] p-5"
          style={{
            background: 'radial-gradient(ellipse 120% 80% at 50% 0%, color-mix(in oklch, var(--serve) 30%, transparent), transparent 60%), oklch(0.16 0.03 40)',
            border: '1px solid color-mix(in oklch, var(--serve) 45%, oklch(0.36 0.04 266))',
          }}
        >
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--serve)' }}>
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full" style={{ background: 'var(--serve)' }} />
            Take the court
          </div>
          <div className="disp mt-2 text-[72px] font-black leading-[0.85] text-white" style={{ textShadow: '0 0 40px color-mix(in oklch, var(--serve) 55%, transparent)' }}>
            Court {myPairing.court_no}
          </div>
          <div className="serif mt-2 text-[26px] leading-none text-white">It&apos;s go time.</div>
          <div className="mt-4 flex items-center gap-3 text-sm">
            <span className="font-bold" style={{ color: 'var(--court)' }}>{yourTeam}</span>
            {oppTeam && <span className="mono text-[11px]" style={{ color: 'rgba(255,255,255,.6)' }}>VS</span>}
            {oppTeam && <span style={{ color: 'rgba(255,255,255,.85)' }}>{oppTeam}</span>}
          </div>
          <div className="mt-3 text-[12px]" style={{ color: 'rgba(255,255,255,.6)' }}>
            First serve when all teams check in. Head over — your seat is held.
          </div>
        </div>
      ) : (
        <div className="rounded-[18px] p-5" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
          <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--court)' }}>Your team</div>
          <div className="serif mt-2 text-[32px] leading-none">{yourTeam}</div>
          <div className="mt-2 text-sm" style={{ color: 'oklch(0.78 0.028 264)' }}>Court {myPairing.court_no}</div>
          {oppTeam && (
            <div className="mt-3 text-sm" style={{ color: 'oklch(0.78 0.028 264)' }}>vs {oppTeam}</div>
          )}
        </div>
      )}
      <div className="mt-3 rounded-[18px] p-5 text-center" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
        <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'oklch(0.7 0.03 264)' }}>Score</div>
        <div className="mono mt-2 text-[54px] font-bold" style={{ color: 'var(--court)' }}>{myScore}-{theirScore}</div>
      </div>
      <StandingsMini roster={roster} pairings={pairings} scores={scores} />
    </div>
  );
}

function StandingsMini({ roster, pairings, scores }: { roster: PlayerRow[]; pairings: PairingRow[]; scores: ScoreRow[] }) {
  const points = new Map<string, number>();
  const name = (id: string) => roster.find((p) => p.id === id)?.display_name ?? 'TBD';
  const byCourt = new Map<number, PairingRow[]>();
  for (const p of pairings) byCourt.set(p.court_no, [...(byCourt.get(p.court_no) ?? []), p]);
  for (const [courtNo, teams] of byCourt) {
    const s = scores.find((row) => row.court_no === courtNo);
    if (!s) continue;
    const teamA = teams[0];
    const teamB = teams[1];
    if (teamA) {
      points.set(teamA.player_a_id, (points.get(teamA.player_a_id) ?? 0) + s.team_a_score);
      points.set(teamA.player_b_id, (points.get(teamA.player_b_id) ?? 0) + s.team_a_score);
    }
    if (teamB) {
      points.set(teamB.player_a_id, (points.get(teamB.player_a_id) ?? 0) + s.team_b_score);
      points.set(teamB.player_b_id, (points.get(teamB.player_b_id) ?? 0) + s.team_b_score);
    }
  }
  const rows = [...points.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 rounded-2xl p-4" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
      <div className="serif mb-2 text-[24px]">Live standings</div>
      {rows.map(([id, pts], i) => (
        <div key={id} className="flex items-center justify-between py-2">
          <div className="text-sm">{i + 1}. {name(id)}</div>
          <div className="mono text-sm" style={{ color: 'var(--court)' }}>{pts}</div>
        </div>
      ))}
    </div>
  );
}

function FinalStandingsNight({ standings, myPlayer }: { standings: StandingItem[]; myPlayer: PlayerRow }) {
  return (
    <div className="px-[18px]">
      <div className="mb-3 rounded-2xl p-5" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
        <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--court)' }}>Final standings</div>
        <div className="serif mt-2 text-[34px] leading-none">Mixer complete</div>
        <div className="mt-1 text-sm" style={{ color: 'oklch(0.78 0.028 264)' }}>Podium markets and raffle are settled from these results.</div>
      </div>
      <div className="grid gap-2">
        {standings.slice(0, 12).map((row) => {
          const me = row.playerId === myPlayer.id;
          return (
            <div key={row.playerId} className="flex items-center justify-between rounded-2xl p-3" style={{ background: me ? 'color-mix(in oklch, var(--court) 18%, oklch(0.215 0.03 264))' : 'oklch(0.215 0.03 264)', border: me ? '1px solid var(--court)' : '1px solid oklch(0.36 0.04 266)' }}>
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'oklch(0.7 0.03 264)' }}>{ordinal(row.rank)}</div>
                <div className="text-sm font-bold">{me ? 'You' : row.displayName}</div>
              </div>
              <div className="mono text-xl font-bold" style={{ color: 'var(--court)' }}>{row.points}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
