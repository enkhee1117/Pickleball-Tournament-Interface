import { Avatar } from '@/components/ui/Avatar';
import type { PairingRow, PlayerRow, RoundRow, ScoreRow } from '../_types';
import { gameSlotLabel } from '@/lib/mixer-standings';
import { EmptyNight, mixerAvatarFor } from './mixer-night';

// The shared "Courts" board — every court this round at a glance: who's
// partnered with whom, who they face, and the live/final score. Unlike the
// Match tab (which shows only the viewer's own court), this is the full-room
// view players kept asking for, and it's the same board the organizer sees.

type CourtGroup = {
  courtNo: number;
  waveNo: number;
  teams: PairingRow[];
  score: ScoreRow | undefined;
};

export function CourtsTab({
  roster,
  pairings,
  scores,
  sitOuts,
  myPlayer,
  round,
}: {
  roster: PlayerRow[];
  pairings: PairingRow[];
  scores: ScoreRow[];
  sitOuts: string[];
  myPlayer: PlayerRow | null;
  round: RoundRow;
}) {
  const nameOf = (id: string) => roster.find((p) => p.id === id)?.display_name ?? 'TBD';
  const myId = myPlayer?.id ?? null;

  if (pairings.length === 0) {
    return (
      <EmptyNight
        title="No courts yet"
        body={
          ['revealed', 'playing', 'done'].includes(round.state)
            ? 'The draw is being set up — court assignments will appear here.'
            : 'Once the organizer runs the draw, every court and matchup shows up here.'
        }
      />
    );
  }

  // Group by game slot (court + wave): when games outnumber courts, a court runs
  // several heats in sequence — each is its own matchup, scored independently.
  const slots = [...new Map(pairings.map((p) => [`${p.court_no}:${p.wave_no}`, { courtNo: p.court_no, waveNo: p.wave_no }])).values()]
    .sort((a, b) => a.courtNo - b.courtNo || a.waveNo - b.waveNo);
  const courts: CourtGroup[] = slots.map(({ courtNo, waveNo }) => ({
    courtNo,
    waveNo,
    teams: pairings.filter((p) => p.court_no === courtNo && p.wave_no === waveNo),
    score: scores.find((s) => s.court_no === courtNo && s.wave_no === waveNo),
  }));

  const sitting = sitOuts
    .map((id) => roster.find((p) => p.id === id))
    .filter((p): p is PlayerRow => !!p);

  return (
    <div className="grid gap-3 px-[18px]">
      <div className="flex items-baseline justify-between">
        <div className="serif text-[26px] leading-none">Round {round.round_no} courts</div>
        <div className="mono text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--night-text3)' }}>
          {courts.length} game{courts.length === 1 ? '' : 's'}
        </div>
      </div>

      {courts.map(({ courtNo, waveNo, teams, score }) => {
        const mineHere = !!myId && teams.some((t) => t.player_a_id === myId || t.player_b_id === myId);
        const finished = !!score?.completed_at;
        const live = !!score && !finished;
        return (
          <div
            key={`${courtNo}:${waveNo}`}
            className="rounded-[18px] p-4"
            style={{
              background: 'var(--night-card)',
              border: mineHere ? '1px solid var(--court)' : '1px solid var(--night-line)',
              boxShadow: mineHere ? '0 0 0 1px var(--court)' : 'none',
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="mono rounded-lg px-2 py-1 text-[12px] font-bold"
                  style={{ background: 'var(--night-inset)', color: 'var(--court)' }}
                >
                  {gameSlotLabel(courtNo, waveNo)}
                </span>
                {mineHere && (
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--court)' }}>
                    Your court
                  </span>
                )}
              </div>
              {live && (
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--serve)' }}>
                  <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full" style={{ background: 'var(--serve)' }} />
                  Live
                </span>
              )}
              {finished && (
                <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--night-text3)' }}>
                  Final
                </span>
              )}
            </div>

            <div className="grid gap-2">
              <TeamRow
                team={teams[0]}
                score={score ? score.team_a_score : null}
                nameOf={nameOf}
                myId={myId}
              />
              <div className="flex items-center gap-3">
                <div className="h-px flex-1" style={{ background: 'var(--night-line)' }} />
                <span className="mono text-[10px] tracking-[0.12em]" style={{ color: 'var(--night-text3)' }}>VS</span>
                <div className="h-px flex-1" style={{ background: 'var(--night-line)' }} />
              </div>
              <TeamRow
                team={teams[1]}
                score={score ? score.team_b_score : null}
                nameOf={nameOf}
                myId={myId}
              />
            </div>
          </div>
        );
      })}

      {sitting.length > 0 && (
        <div className="rounded-[18px] p-4" style={{ background: 'var(--night-card)', border: '1px dashed var(--night-line)' }}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--night-text3)' }}>
            Sitting out ({sitting.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {sitting.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3"
                style={{ background: 'var(--night-inset)', border: p.id === myId ? '1px solid var(--court)' : '1px solid transparent' }}
              >
                <Avatar player={mixerAvatarFor(p, myId ?? undefined)} size={24} />
                <span className="text-[13px]" style={{ color: 'var(--night-text2)' }}>
                  {p.id === myId ? 'You' : p.display_name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamRow({
  team,
  score,
  nameOf,
  myId,
}: {
  team: PairingRow | undefined;
  score: number | null;
  nameOf: (id: string) => string;
  myId: string | null;
}) {
  if (!team) {
    return (
      <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: 'var(--night-inset)' }}>
        <span className="text-[14px]" style={{ color: 'var(--night-text3)' }}>Awaiting opponent</span>
      </div>
    );
  }
  const players = [team.player_a_id, team.player_b_id];
  const mine = !!myId && players.includes(myId);
  return (
    <div
      className="flex items-center justify-between rounded-xl px-3 py-2.5"
      style={{ background: mine ? 'color-mix(in oklch, var(--court) 14%, var(--night-inset))' : 'var(--night-inset)' }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex -space-x-2">
          {players.map((pid) => (
            <Avatar
              key={pid}
              player={mixerAvatarFor({ id: pid, display_name: nameOf(pid) }, myId ?? undefined)}
              size={28}
              ring
            />
          ))}
        </div>
        <span className="truncate text-[14px] font-semibold">
          {players.map((pid) => (pid === myId ? 'You' : nameOf(pid))).join(' & ')}
        </span>
      </div>
      {score !== null && (
        <span className="mono ml-2 shrink-0 text-[20px] font-bold" style={{ color: 'var(--court)' }}>
          {score}
        </span>
      )}
    </div>
  );
}
