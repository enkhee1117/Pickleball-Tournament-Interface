export type MixerRoundLike = {
  round_no: number;
  state: string;
};

export function sortMixerRounds<T extends MixerRoundLike>(rounds: T[]): T[] {
  return [...rounds].sort((a, b) => a.round_no - b.round_no);
}

export function currentMixerRound<T extends MixerRoundLike>(rounds: T[]): T | null {
  const sorted = sortMixerRounds(rounds);
  return sorted.find((round) => round.state !== 'done') ?? sorted.at(-1) ?? null;
}
