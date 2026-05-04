// Sample data shaped to match the design handoff while real data sources land.

export type SamplePlayer = {
  id: string;
  name: string;
  short: string;
  dupr: number;
  gender: 'M' | 'F' | 'NB';
  wins: number;
  losses: number;
  pd: number;
  color: string;
};

export const SAMPLE_PLAYERS: SamplePlayer[] = [
  { id: 'p1', name: 'Maya Chen', short: 'MC', dupr: 4.21, gender: 'F', wins: 7, losses: 2, pd: 38, color: '#E8C5A0' },
  { id: 'p2', name: 'Jordan Reyes', short: 'JR', dupr: 3.88, gender: 'M', wins: 6, losses: 3, pd: 22, color: '#C8D5B9' },
  { id: 'p3', name: 'Priya Shah', short: 'PS', dupr: 4.05, gender: 'F', wins: 6, losses: 3, pd: 19, color: '#F4C7B5' },
  { id: 'p4', name: 'Theo Kim', short: 'TK', dupr: 3.42, gender: 'M', wins: 5, losses: 4, pd: 8, color: '#B8C9E0' },
  { id: 'p5', name: 'Alex Park', short: 'AP', dupr: 4.5, gender: 'M', wins: 5, losses: 4, pd: 5, color: '#D9C5E0' },
  { id: 'p6', name: 'Sana Iyer', short: 'SI', dupr: 3.65, gender: 'F', wins: 4, losses: 5, pd: -4, color: '#F0D9A8' },
  { id: 'p7', name: 'Marcus Webb', short: 'MW', dupr: 3.95, gender: 'M', wins: 4, losses: 5, pd: -11, color: '#A8C8B0' },
  { id: 'p8', name: 'Lila Novak', short: 'LN', dupr: 3.3, gender: 'F', wins: 3, losses: 6, pd: -22, color: '#E0B8C0' },
  { id: 'p9', name: 'Eli Brooks', short: 'EB', dupr: 4.12, gender: 'M', wins: 3, losses: 6, pd: -25, color: '#C5D0E0' },
  { id: 'p10', name: 'Zara Ali', short: 'ZA', dupr: 3.78, gender: 'F', wins: 2, losses: 7, pd: -30, color: '#E8D0B0' },
];

export type SampleMatch = {
  id: string;
  court: number;
  round: number;
  status: 'live' | 'upcoming' | 'done';
  teamA: [string, string];
  teamB: [string, string];
  scoreA: number;
  scoreB: number;
};

export const SAMPLE_MATCHES: SampleMatch[] = [
  { id: 'm1', court: 1, round: 3, status: 'live', teamA: ['p1', 'p4'], teamB: ['p2', 'p7'], scoreA: 9, scoreB: 7 },
  { id: 'm2', court: 2, round: 3, status: 'live', teamA: ['p3', 'p9'], teamB: ['p5', 'p10'], scoreA: 6, scoreB: 8 },
  { id: 'm3', court: 1, round: 4, status: 'upcoming', teamA: ['p1', 'p3'], teamB: ['p6', 'p8'], scoreA: 0, scoreB: 0 },
  { id: 'm4', court: 2, round: 4, status: 'upcoming', teamA: ['p2', 'p5'], teamB: ['p4', 'p9'], scoreA: 0, scoreB: 0 },
  { id: 'm5', court: 1, round: 2, status: 'done', teamA: ['p1', 'p7'], teamB: ['p3', 'p10'], scoreA: 11, scoreB: 5 },
  { id: 'm6', court: 2, round: 2, status: 'done', teamA: ['p4', 'p8'], teamB: ['p2', 'p9'], scoreA: 8, scoreB: 11 },
  { id: 'm7', court: 1, round: 1, status: 'done', teamA: ['p1', 'p2'], teamB: ['p5', 'p6'], scoreA: 11, scoreB: 9 },
  { id: 'm8', court: 2, round: 1, status: 'done', teamA: ['p3', 'p4'], teamB: ['p7', 'p8'], scoreA: 11, scoreB: 6 },
];

export function getSamplePlayer(id: string): SamplePlayer | undefined {
  return SAMPLE_PLAYERS.find((p) => p.id === id);
}

export const SAMPLE_ME: SamplePlayer = SAMPLE_PLAYERS[0];
