export type AppRole = 'admin' | 'organizer' | 'player';

export type Profile = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  gender: 'm' | 'f' | 'x' | null;
  dupr_id: string | null;
  dupr_singles: number | null;
  dupr_doubles: number | null;
  bio: string | null;
  role: AppRole;
  created_at: string;
  updated_at: string;
};

export type Invite = {
  id: string;
  email: string;
  role: AppRole;
  invited_by: string | null;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
};

export type Message = {
  id: number;
  channel: string;
  user_id: string;
  content: string;
  created_at: string;
};

export type TournamentStatus = 'draft' | 'active' | 'completed' | 'archived';
export type TournamentMemberRole = 'owner' | 'organizer' | 'player' | 'viewer';

export type Tournament = {
  id: string;
  owner_user_id: string;
  name: string;
  format: string;
  status: TournamentStatus;
  whatsapp_group_url: string | null;
  invite_code: string;
  created_at: string;
  updated_at: string;
};

export type TournamentMember = {
  id: string;
  tournament_id: string;
  user_id: string;
  role: TournamentMemberRole;
  created_at: string;
};
