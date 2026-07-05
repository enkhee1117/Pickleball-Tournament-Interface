import type { PairingRow, PlayerRow, RoundRow, ScoreRow, StandingItem } from '../_types';
import { gameSlotLabel } from '@/lib/mixer-standings';
import { EmptyNight, ordinal } from './mixer-night';
import { MatchScoreEntry } from './MatchScoreEntry';

// The player's "Match" tab — shows their current pairing/court, courtside score
// entry for their own game, plus a mini live standings block. When the event is
// finalized, defers to the final-standings view instead.

export function MatchTab({
  tournamentId,
  round,
  roster,
  pairings,
  scores,
  myPlayer,
  standings,
  gameTo = 11,
}: {
  tournamentId: string;
  round: RoundRow;
  roster: PlayerRow[];
  pairings: PairingRow[];
  scores: ScoreRow[];
  myPlayer: PlayerRow;
  standings: StandingItem[];
  gameTo?: number;
}) {
  if (standings.length > 0) {
    return <FinalStandingsNight standings={standings} myPlayer={myPlayer} />;
  }
  const myPairing = pairings.find((p) => p.player_a_id === myPlayer.id || p.player_b_id === myPlayer.id);
  const name = (id: string) => roster.find((p) => p.id === id)?.display_name ?? 'TBD';
  if (!myPairing) {
    return <EmptyNight title="No pairing yet" body="When the organizer draws this round, your court and partner land here." />;
  }
  // My game is my (court, wave) slot — not everyone stamped onto my court number,
  // which can hold several games (heats) when games outnumber courts.
  const courtTeams = pairings.filter((p) => p.court_no === myPairing.court_no && p.wave_no === myPairing.wave_no);
  const myTeamIndex = Math.max(0, courtTeams.findIndex((p) => p.id === myPairing.id));
  const opponent = courtTeams.find((p) => p.id !== myPairing.id);
  const score = scores.find((s) => s.court_no === myPairing.court_no && s.wave_no === myPairing.wave_no);
  // When my game is a later heat, I wait until the earlier heats on my court
  // finish. "Up next" until every wave below mine on this court is scored.
  const waitingForHeats =
    myPairing.wave_no > 1 &&
    !score?.completed_at &&
    !Array.from({ length: myPairing.wave_no - 1 }, (_, i) => i + 1).every((w) =>
      scores.find((s) => s.court_no === myPairing.court_no && s.wave_no === w)?.completed_at,
    );
  const isLive = !score?.completed_at;
  const myScore = !score ? 0 : myTeamIndex === 0 ? score.team_a_score : score.team_b_score;
  const theirScore = !score ? 0 : myTeamIndex === 0 ? score.team_b_score : score.team_a_score;
  const yourTeam = `${name(myPairing.player_a_id)} & ${name(myPairing.player_b_id)}`;
  const oppTeam = opponent ? `${name(opponent.player_a_id)} & ${name(opponent.player_b_id)}` : null;
  return (
    <div className="px-[18px]">
      {waitingForHeats ? (
        // My game is a later heat on a shared court — I'm seated, but I wait for
        // the earlier heat(s) to clear the court before first serve.
        <div
          className="relative overflow-hidden rounded-[18px] p-5"
          style={{ background: 'var(--night-card)', border: '1px solid color-mix(in oklch, var(--court) 40%, var(--night-line))' }}
        >
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--court)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--court)' }} />
            You&apos;re up next
          </div>
          <div className="disp mt-2 text-[56px] font-black leading-[0.85] text-white">
            Court {myPairing.court_no}
          </div>
          <div className="serif mt-2 text-[22px] leading-none text-white">Heat {myPairing.wave_no} — after Heat {myPairing.wave_no - 1} finishes.</div>
          <div className="mt-4 flex items-center gap-3 text-sm">
            <span className="font-bold" style={{ color: 'var(--court)' }}>{yourTeam}</span>
            {oppTeam && <span className="mono text-[11px]" style={{ color: 'rgba(255,255,255,.6)' }}>VS</span>}
            {oppTeam && <span style={{ color: 'rgba(255,255,255,.85)' }}>{oppTeam}</span>}
          </div>
          <div className="mt-3 text-[12px]" style={{ color: 'rgba(255,255,255,.6)' }}>
            Stay close — you take Court {myPairing.court_no} as soon as it opens up.
          </div>
        </div>
      ) : isLive ? (
        // In-app "you're up" court call / go-time takeover (notify.html): the
        // seat is real (this player is drawn on this court, unscored).
        <div
          className="relative overflow-hidden rounded-[18px] p-5"
          style={{
            background: 'radial-gradient(ellipse 120% 80% at 50% 0%, color-mix(in oklch, var(--serve) 30%, transparent), transparent 60%), var(--night-serve-bg)',
            border: '1px solid color-mix(in oklch, var(--serve) 45%, var(--night-line))',
          }}
        >
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--serve)' }}>
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full" style={{ background: 'var(--serve)' }} />
            Take the court
          </div>
          <div className="disp mt-2 text-[72px] font-black leading-[0.85] text-white" style={{ textShadow: '0 0 40px color-mix(in oklch, var(--serve) 55%, transparent)' }}>
            Court {myPairing.court_no}
          </div>
          {myPairing.wave_no > 1 && (
            <div className="mono mt-1 text-[12px] uppercase tracking-[0.1em]" style={{ color: 'var(--court)' }}>Heat {myPairing.wave_no} — the court is yours</div>
          )}
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
        <div className="rounded-[18px] p-5" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
          <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--court)' }}>Your team</div>
          <div className="serif mt-2 text-[32px] leading-none">{yourTeam}</div>
          <div className="mt-2 text-sm" style={{ color: 'var(--night-text2)' }}>{gameSlotLabel(myPairing.court_no, myPairing.wave_no)}</div>
          {oppTeam && (
            <div className="mt-3 text-sm" style={{ color: 'var(--night-text2)' }}>vs {oppTeam}</div>
          )}
        </div>
      )}
      {opponent && !waitingForHeats ? (
        <MatchScoreEntry
          tournamentId={tournamentId}
          roundId={round.id}
          courtNo={myPairing.court_no}
          waveNo={myPairing.wave_no}
          teamALabel={`${name(courtTeams[0].player_a_id)} & ${name(courtTeams[0].player_b_id)}`}
          teamBLabel={`${name(courtTeams[1].player_a_id)} & ${name(courtTeams[1].player_b_id)}`}
          myTeam={myTeamIndex === 0 ? 'a' : 'b'}
          initialA={score?.team_a_score ?? 0}
          initialB={score?.team_b_score ?? 0}
          posted={!!score?.completed_at}
          canScore={['revealed', 'playing'].includes(round.state)}
          gameTo={gameTo}
        />
      ) : (
        <div className="mt-3 rounded-[18px] p-5 text-center" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
          <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--night-text3)' }}>Score</div>
          <div className="mono mt-2 text-[54px] font-bold" style={{ color: 'var(--court)' }}>{myScore}-{theirScore}</div>
        </div>
      )}
      <StandingsMini roster={roster} pairings={pairings} scores={scores} />
    </div>
  );
}

function StandingsMini({ roster, pairings, scores }: { roster: PlayerRow[]; pairings: PairingRow[]; scores: ScoreRow[] }) {
  const points = new Map<string, number>();
  const name = (id: string) => roster.find((p) => p.id === id)?.display_name ?? 'TBD';
  const byGame = new Map<string, PairingRow[]>();
  for (const p of pairings) {
    const key = `${p.court_no}:${p.wave_no}`;
    byGame.set(key, [...(byGame.get(key) ?? []), p]);
  }
  for (const teams of byGame.values()) {
    const slot = teams[0];
    const s = scores.find((row) => row.court_no === slot.court_no && row.wave_no === slot.wave_no);
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
    <div className="mt-3 rounded-2xl p-4" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
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
      <div className="mb-3 rounded-2xl p-5" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
        <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--court)' }}>Final standings</div>
        <div className="serif mt-2 text-[34px] leading-none">Mixer complete</div>
        <div className="mt-1 text-sm" style={{ color: 'var(--night-text2)' }}>Podium markets and raffle are settled from these results.</div>
      </div>
      <div className="grid gap-2">
        {standings.slice(0, 12).map((row) => {
          const me = row.playerId === myPlayer.id;
          return (
            <div key={row.playerId} className="flex items-center justify-between rounded-2xl p-3" style={{ background: me ? 'color-mix(in oklch, var(--court) 18%, var(--night-card))' : 'var(--night-card)', border: me ? '1px solid var(--court)' : '1px solid var(--night-line)' }}>
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--night-text3)' }}>{ordinal(row.rank)}</div>
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
