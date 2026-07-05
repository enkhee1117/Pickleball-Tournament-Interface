// Shared row types for the Partner Mixer surfaces. Kept here so page.tsx,
// admin/page.tsx, and the extracted _components/* stay in lockstep on the
// data shape without duplicating type declarations.

export type TournamentRow = {
  id: string;
  name: string;
  format: string;
  status: string;
  invite_code: string;
  owner_user_id: string;
  // 'mixed' | 'same' | 'open' — drives who can pair with (and vote for) whom.
  gender_mode?: string | null;
};

export type ConfigRow = {
  starting_tokens: number;
  starting_chips: number;
  rounds: number;
  courts: number;
  lock_mode: 'timer' | 'manual';
  lock_seconds: number;
  alpha: number;
  beta: number;
  gamma: number;
  tau: number;
  grief_floor: number;
  repeat_decay: number;
  betting_enabled: boolean;
  raffle_enabled: boolean;
  downvotes_enabled: boolean;
  entry_fee: number;
  pay_to_play_enabled: boolean;
  boost_tokens: number;
  boost_price: number;
  boost_limit: number;
  betting_prize_winners: number;
  podium_markets: number;
  betting_rake_pct: number;
  prize_buckets: unknown;
  payment_methods: unknown;
  raffle_prize: string;
  upvote_cap_per_target: number | null;
  bet_lock_round_no: number | null;
};

export type RoundRow = {
  id: string;
  round_no: number;
  state: string;
  lock_at: string | null;
};

export type PlayerRow = {
  id: string;
  display_name: string;
  profile_id: string | null;
  gender: 'm' | 'f' | 'x' | null;
  dupr: number | null;
  withdrawn_at?: string | null;
};

export type StateRow = {
  player_id: string;
  pairing_pool: 'a' | 'b';
  tokens_base_remaining: number;
  tokens_bought_remaining: number;
  chips_remaining: number;
  sit_out_count: number;
  boosts_used: number;
};

export type PairingRow = {
  id: string;
  round_id?: string;
  player_a_id: string;
  player_b_id: string;
  court_no: number;
  // Wave (heat) within the round: when games outnumber courts, a court runs
  // several games in sequence. (court_no, wave_no) identifies one game; wave 1
  // plays first, higher waves wait for the court. Defaults to 1 (games ≤ courts).
  wave_no: number;
};

export type ScoreRow = {
  court_no: number;
  wave_no: number;
  team_a_score: number;
  team_b_score: number;
  completed_at: string | null;
};

export type PaymentRow = {
  id: string;
  type: string;
  amount: number;
  method: string;
  status: string;
  player_id?: string;
};

export type BetRow = {
  market_place: number;
  bettor_player_id: string;
  pick_player_id: string;
  chips: number;
};

export type StandingItem = {
  rank: number;
  playerId: string;
  displayName: string;
  points: number;
};

export type RaffleItem = {
  playerId: string;
  displayName: string;
  popularityTickets: number;
  frugalityTickets: number;
  tickets: number;
  prize?: string;
};
