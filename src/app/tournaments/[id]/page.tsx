import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getProfile } from '@/lib/auth';
import { THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';
import type { Tournament } from '@/lib/types';
import { Chip } from '@/components/ui/Chip';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { Icons } from '@/components/ui/icons';
import { DesktopNav, DesktopSurface } from '@/components/desktop';
import { SAMPLE_PLAYERS } from '@/lib/sample-data';
import { formatLabelFor } from '@/lib/tournaments';
import {
  ALL_PLAYOFF_LABELS,
  PLAYOFF_ROUND_LABELS,
  SEMI_LOSER_PLACEHOLDERS,
  SEMI_WINNER_PLACEHOLDERS,
} from '@/lib/playoffs';
import {
  computePlayerStandings,
  computeStandings,
  isRotatingPartnersData,
  type StandingRow,
  type StandingsMatch,
} from '@/lib/scoring';
import { refreshTournamentStatus } from '@/lib/tournament-status-server';
import { GeneratePlayoffsForm } from './GeneratePlayoffsForm';
import { BracketSeedingChoice } from './BracketSeedingChoice';
import { CoverImageUpload } from './CoverImageUpload';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { deleteTournament, resetTournamentMatches } from './settings-actions';
import { GenerateMatchesPanel } from './invite/GenerateMatchesPanel';
import { ManualTeamsPanel } from './invite/ManualTeamsPanel';
import { RosterRow } from './invite/RosterRow';
import { AddPlayerForm } from './invite/AddPlayerForm';
import { ScoreboardClaimBanner } from './ScoreboardClaimBanner';
import { RecordingsMenu } from '@/components/RecordingsMenu';
import { ConfirmForm } from '@/components/ui/ConfirmForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { formatInviteCode } from '@/lib/invite-codes';
import { currentMixerRound } from '@/lib/mixer-rounds';
import { MixerModeSwitch } from './mixer/MixerModeSwitch';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: 'matches' | 'standings' | 'bracket' | 'settings' | 'overview' | 'roster';
    done?: string;
    ok?: string;
    error?: string;
  }>;
};

type MatchRow = {
  id: string;
  round_label: string | null;
  court_label: string | null;
  team_a_label: string;
  team_b_label: string;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_side: 'a' | 'b' | null;
  completed_at: string | null;
  match_games: { team_a_score: number; team_b_score: number }[] | null;
  recording_url: string | null;
  forfeited_by: string | null;
};

type MixerConfigRow = {
  rounds: number;
  courts: number;
  lock_mode: 'timer' | 'manual';
  lock_seconds: number;
  entry_fee: number;
  betting_enabled: boolean;
  raffle_enabled: boolean;
  pay_to_play_enabled: boolean;
};

type MixerRoundRow = {
  id: string;
  round_no: number;
  state: string;
  lock_at: string | null;
};

type MixerStateRow = {
  player_id: string;
  pairing_pool: 'a' | 'b';
  tokens_base_remaining: number;
  tokens_bought_remaining: number;
  chips_remaining: number;
  sit_out_count: number;
};

type MixerPaymentRow = {
  status: string;
  type: string;
};

export default async function TournamentDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const showDone = sp.done === '1';
  const supabase = await createClient();
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const theme = readThemeFromCookie(cookieStore.get(THEME_COOKIE)?.value);

  // Fan out every query in parallel — tournament + matches + roster always,
  // plus member role and viewer profile when signed in. Status refresh fires
  // alongside but the page never reads it (next load sees the corrected
  // value).
  const memberRoleQuery = user
    ? supabase
        .from('tournament_members')
        .select('role')
        .eq('tournament_id', id)
        .eq('user_id', user.id)
        .maybeSingle()
    : Promise.resolve({ data: null });
  // Viewer's display name comes from the request-cached getProfile() the root
  // layout already loaded — reusing it here avoids a second profiles round-trip
  // on this hot path (React cache() can't dedupe the differently-shaped query
  // this page used before).
  const viewerProfileQuery = user ? getProfile() : Promise.resolve(null);

  const [
    { data: tournament },
    { data: matches },
    { data: players },
    ,
    { data: memberRow },
    viewerProfile,
  ] = await Promise.all([
    supabase
      .from('tournaments')
      .select('id,owner_user_id,name,format,status,whatsapp_group_url,invite_code,gender_mode,pairing_mode,cover_image_url,created_at,updated_at')
      .eq('id', id)
      .single(),
    supabase
      .from('matches')
      .select(
        'id,round_label,court_label,team_a_label,team_b_label,team_a_score,team_b_score,winner_side,completed_at,recording_url,forfeited_by,match_games(team_a_score,team_b_score)',
      )
      .eq('tournament_id', id)
      .order('created_at', { ascending: true })
      .limit(200),
    supabase
      .from('tournament_players')
      .select('id,display_name,email,profile_id,gender,phone,dupr,withdrawn_at')
      .eq('tournament_id', id)
      .order('created_at', { ascending: true }),
    // Fire-and-forget status refresh in parallel; the page never reads its
    // result so we don't await it sequentially.
    refreshTournamentStatus(supabase, id).then(() => ({ data: null })),
    memberRoleQuery,
    viewerProfileQuery,
  ]);

  if (!tournament) notFound();
  const t = tournament as Tournament;
  const isMixer = t.format === 'partner_mixer';
  const m = (matches ?? []) as MatchRow[];
  const [{ data: mixerConfig }, { data: mixerRounds }, { data: mixerStates }, { data: mixerPayments }] =
    isMixer
      ? await Promise.all([
          supabase
            .from('event_config')
            .select('rounds,courts,lock_mode,lock_seconds,entry_fee,betting_enabled,raffle_enabled,pay_to_play_enabled')
            .eq('tournament_id', id)
            .maybeSingle(),
          supabase
            .from('mixer_rounds')
            .select('id,round_no,state,lock_at')
            .eq('tournament_id', id)
            .order('round_no', { ascending: true }),
          supabase
            .from('player_event_state')
            .select('player_id,pairing_pool,tokens_base_remaining,tokens_bought_remaining,chips_remaining,sit_out_count')
            .eq('tournament_id', id),
          supabase
            .from('payments')
            .select('status,type')
            .eq('tournament_id', id),
        ])
      : [
          { data: null },
          { data: [] },
          { data: [] },
          { data: [] },
        ];
  const mixerCfg = mixerConfig as MixerConfigRow | null;
  const mixerRound = currentMixerRound((mixerRounds ?? []) as MixerRoundRow[]);
  const mixerStateRows = (mixerStates ?? []) as MixerStateRow[];
  const mixerPaymentRows = (mixerPayments ?? []) as MixerPaymentRow[];

  const liveCount = m.filter((row) => !row.completed_at && (row.team_a_score || row.team_b_score)).length;

  const playoffMatches = m.filter((row) =>
    (ALL_PLAYOFF_LABELS as readonly string[]).includes(row.round_label ?? ''),
  );
  const rrMatches = m.filter(
    (row) => !(ALL_PLAYOFF_LABELS as readonly string[]).includes(row.round_label ?? ''),
  );
  const playoffsExist = playoffMatches.length > 0;
  const rrPending = rrMatches.filter((row) => !row.completed_at).length;
  const canGeneratePlayoffs =
    !playoffsExist && rrMatches.length > 0 && rrPending === 0;
  const isOwner = !!user && user.id === t.owner_user_id;
  const memberRole: string | null = (memberRow as { role?: string } | null)?.role ?? null;
  const viewerDisplayName: string | null =
    (viewerProfile?.display_name ?? '').trim() || null;
  const isManager = isOwner || memberRole === 'organizer' || memberRole === 'admin';
  const isMember = isOwner || memberRole !== null;
  const playerCount = (players ?? []).length;
  const hasMatches = m.length > 0;
  const recordings = m
    .filter((row): row is MatchRow & { recording_url: string } => !!row.recording_url)
    .map((row) => ({
      matchId: row.id,
      tournamentId: id,
      roundLabel: row.round_label,
      courtLabel: row.court_label,
      teamALabel: row.team_a_label,
      teamBLabel: row.team_b_label,
      url: row.recording_url,
    }));
  type PlayerLike = { id: string; display_name: string; profile_id?: string | null };
  const rosterPlayers = (players ?? []) as PlayerLike[];
  const userHasClaimedSlot = !!user && rosterPlayers.some((p) => p.profile_id === user.id);
  const claimableForBanner =
    user && isMember && !userHasClaimedSlot
      ? rosterPlayers
          .filter((p) => !p.profile_id)
          .map((p) => ({ id: p.id, displayName: p.display_name }))
      : [];
  const activeTab = isMixer
    ? sp.tab === 'roster' || sp.tab === 'settings'
      ? sp.tab
      : 'overview'
    : sp.tab ?? 'matches';
  const statusLabel = isMixer && mixerRound
    ? `${mixerRound.state.toUpperCase()} · ROUND ${mixerRound.round_no} OF ${mixerCfg?.rounds ?? '—'}`
    : t.status === 'active'
      ? 'LIVE'
      : t.status.toUpperCase();

  const coverImageUrl =
    (t as Tournament & { cover_image_url?: string | null }).cover_image_url ?? null;

  // Hero round-progress + leader spotlight. Mixer counts completed rounds from
  // state; classic derives rounds from round labels and their completion.
  const mixerDone = ((mixerRounds ?? []) as MixerRoundRow[]).filter((r) => r.state === 'done').length;
  const classicRounds = (() => {
    if (isMixer) return { total: 0, done: 0 };
    const byRound = new Map<string, { total: number; done: number }>();
    for (const row of rrMatches) {
      const key = row.round_label ?? 'Round';
      const cur = byRound.get(key) ?? { total: 0, done: 0 };
      cur.total += 1;
      if (row.completed_at) cur.done += 1;
      byRound.set(key, cur);
    }
    return {
      total: byRound.size,
      done: [...byRound.values()].filter((r) => r.total > 0 && r.done === r.total).length,
    };
  })();
  const heroLeader: { name: string; pd: number; wl: string } | null = (() => {
    if (isMixer) return null;
    const completedRR = m.filter(
      (row) =>
        row.completed_at &&
        row.winner_side !== null &&
        !(ALL_PLAYOFF_LABELS as readonly string[]).includes(row.round_label ?? ''),
    );
    if (completedRR.length === 0) return null;
    const sm: StandingsMatch[] = completedRR.map((row) => {
      const games = row.match_games ?? [];
      return {
        id: row.id,
        team_a_label: row.team_a_label,
        team_b_label: row.team_b_label,
        winner_side: row.winner_side,
        team_a_score: row.team_a_score,
        team_b_score: row.team_b_score,
        games_won_a: games.filter((g) => g.team_a_score > g.team_b_score).length,
        games_won_b: games.filter((g) => g.team_b_score > g.team_a_score).length,
      };
    });
    const rows = isRotatingPartnersData(sm) ? computePlayerStandings(sm) : computeStandings(sm);
    const top = rows[0];
    if (!top) return null;
    return { name: top.team, pd: top.pointDiff, wl: `${top.matchWins}–${top.matchLosses}` };
  })();

  return (
    <DesktopSurface
      withCommandBar
      commands={[
        { group: 'This event', label: 'Event hub', href: `/tournaments/${id}`, icon: '▦' },
        ...(isMixer ? [{ group: 'This event', label: 'Player view', href: `/tournaments/${id}/mixer`, icon: '◎' }] : []),
        ...(isManager ? [{ group: 'This event', label: 'Invite players', href: `/tournaments/${id}/invite`, icon: '＋' }] : []),
        ...(isMixer && isManager
          ? [
              { group: 'This event', label: 'Organizer cockpit', href: `/tournaments/${id}/mixer/admin`, icon: '⚙' },
              { group: 'This event', label: 'Present screen', href: `/tournaments/${id}/mixer/present`, icon: '▶' },
            ]
          : []),
        { group: 'This event', label: 'Recap & export', href: `/tournaments/${id}/recap`, icon: '★' },
      ]}
    >
      <DesktopNav
        theme={theme}
        event={t.name}
        active="Tournaments"
        live={t.status === 'active'}
        primaryAction="＋ New event"
        primaryHref="/tournaments/new"
      />
      <main id="main" className="mx-auto w-full max-w-[1440px] px-3 pb-24 pt-5 sm:px-6 lg:px-8">
        <TournamentHero
          tournamentId={id}
          name={t.name}
          formatLabel={formatLabelFor(t.format)}
          statusLabel={statusLabel}
          live={t.status === 'active'}
          isMixer={isMixer}
          isManager={isManager}
          playerCount={playerCount}
          courts={mixerCfg?.courts ?? null}
          roundNo={isMixer ? mixerRound?.round_no ?? null : null}
          roundsTotal={isMixer ? mixerCfg?.rounds ?? null : classicRounds.total}
          roundsDone={isMixer ? mixerDone : classicRounds.done}
          hasLive={isMixer ? mixerRound?.state === 'playing' : liveCount > 0}
          leader={heroLeader}
          whatsappUrl={t.whatsapp_group_url}
          recordings={recordings}
        />


        {isMixer ? (
          <>
            {isManager ? (
              <div className="mt-4">
                <MixerModeSwitch tournamentId={id} active="event" />
              </div>
            ) : null}
            <MixerEventHome
              tournamentId={id}
              inviteCode={t.invite_code}
              isManager={isManager}
              playerCount={playerCount}
              roster={rosterPlayers}
              config={mixerCfg}
              round={mixerRound}
              states={mixerStateRows}
              payments={mixerPaymentRows}
            />
          </>
        ) : activeTab === 'settings' && isManager ? (
          <div className="mt-5">
            <Link
              href={`/tournaments/${id}`}
              className="mono inline-flex items-center gap-1 text-[12px] font-semibold"
              style={{ color: 'var(--court-deep)' }}
            >
              ← Back to hub
            </Link>
            <SettingsTab
              tournamentId={id}
              tournamentName={t.name}
              tournamentInviteCode={t.invite_code}
              tournamentFormat={t.format}
              genderMode={(t as Tournament & { gender_mode?: 'open' | 'mixed' | 'same' }).gender_mode ?? 'open'}
              coverImageUrl={coverImageUrl}
              matchCount={m.length}
              playerCount={playerCount}
              roster={rosterPlayers.map((p) => {
                const ext = p as PlayerLike & {
                  email?: string | null;
                  gender?: 'm' | 'f' | 'x' | null;
                  phone?: string | null;
                  dupr?: number | null;
                  withdrawn_at?: string | null;
                };
                return {
                  id: p.id,
                  display_name: p.display_name,
                  email: ext.email ?? null,
                  profile_id: p.profile_id ?? null,
                  gender: ext.gender ?? null,
                  phone: ext.phone ?? null,
                  dupr: ext.dupr != null ? Number(ext.dupr) : null,
                  withdrawn_at: ext.withdrawn_at ?? null,
                };
              })}
              hasMatches={hasMatches}
              isOwner={isOwner}
              currentUserId={user?.id ?? null}
              userHasClaimedSlot={userHasClaimedSlot}
            />
          </div>
        ) : (
          <div className="mt-5 grid gap-6 lg:grid-cols-[1.62fr_minmax(0,1fr)] lg:items-start">
            <div className="min-w-0">
              <div className="mb-1 flex items-center justify-between px-[18px] lg:px-0">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-[20px] font-semibold tracking-tight text-ink">Matches</h2>
                  {liveCount > 0 && <Chip tone="live">{liveCount} live</Chip>}
                </div>
                {isManager && (
                  <Link
                    href={`/tournaments/${id}?tab=settings`}
                    className="text-[13px] font-semibold"
                    style={{ color: 'var(--court-deep)' }}
                  >
                    Manage →
                  </Link>
                )}
              </div>
              {claimableForBanner.length > 0 && (
                <ScoreboardClaimBanner
                  tournamentId={id}
                  claimables={claimableForBanner}
                  viewerDisplayName={viewerDisplayName}
                />
              )}
              <MatchesTab tournamentId={id} matches={rrMatches} showDone={showDone} twoUp />
            </div>
            <aside className="min-w-0">
              <h2 className="mb-1 px-[18px] text-[20px] font-semibold tracking-tight text-ink lg:px-0">Standings</h2>
              <StandingsTab matches={m} />
              <BracketTab
                tournamentId={id}
                playoffMatches={playoffMatches}
                canGenerate={canGeneratePlayoffs}
                rrPending={rrPending}
                hasRoundRobin={rrMatches.length > 0}
                rrMatches={rrMatches}
                roster={rosterPlayers
                  // Withdrawn players don't get pulled into a fresh playoff
                  // bracket — the organizer-choice picker only sees who's
                  // still in the tournament.
                  .filter((p) => !(p as PlayerLike & { withdrawn_at?: string | null }).withdrawn_at)
                  .map((p) => {
                    const ext = p as PlayerLike & { gender?: 'm' | 'f' | 'x' | null };
                    return {
                      id: p.id,
                      display_name: p.display_name,
                      gender: ext.gender ?? null,
                    };
                  })}
                genderMode={
                  (t as Tournament & { gender_mode?: 'open' | 'mixed' | 'same' }).gender_mode ?? 'open'
                }
                isManager={isManager}
              />
            </aside>
          </div>
        )}
      </main>
    </DesktopSurface>
  );
}

// Desktop event hero (handoff hub.html .evhero): galaxy-lit court-green
// gradient, breadcrumb + room actions, big serif title, round-progress
// segments, and leader/round stat tiles. Format-agnostic; degrades to a
// stacked column below lg.
function TournamentHero({
  tournamentId,
  name,
  formatLabel,
  statusLabel,
  live,
  isMixer,
  isManager,
  playerCount,
  courts,
  roundNo,
  roundsTotal,
  roundsDone,
  hasLive,
  leader,
  whatsappUrl,
  recordings,
}: {
  tournamentId: string;
  name: string;
  formatLabel: string;
  statusLabel: string;
  live: boolean;
  isMixer: boolean;
  isManager: boolean;
  playerCount: number;
  courts: number | null;
  roundNo: number | null;
  roundsTotal: number | null;
  roundsDone: number;
  hasLive: boolean;
  leader: { name: string; pd: number; wl: string } | null;
  whatsappUrl: string | null;
  recordings: React.ComponentProps<typeof RecordingsMenu>['recordings'];
}) {
  const meta = [
    formatLabel,
    `${playerCount} player${playerCount === 1 ? '' : 's'}`,
    courts ? `${courts} court${courts === 1 ? '' : 's'}` : null,
    isMixer && roundNo && roundsTotal ? `Round ${roundNo} of ${roundsTotal}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const total = roundsTotal ?? 0;
  return (
    <section
      className="relative overflow-hidden rounded-[24px] px-5 py-6 text-white sm:px-8 sm:py-7"
      style={{
        background:
          "linear-gradient(135deg, oklch(0.24 0.05 150 / .93), oklch(0.17 0.02 140 / .9) 62%, oklch(0.16 0.02 260 / .86)), url('/design-handoff/scenes/galaxy-bg.png') center / cover no-repeat, oklch(0.16 0.02 260)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-50" aria-hidden>
        <div className="absolute left-[4%] right-[4%] top-[30%] h-px" style={{ background: 'rgba(255,255,255,.08)' }} />
        <div className="absolute bottom-[30%] left-[4%] right-[4%] h-px" style={{ background: 'rgba(255,255,255,.08)' }} />
        <div
          className="absolute bottom-[30%] right-[14%] top-[30%] border-l border-dashed"
          style={{ borderColor: 'color-mix(in oklch, var(--court) 45%, transparent)' }}
        />
      </div>

      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-[13px]" style={{ color: 'rgba(255,255,255,.66)' }}>
          <Link
            href="/tournaments"
            aria-label="Back to tournaments"
            className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border"
            style={{ borderColor: 'rgba(255,255,255,.16)', color: '#fff' }}
          >
            {Icons.back}
          </Link>
          <span className="hidden sm:inline">Tournaments</span>
          <span className="hidden sm:inline" style={{ color: 'rgba(255,255,255,.4)' }}>/</span>
          <b className="hidden truncate font-semibold text-white sm:inline">{name}</b>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {recordings.length > 0 && <RecordingsMenu recordings={recordings} dark />}
          {whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn btn-glass btn-sm">
              WhatsApp
            </a>
          )}
          <Link href={`/tournaments/${tournamentId}/invite`} className="btn btn-glass btn-sm">
            Share
          </Link>
          {isMixer && isManager && (
            <Link href={`/tournaments/${tournamentId}/mixer/present`} className="btn btn-glass btn-sm">
              Present
            </Link>
          )}
          {isMixer && isManager && (
            <Link href={`/tournaments/${tournamentId}/mixer/admin`} className="btn btn-accent btn-sm">
              Admin cockpit →
            </Link>
          )}
          {!isMixer && isManager && (
            <Link href={`/tournaments/${tournamentId}?tab=settings`} className="btn btn-accent btn-sm">
              Manage →
            </Link>
          )}
        </div>
      </div>

      <div className="relative mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2">
            <span
              className="chip"
              style={{ background: 'rgba(255,255,255,.14)', borderColor: 'rgba(255,255,255,.2)', color: '#fff' }}
            >
              {live ? <span className="dot" style={{ background: 'var(--serve)' }} /> : null}
              {statusLabel}
            </span>
          </div>
          <h1 className="serif text-[38px] leading-[.98] sm:text-[52px]">{name}</h1>
          <div className="mono mt-2.5 text-[14px]" style={{ color: 'rgba(255,255,255,.7)' }}>
            {meta}
          </div>
          {total > 0 && (
            <div className="mt-5 flex max-w-[420px] items-center gap-3.5">
              <div className="flex flex-1 gap-1.5">
                {Array.from({ length: total }).map((_, i) => {
                  const done = i < roundsDone;
                  const liveSeg = i === roundsDone && hasLive;
                  return (
                    <span
                      key={i}
                      className="h-[7px] flex-1 overflow-hidden rounded-full"
                      style={{ background: done ? 'var(--court)' : 'rgba(255,255,255,.14)' }}
                    >
                      {liveSeg ? (
                        <span className="block h-full w-[62%] rounded-full" style={{ background: 'var(--serve)' }} />
                      ) : null}
                    </span>
                  );
                })}
              </div>
              <span className="mono whitespace-nowrap text-[12px]" style={{ color: 'rgba(255,255,255,.72)' }}>
                {hasLive && roundNo ? `Round ${roundNo} in play` : `${roundsDone}/${total} rounds`}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {leader && <HeroStat label="Leader" value={leader.name.split(' ')[0]} avatarName={leader.name} />}
          {leader && <HeroStat label="Point diff" value={`${leader.pd >= 0 ? '+' : ''}${leader.pd}`} mono />}
          {isMixer && roundsTotal ? <HeroStat label="Round" value={`${roundNo ?? '—'}/${roundsTotal}`} mono /> : null}
        </div>
      </div>
    </section>
  );
}

function HeroStat({
  label,
  value,
  mono = false,
  avatarName,
}: {
  label: string;
  value: string;
  mono?: boolean;
  avatarName?: string;
}) {
  return (
    <div
      className="rounded-[14px] border px-[18px] py-[13px]"
      style={{ background: 'rgba(255,255,255,.07)', borderColor: 'rgba(255,255,255,.12)', minWidth: 118 }}
    >
      <div className="mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'rgba(255,255,255,.6)' }}>
        {label}
      </div>
      <div
        className={`mt-1 flex items-center gap-2 ${mono ? 'mono text-[24px] font-bold' : 'serif text-[26px]'}`}
        style={mono ? { letterSpacing: '-0.02em' } : undefined}
      >
        {avatarName ? <Avatar player={playerFromName(avatarName)} size={26} ring /> : null}
        {value}
      </div>
    </div>
  );
}

function MixerEventHome({
  tournamentId,
  inviteCode,
  isManager,
  playerCount,
  roster,
  config,
  round,
  states,
  payments,
}: {
  tournamentId: string;
  inviteCode: string;
  isManager: boolean;
  playerCount: number;
  roster: { id: string; display_name: string; profile_id?: string | null }[];
  config: MixerConfigRow | null;
  round: MixerRoundRow | null;
  states: MixerStateRow[];
  payments: MixerPaymentRow[];
}) {
  const linkedCount = roster.filter((p) => !!p.profile_id).length;
  const paidCount = payments.filter((p) => p.type === 'entry' && p.status === 'confirmed').length;
  const pendingPayments = payments.filter((p) => p.status === 'pending').length;
  const avgSitOuts = states.length
    ? states.reduce((sum, state) => sum + Number(state.sit_out_count ?? 0), 0) / states.length
    : 0;
  const roundLabel = round ? `Round ${round.round_no} · ${round.state}` : 'Setup';
  const nextAction = mixerNextAction(round?.state ?? null, isManager);
  const inviteDisplay = formatInviteCode(inviteCode);
  const setupItems = [
    { label: 'Invite link ready', done: true, href: `/tournaments/${tournamentId}/invite` },
    { label: `${playerCount} roster spot${playerCount === 1 ? '' : 's'}`, done: playerCount >= 4, href: `/tournaments/${tournamentId}/invite` },
    { label: config ? `${config.courts} court${config.courts === 1 ? '' : 's'} configured` : 'Initialize event setup', done: !!config, href: `/tournaments/${tournamentId}/mixer/admin` },
    { label: round ? `Voting is ${round.state}` : 'Create the first Mixer round', done: round?.state === 'open' || round?.state === 'playing' || round?.state === 'revealed', href: `/tournaments/${tournamentId}/mixer/admin` },
  ];

  return (
    <div className="px-[18px] py-4 pb-28">
      <section className="rounded-[22px] bg-white p-4" style={{ border: '1px solid var(--line)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Event home</div>
            <div className="serif mt-1 text-[28px] leading-none text-ink">{nextAction.title}</div>
            <div className="mt-2 max-w-[330px] text-sm leading-5 text-ink-3">{nextAction.body}</div>
          </div>
          <Chip tone={round?.state === 'open' || round?.state === 'playing' ? 'live' : 'court'}>{roundLabel}</Chip>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <MixerActionCard
            href={`/tournaments/${tournamentId}/mixer`}
            title="Play"
            body="Vote, see pairings, bet, and track your night."
            primary={!isManager}
          />
          {isManager && (
            <MixerActionCard
              href={`/tournaments/${tournamentId}/mixer/admin`}
              title="Organizer"
              body="Open voting, draw partners, score courts, and settle prizes."
              primary
            />
          )}
          <MixerActionCard
            href={`/tournaments/${tournamentId}/invite`}
            title="Invite"
            body={`Share code ${inviteDisplay} or manage the roster.`}
          />
          {isManager && (
            <MixerActionCard
              href={`/tournaments/${tournamentId}/mixer/present`}
              title="Present"
              body="Send reveal, courts, raffle, and results to the big screen."
            />
          )}
        </div>
      </section>

      <section className="mt-5">
        <SectionHeader title="At a glance" />
        <div className="grid grid-cols-2 gap-2">
          <MixerStat label="Players" value={playerCount} sub={`${linkedCount} claimed`} />
          <MixerStat label="Courts" value={config?.courts ?? '—'} sub={config ? `${config.rounds} rounds` : 'Needs setup'} />
          <MixerStat label="Vote window" value={config?.lock_mode === 'manual' ? 'Manual' : formatMixerDuration(config?.lock_seconds ?? 0)} sub={round?.lock_at ? 'Timer active' : 'Not started'} />
          <MixerStat label="Payments" value={`${paidCount}/${playerCount}`} sub={pendingPayments ? `${pendingPayments} pending` : 'No pending'} />
        </div>
      </section>

      <section className="mt-5">
        <SectionHeader title="Setup health" action={isManager ? <Link href={`/tournaments/${tournamentId}/mixer/admin`}>Open organizer</Link> : undefined} />
        <div className="grid gap-2">
          {setupItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl bg-white p-3"
              style={{ border: '1px solid var(--line)' }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                style={{ background: item.done ? 'var(--court)' : 'var(--paper-2)', color: item.done ? 'oklch(0.2 0.04 140)' : 'var(--ink-3)' }}
              >
                {item.done ? Icons.check : Icons.arrow}
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{item.label}</span>
              <span className="text-ink-3">{Icons.arrow}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <SectionHeader title="Roster preview" action={<Link href={`/tournaments/${tournamentId}/invite`}>Manage</Link>} />
        <div className="grid gap-2">
          {roster.slice(0, 6).map((player) => (
            <div key={player.id} className="flex items-center justify-between rounded-2xl bg-white p-3" style={{ border: '1px solid var(--line)' }}>
              <div className="flex min-w-0 items-center gap-3">
                <Avatar player={playerFromName(player.display_name)} size={34} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{player.display_name}</div>
                  <div className="text-xs text-ink-3">{player.profile_id ? 'Claimed account' : 'Invite pending'}</div>
                </div>
              </div>
              <Chip tone={player.profile_id ? 'court' : 'ghost'}>{player.profile_id ? 'Ready' : 'Open'}</Chip>
            </div>
          ))}
          {roster.length === 0 && (
            <div className="rounded-2xl bg-white p-4 text-center text-sm text-ink-3" style={{ border: '1px dashed var(--line)' }}>
              No players yet. Share the invite or add names from the roster.
            </div>
          )}
          {roster.length > 6 && (
            <Link href={`/tournaments/${tournamentId}/invite`} className="rounded-2xl bg-white p-3 text-center text-sm font-semibold text-ink" style={{ border: '1px solid var(--line)' }}>
              View all {roster.length} players
            </Link>
          )}
        </div>
      </section>

      <section className="mt-5">
        <SectionHeader title="Mixer settings" />
        <div className="grid gap-2 rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-ink-3">Token economy</span>
            <span className="font-semibold text-ink">{config?.pay_to_play_enabled ? 'Boosts on' : 'Base tokens only'}</span>
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-ink-3">Pool betting</span>
            <span className="font-semibold text-ink">{config?.betting_enabled ? 'On' : 'Off'}</span>
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-ink-3">Raffle</span>
            <span className="font-semibold text-ink">{config?.raffle_enabled ? 'On' : 'Off'}</span>
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-ink-3">Sit-out average</span>
            <span className="font-semibold text-ink">{Math.round(avgSitOuts * 10) / 10}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function MixerActionCard({
  href,
  title,
  body,
  primary = false,
}: {
  href: string;
  title: string;
  body: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="min-h-[124px] rounded-2xl p-3.5"
      style={{
        background: primary ? 'var(--ink)' : 'var(--paper-2)',
        color: primary ? 'var(--paper)' : 'var(--ink)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-base font-bold tracking-tight">{title}</div>
        <span style={{ color: primary ? 'var(--court)' : 'var(--ink-3)' }}>{Icons.arrow}</span>
      </div>
      <div className="mt-2 text-xs leading-5" style={{ color: primary ? 'oklch(0.86 0.018 100)' : 'var(--ink-3)' }}>
        {body}
      </div>
    </Link>
  );
}

function MixerStat({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">{label}</div>
      <div className="mono mt-1 text-[24px] font-bold text-ink">{value}</div>
      <div className="mt-1 text-xs text-ink-3">{sub}</div>
    </div>
  );
}

function mixerNextAction(state: string | null, isManager: boolean) {
  if (!state) {
    return isManager
      ? { title: 'Finish setup', body: 'Invite players, confirm event settings, then initialize the first Mixer round.' }
      : { title: 'Waiting for setup', body: 'The organizer is getting voting and roster details ready.' };
  }
  if (state === 'open') {
    return { title: 'Voting is open', body: 'Players can spend partner tokens now. Keep the event home handy for invite and mode switching.' };
  }
  if (state === 'locked' || state === 'drawing') {
    return { title: 'Votes are sealed', body: isManager ? 'Draw and reveal the next round from Organizer mode.' : 'The organizer is drawing partners. Your ballot is locked.' };
  }
  if (state === 'revealed') {
    return { title: 'Pairings revealed', body: 'Open Play for courts or Present for the room reveal.' };
  }
  if (state === 'playing') {
    return { title: 'Games are live', body: isManager ? 'Post scores from Organizer mode as courts finish.' : 'Check your court, follow standings, and get ready for the next round.' };
  }
  if (state === 'done') {
    return { title: 'Round complete', body: isManager ? 'Finalize standings or open the next vote when the room is ready.' : 'Scores are in. Watch for the next voting window.' };
  }
  return { title: 'Mixer event', body: 'Use this event home to jump between player, organizer, invite, and presentation modes.' };
}

function formatMixerDuration(seconds: number) {
  if (seconds <= 0) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const extraSeconds = seconds % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return extraSeconds > 0 ? `${minutes}m ${extraSeconds}s` : `${minutes}m`;
  return `${extraSeconds}s`;
}

function MatchesTab({
  tournamentId,
  matches,
  showDone,
  twoUp = false,
}: {
  tournamentId: string;
  matches: MatchRow[];
  showDone: boolean;
  twoUp?: boolean;
}) {
  if (matches.length === 0) {
    return (
      <div className="px-[18px] pt-6 pb-24">
        <div
          className="rounded-2xl bg-white p-5 text-center"
          style={{ border: '1px dashed var(--line)' }}
        >
          <div className="text-[15px] font-semibold text-ink">No matches yet</div>
          <div className="mt-1 text-xs text-ink-3">Add players, then generate the round.</div>
          <Link
            href={`/tournaments/${tournamentId}/invite`}
            className="mt-3 inline-flex items-center gap-1 rounded-full px-4 py-2 text-[13px] font-semibold"
            style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}
          >
            Manage roster {Icons.arrow}
          </Link>
        </div>
      </div>
    );
  }

  const byRound = new Map<string, MatchRow[]>();
  for (const row of matches) {
    const key = row.round_label ?? 'Round';
    const list = byRound.get(key) ?? [];
    list.push(row);
    byRound.set(key, list);
  }
  // Round 1 first — sort numerically so "Round 10" doesn't beat "Round 2".
  const rounds = [...byRound.keys()].sort((a, b) => roundNumber(a) - roundNumber(b));

  const totalDone = matches.filter((x) => x.completed_at).length;
  const totalPending = matches.length - totalDone;

  return (
    <div className="py-3.5 pb-24">
      <div className="mb-1 flex items-center justify-between px-[18px]">
        <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3">
          {totalPending} pending · {totalDone} done
        </div>
        {totalDone > 0 && (
          <Link
            href={`/tournaments/${tournamentId}?tab=matches${showDone ? '' : '&done=1'}`}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
            style={{
              background: showDone ? 'var(--ink)' : '#fff',
              color: showDone ? 'var(--paper)' : 'var(--ink-2)',
              border: `1px solid ${showDone ? 'var(--ink)' : 'var(--line)'}`,
            }}
            aria-label={showDone ? 'Hide completed matches' : 'Show completed matches'}
          >
            {showDone ? Icons.eyeOff : Icons.eye}
            {showDone ? 'Hide done' : 'Show done'}
          </Link>
        )}
      </div>
      {rounds.map((r) => {
        const list = byRound.get(r) ?? [];
        const visible = showDone ? list : list.filter((x) => !x.completed_at);
        if (visible.length === 0) return null;
        const done = list.filter((x) => x.completed_at).length;
        return (
          <div key={r} className="mb-[18px]">
            <div className="flex items-baseline justify-between px-[18px] py-2">
              <div className="serif text-[22px] text-ink">{r}</div>
              <div className="text-[11px] tracking-[0.04em] text-ink-3">{done}/{list.length} DONE</div>
            </div>
            <div className={`grid gap-2.5 px-[18px] lg:px-0 ${twoUp ? 'sm:grid-cols-2' : ''}`}>
              {visible.map((row) => (
                <RealMatchCard key={row.id} tournamentId={tournamentId} row={row} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Extract the trailing integer from labels like "Round 1", "Round 10",
// "Round 2A". Falls back to Infinity for non-matching labels so they sink
// to the end of the list.
function roundNumber(label: string): number {
  const match = label.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}


function RealMatchCard({ tournamentId, row }: { tournamentId: string; row: MatchRow }) {
  const a = playersFromLabel(row.team_a_label);
  const b = playersFromLabel(row.team_b_label);
  const scoreA = row.team_a_score ?? 0;
  const scoreB = row.team_b_score ?? 0;
  const isDone = !!row.completed_at;
  const isLive = !isDone && (scoreA > 0 || scoreB > 0);
  const aWins = scoreA > scoreB;

  return (
    <Link
      href={`/tournaments/${tournamentId}/match/${row.id}`}
      className="relative block overflow-hidden rounded-2xl bg-white p-3"
      style={{
        borderTop: '1px solid var(--line)',
        borderRight: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
        borderLeft: isLive ? '3px solid var(--serve)' : '1px solid var(--line)',
      }}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">
          {row.court_label ?? 'COURT —'}
        </div>
        <div className="flex items-center gap-1.5">
          {row.recording_url && (
            <span
              className="inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-bold text-white"
              style={{ background: /(?:youtube\.com|youtu\.be)/i.test(row.recording_url) ? '#FF0033' : 'var(--ink)' }}
              aria-label="Has recording"
            >
              ▶
            </span>
          )}
          {isLive && <Chip tone="live">LIVE</Chip>}
          {isDone && row.forfeited_by && <Chip tone="ghost">W/O</Chip>}
          {isDone && !row.forfeited_by && <Chip tone="court">FINAL</Chip>}
          {!isLive && !isDone && <Chip tone="ghost">UP NEXT</Chip>}
        </div>
      </div>
      <TeamLineSimple a={a} score={scoreA} winning={isDone && aWins} live={isLive && aWins} />
      <div className="my-1.5 h-px" style={{ background: 'var(--line)' }} />
      <TeamLineSimple a={b} score={scoreB} winning={isDone && !aWins} live={isLive && !aWins} />
    </Link>
  );
}

function TeamLineSimple({
  a,
  score,
  winning,
  live,
}: {
  a: ReturnType<typeof playersFromLabel>;
  score: number;
  winning?: boolean;
  live?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 px-0.5 py-1">
      <div className="flex">
        <Avatar player={a[0]} size={26} />
        {a[1] && (
          <div className="-ml-2">
            <Avatar player={a[1]} size={26} />
          </div>
        )}
      </div>
      <div
        className="min-w-0 flex-1 text-[13px]"
        style={{ fontWeight: winning ? 600 : 500, color: winning ? 'var(--ink)' : 'var(--ink-2)' }}
      >
        {a.map((p) => p?.name?.split(' ')[0]).filter(Boolean).join(' & ')}
      </div>
      {winning && <span style={{ color: 'var(--court-deep)' }}>{Icons.check}</span>}
      <div
        className="mono min-w-[32px] text-right text-[22px] font-bold"
        style={{
          color: winning ? 'var(--court-deep)' : live ? 'var(--serve)' : 'var(--ink-3)',
          letterSpacing: '-0.02em',
        }}
      >
        {score}
      </div>
    </div>
  );
}

function playersFromLabel(label: string) {
  // Labels are stored as "Alice & Bob" or just "Alice".
  const parts = label.split(/\s*&\s*|\s*\/\s*/).filter(Boolean);
  return parts.slice(0, 2).map((s) => playerFromName(s));
}

function SettingsTab({
  tournamentId,
  tournamentName,
  tournamentInviteCode,
  tournamentFormat,
  genderMode,
  matchCount,
  playerCount,
  roster,
  hasMatches,
  isOwner,
  currentUserId,
  userHasClaimedSlot,
  coverImageUrl,
}: {
  tournamentId: string;
  tournamentName: string;
  tournamentInviteCode: string;
  tournamentFormat: string;
  genderMode: 'open' | 'mixed' | 'same';
  matchCount: number;
  playerCount: number;
  coverImageUrl: string | null;
  roster: {
    id: string;
    display_name: string;
    email: string | null;
    profile_id: string | null;
    gender: 'm' | 'f' | 'x' | null;
    phone: string | null;
    dupr: number | null;
    withdrawn_at: string | null;
  }[];
  hasMatches: boolean;
  isOwner: boolean;
  currentUserId: string | null;
  userHasClaimedSlot: boolean;
}) {
  const isFixed = tournamentFormat === 'fixed_partners';
  const showGender = genderMode !== 'open';
  // Withdrawn players sit out new match generation — keep them in the
  // roster (so completed matches still resolve their names) but stop
  // putting them on courts.
  const rosterForGeneration = roster
    .filter((p) => !p.withdrawn_at)
    .map((p) => ({ id: p.id, display_name: p.display_name }));
  const males = roster.filter((p) => p.gender === 'm').length;
  const females = roster.filter((p) => p.gender === 'f').length;
  const untagged = roster.filter((p) => !p.gender).length;
  return (
    <div className="px-[18px] py-[18px] pb-24">
      <SectionHeader title="Cover image" mute="Shown on the scoreboard banner" />
      <div className="mb-5">
        <CoverImageUpload tournamentId={tournamentId} initialUrl={coverImageUrl} />
      </div>

      <SectionHeader
        title="Roster"
        mute={
          showGender
            ? `${roster.length} confirmed · M ${males} · F ${females}${untagged ? ` · ${untagged} untagged` : ''}`
            : `${roster.length} confirmed`
        }
      />

      <AddPlayerForm
        tournamentId={tournamentId}
        tournamentName={tournamentName}
        inviteCode={tournamentInviteCode}
        existingProfileIds={roster.flatMap((p) => (p.profile_id ? [p.profile_id] : []))}
      />

      <div className="mb-5 grid gap-2">
        {roster.length === 0 ? (
          <div
            className="rounded-2xl bg-white p-4 text-center text-sm text-ink-3"
            style={{ border: '1px dashed var(--line)' }}
          >
            No players yet. Add a few above to get started.
          </div>
        ) : (
          roster.map((p) => (
            <RosterRow
              key={p.id}
              tournamentId={tournamentId}
              tournamentName={tournamentName}
              inviteCode={tournamentInviteCode}
              player={p}
              currentUserId={currentUserId}
              userHasClaimedSlot={userHasClaimedSlot}
              canManage
              showGender={showGender}
            />
          ))
        )}
      </div>

      <SectionHeader title={hasMatches ? 'Regenerate schedule' : 'Build the schedule'} />
      {playerCount === 0 ? (
        <div
          className="mb-4 rounded-2xl bg-white p-4 text-center text-sm text-ink-3"
          style={{ border: '1px dashed var(--line)' }}
        >
          Add players above before generating matches.
        </div>
      ) : isFixed ? (
        <ManualTeamsPanel
          tournamentId={tournamentId}
          roster={rosterForGeneration}
          hasMatches={hasMatches}
        />
      ) : (
        <GenerateMatchesPanel
          tournamentId={tournamentId}
          format={tournamentFormat}
          rosterCount={rosterForGeneration.length}
          hasMatches={hasMatches}
        />
      )}

      <SectionHeader title="Danger zone" />
      <div className="grid gap-3">
        <ConfirmForm
          action={resetTournamentMatches}
          confirm={`Reset all ${matchCount} match${matchCount === 1 ? '' : 'es'}? Pending and completed matches will be wiped. The roster stays. This cannot be undone.`}
        >
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <SubmitButton
            overlay
            disabled={matchCount === 0}
            className="w-full rounded-2xl bg-white p-4 text-left disabled:opacity-50"
            style={{ border: '1px solid var(--line)' }}
          >
            <div className="text-sm font-semibold text-ink">Reset matches</div>
            <div className="mt-1 text-xs text-ink-3">
              Wipes all {matchCount} match{matchCount === 1 ? '' : 'es'} (pending and completed) and
              returns the tournament to draft. The roster stays.
            </div>
          </SubmitButton>
        </ConfirmForm>
        {isOwner && (
          <ConfirmForm
            action={deleteTournament}
            confirm={`Delete "${tournamentName}"? This permanently removes the tournament, roster, matches, and scores. This cannot be undone.`}
          >
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <SubmitButton
              overlay
              className="w-full rounded-2xl p-4 text-left"
              style={{ border: '1px solid var(--berry)', color: 'var(--berry)', background: '#fff' }}
            >
              <div className="text-sm font-semibold">Delete tournament</div>
              <div className="mt-1 text-xs" style={{ color: 'var(--berry)' }}>
                Permanently removes the tournament, roster, matches, and scores. This cannot be undone.
              </div>
            </SubmitButton>
          </ConfirmForm>
        )}
      </div>
    </div>
  );
}

function StandingsTab({ matches }: { matches: MatchRow[] }) {
  const completedRR = matches.filter(
    (row) =>
      row.completed_at &&
      row.winner_side !== null &&
      !(ALL_PLAYOFF_LABELS as readonly string[]).includes(row.round_label ?? ''),
  );

  if (completedRR.length === 0) {
    return (
      <div className="px-[18px] pt-6 pb-24">
        <div
          className="rounded-2xl bg-white p-5 text-center"
          style={{ border: '1px dashed var(--line)' }}
        >
          <div className="text-[15px] font-semibold text-ink">No standings yet</div>
          <div className="mt-1 text-xs text-ink-3">
            Play and score at least one round-robin match to populate the leaderboard.
          </div>
        </div>
      </div>
    );
  }

  const standingsMatches: StandingsMatch[] = completedRR.map((row) => {
    const games = row.match_games ?? [];
    const games_won_a = games.filter((g) => g.team_a_score > g.team_b_score).length;
    const games_won_b = games.filter((g) => g.team_b_score > g.team_a_score).length;
    return {
      id: row.id,
      team_a_label: row.team_a_label,
      team_b_label: row.team_b_label,
      winner_side: row.winner_side,
      team_a_score: row.team_a_score,
      team_b_score: row.team_b_score,
      games_won_a,
      games_won_b,
    };
  });

  const usePlayerStandings = isRotatingPartnersData(standingsMatches);
  const rows = usePlayerStandings
    ? computePlayerStandings(standingsMatches)
    : computeStandings(standingsMatches);
  const leader = rows[0];

  return (
    <div className="py-3.5 pb-24">
      {leader && (
        <div className="px-[18px] pb-[18px]">
          <div
            className="relative overflow-hidden rounded-[22px] p-4"
            style={{ background: 'linear-gradient(135deg, var(--court), oklch(0.85 0.15 145))' }}
          >
            <div className="flex items-center gap-3.5">
              <div className="relative">
                <Avatar player={playerFromName(leader.team)} size={64} ring />
                <div
                  className="absolute -bottom-1 -right-1 flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-bold"
                  style={{ background: 'var(--ink)', color: 'var(--court)', border: '2px solid var(--court)' }}
                >
                  1
                </div>
              </div>
              <div className="flex-1">
                <div className="text-[11px] tracking-[0.06em]" style={{ color: 'oklch(0.25 0.04 140)' }}>
                  LEADER
                </div>
                <div className="serif mt-0.5 text-[22px] leading-[1.1] text-ink">{leader.team}</div>
                <div className="mt-1.5 flex gap-3 text-[11px]" style={{ color: 'oklch(0.3 0.05 140)' }}>
                  <span className="flex items-center gap-1">
                    {leader.matchWins}-{leader.matchLosses} record
                  </span>
                  <span>
                    {leader.pointDiff >= 0 ? '+' : ''}
                    {leader.pointDiff} pt diff
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 px-[18px] pb-2">
        <Chip tone="dark">{usePlayerStandings ? 'PLAYERS' : 'TEAMS'}</Chip>
      </div>

      <div className="px-[18px]">
        <div
          className="grid items-center px-1 pb-2 pt-2.5 text-[10px] uppercase tracking-[0.08em] text-ink-3"
          style={{ gridTemplateColumns: '24px 1fr 50px 50px 50px', borderBottom: '1px solid var(--line)' }}
        >
          <div>#</div>
          <div>{usePlayerStandings ? 'PLAYER' : 'TEAM'}</div>
          <div className="text-right">W–L</div>
          <div className="text-right">PD</div>
          <div className="text-right">WIN%</div>
        </div>
        {rows.map((row, i) => (
          <StandingsRow key={row.team} index={i} row={row} />
        ))}
      </div>

      <div className="px-[18px] pt-3.5 text-[11px] leading-[1.5] text-ink-3">
        Sorted by match wins → head-to-head → point differential → games won.
      </div>
    </div>
  );
}

function StandingsRow({ index, row }: { index: number; row: StandingRow }) {
  const winPct = Math.round(row.winPct * 100);
  return (
    <div
      className="grid items-center px-1 py-2.5"
      style={{ gridTemplateColumns: '24px 1fr 50px 50px 50px', borderBottom: '1px solid var(--line)' }}
    >
      <div className="text-[13px] font-semibold text-ink-3">{index + 1}</div>
      <div className="flex items-center gap-2.5">
        <Avatar player={playerFromName(row.team)} size={32} />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-ink">{row.team}</div>
          <div className="text-[10.5px] text-ink-3">{row.matchesPlayed} match{row.matchesPlayed === 1 ? '' : 'es'}</div>
        </div>
      </div>
      <div className="mono text-right text-[13px] font-semibold text-ink">
        {row.matchWins}–{row.matchLosses}
      </div>
      <div
        className="mono text-right text-[13px] font-semibold"
        style={{
          color:
            row.pointDiff > 0 ? 'var(--court-deep)' : row.pointDiff < 0 ? 'var(--berry)' : 'var(--ink-3)',
        }}
      >
        {row.pointDiff > 0 ? '+' : ''}
        {row.pointDiff}
      </div>
      <div className="mono text-right text-[13px] text-ink-2">{winPct}%</div>
    </div>
  );
}

function BracketTab({
  tournamentId,
  playoffMatches,
  canGenerate,
  rrPending,
  hasRoundRobin,
  rrMatches,
  roster,
  genderMode,
  isManager,
}: {
  tournamentId: string;
  playoffMatches: MatchRow[];
  canGenerate: boolean;
  rrPending: number;
  hasRoundRobin: boolean;
  rrMatches: MatchRow[];
  roster: { id: string; display_name: string; gender: 'm' | 'f' | 'x' | null }[];
  genderMode: 'open' | 'mixed' | 'same';
  isManager: boolean;
}) {
  // Compute player rank from completed RR matches so the organizer builder
  // can show "M1 / F2" labels and pre-fill its Auto-pair button with a
  // standings-aware default.
  const rankedRoster: Array<{ id: string; name: string; gender: 'm' | 'f' | 'x' | null; rank: number | null }> = (() => {
    const completedRR = rrMatches
      .filter((row) => row.completed_at && row.winner_side !== null)
      .map((row) => {
        const games = row.match_games ?? [];
        return {
          id: row.id,
          team_a_label: row.team_a_label,
          team_b_label: row.team_b_label,
          winner_side: row.winner_side,
          team_a_score: row.team_a_score,
          team_b_score: row.team_b_score,
          games_won_a: games.filter((g) => g.team_a_score > g.team_b_score).length,
          games_won_b: games.filter((g) => g.team_b_score > g.team_a_score).length,
        };
      });
    const standings = completedRR.length > 0 ? computePlayerStandings(completedRR) : [];
    const rankByName = new Map(standings.map((s, i) => [s.team, i + 1]));
    // Sort roster by rank when known, else by name. Ungendered tournaments
    // also use this ordering for the single combined list.
    const annotated = roster.map((p) => ({
      id: p.id,
      name: p.display_name,
      gender: p.gender,
      rank: rankByName.get(p.display_name) ?? null,
    }));
    annotated.sort((a, b) => {
      if (a.rank == null && b.rank == null) return a.name.localeCompare(b.name);
      if (a.rank == null) return 1;
      if (b.rank == null) return -1;
      return a.rank - b.rank;
    });
    return annotated;
  })();
  // Mixed RR is the case the auto-seeder can't reason about (M+M vs F+F
  // semis being the bug). Surface the manual builder there. Same-gender +
  // open RR can also use it but auto-seed stays the headline path.
  const showManualBuilder = isManager && canGenerate && genderMode === 'mixed';
  // Empty state — round robin still in progress, or no schedule yet.
  if (playoffMatches.length === 0) {
    return (
      <div className="py-[18px] pb-24">
        <div className="px-[18px] pb-3.5">
          <div className="serif text-[22px] text-ink">Playoffs</div>
          <div className="mt-0.5 text-xs text-ink-3">
            Top 4 seeds advance after round robin.
          </div>
        </div>

        <div className="px-[18px]">
          {!hasRoundRobin ? (
            <div
              className="rounded-2xl bg-white p-5 text-center text-sm text-ink-3"
              style={{ border: '1px dashed var(--line)' }}
            >
              Generate your round-robin matches first — the bracket gets seeded
              from the standings once everyone has played.
            </div>
          ) : !canGenerate ? (
            <div
              className="rounded-2xl bg-white p-5 text-center"
              style={{ border: '1px dashed var(--line)' }}
            >
              <div className="text-[15px] font-semibold text-ink">
                Round robin in progress
              </div>
              <div className="mt-1 text-xs text-ink-3">
                {rrPending} match{rrPending === 1 ? '' : 'es'} still pending. Once
                they&rsquo;re all scored, you can seed the bracket.
              </div>
              <Link
                href={`/tournaments/${tournamentId}?tab=matches`}
                className="mt-3 inline-flex items-center gap-1 rounded-full px-4 py-2 text-[13px] font-semibold"
                style={{ background: 'var(--ink)', color: 'var(--paper)' }}
              >
                Score pending matches {Icons.arrow}
              </Link>
            </div>
          ) : showManualBuilder ? (
            // Mixed RR with RR done + manager: offer both seed paths but
            // default to the simple auto-button. The manual builder is
            // tucked behind a toggle so the bracket page stays clean for
            // organizers who just want to hit Generate.
            <BracketSeedingChoice
              tournamentId={tournamentId}
              players={rankedRoster}
              genderMode={genderMode}
            />
          ) : (
            <GeneratePlayoffsForm tournamentId={tournamentId} />
          )}

          {/* Sample preview (faded) so the layout is visible on cold pools. */}
          <div className="mt-6 opacity-40">
            <div
              className="mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em]"
              style={{ background: 'var(--paper-2)', color: 'var(--ink-3)' }}
            >
              Sample · won&rsquo;t be created
            </div>
            <BracketRound
              title="Preview"
              matches={[
                {
                  seed1: '1',
                  p1: SAMPLE_PLAYERS[0],
                  team1Label: SAMPLE_PLAYERS[0].name,
                  seed2: '4',
                  p2: SAMPLE_PLAYERS[3],
                  team2Label: SAMPLE_PLAYERS[3].name,
                },
                {
                  seed1: '2',
                  p1: SAMPLE_PLAYERS[1],
                  team1Label: SAMPLE_PLAYERS[1].name,
                  seed2: '3',
                  p2: SAMPLE_PLAYERS[2],
                  team2Label: SAMPLE_PLAYERS[2].name,
                },
              ]}
            />
            <BracketConnector />
            <BracketRound
              title="Final"
              matches={[
                {
                  seed1: '?',
                  p1: null,
                  team1Label: 'TBD',
                  seed2: '?',
                  p2: null,
                  team2Label: 'TBD',
                  isFinal: true,
                },
              ]}
            />
          </div>
        </div>
      </div>
    );
  }

  const semi1 = playoffMatches.find((m) => m.round_label === PLAYOFF_ROUND_LABELS.semi1);
  const semi2 = playoffMatches.find((m) => m.round_label === PLAYOFF_ROUND_LABELS.semi2);
  const final = playoffMatches.find((m) => m.round_label === PLAYOFF_ROUND_LABELS.final);
  const bronze = playoffMatches.find((m) => m.round_label === PLAYOFF_ROUND_LABELS.bronze);

  return (
    <div className="py-[18px] pb-24">
      <div className="px-[18px] pb-3.5">
        <div className="serif text-[22px] text-ink">Playoffs</div>
        <div className="mt-0.5 text-xs text-ink-3">
          Tap a match to score it. Final &amp; 3rd-place fill in as the semis finish.
        </div>
      </div>

      <div className="px-[18px]">
        <BracketRound
          title="Semifinals"
          matches={[
            bracketMatchFromRow(tournamentId, semi1, '1'),
            bracketMatchFromRow(tournamentId, semi2, '2'),
          ]}
        />
        <BracketConnector />
        <BracketRound
          title="Final"
          matches={[bracketMatchFromRow(tournamentId, final, '🏆', { gold: true })]}
        />
        {bronze && (
          <BracketRound
            title="3rd place"
            matches={[bracketMatchFromRow(tournamentId, bronze, '🥉')]}
          />
        )}
      </div>
    </div>
  );
}

function BracketConnector() {
  return (
    <div className="relative h-2">
      <svg
        className="absolute -top-1 h-10 w-full"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
      >
        <path d="M20 0 V20 H80 V40" stroke="var(--line)" strokeWidth="1" fill="none" strokeDasharray="2 3" />
      </svg>
    </div>
  );
}

const SEMI_PLACEHOLDER_VALUES = new Set<string>([
  ...Object.values(SEMI_WINNER_PLACEHOLDERS),
  ...Object.values(SEMI_LOSER_PLACEHOLDERS),
]);

import type { AvatarPlayer } from '@/components/ui/Avatar';

type BracketMatch = {
  href?: string;
  seed1: string;
  p1: AvatarPlayer | null;
  team1Label: string;
  score1?: number | null;
  winner1?: boolean;
  seed2: string;
  p2: AvatarPlayer | null;
  team2Label: string;
  score2?: number | null;
  winner2?: boolean;
  isFinal?: boolean;
};

function bracketMatchFromRow(
  tournamentId: string,
  row: MatchRow | undefined,
  seedBadge: string,
  opts: { gold?: boolean } = {},
): BracketMatch {
  if (!row) {
    return {
      seed1: seedBadge,
      p1: null,
      team1Label: 'TBD',
      seed2: seedBadge,
      p2: null,
      team2Label: 'TBD',
      isFinal: !!opts.gold,
    };
  }

  const isPending =
    SEMI_PLACEHOLDER_VALUES.has(row.team_a_label) || SEMI_PLACEHOLDER_VALUES.has(row.team_b_label);
  const isDone = !!row.completed_at;
  const aWins = isDone && (row.team_a_score ?? 0) > (row.team_b_score ?? 0);
  const bWins = isDone && (row.team_b_score ?? 0) > (row.team_a_score ?? 0);

  return {
    href: !isPending ? `/tournaments/${tournamentId}/match/${row.id}` : undefined,
    seed1: seedBadge,
    p1: SEMI_PLACEHOLDER_VALUES.has(row.team_a_label) ? null : firstAvatar(row.team_a_label),
    team1Label: row.team_a_label,
    score1: row.team_a_score,
    winner1: aWins,
    seed2: seedBadge,
    p2: SEMI_PLACEHOLDER_VALUES.has(row.team_b_label) ? null : firstAvatar(row.team_b_label),
    team2Label: row.team_b_label,
    score2: row.team_b_score,
    winner2: bWins,
    isFinal: !!opts.gold,
  };
}

function firstAvatar(label: string) {
  const first = label.split(/\s*&\s*|\s*\/\s*/)[0]?.trim();
  if (!first) return null;
  return playerFromName(first);
}

function BracketRound({ title, matches }: { title: string; matches: BracketMatch[] }) {
  return (
    <div className="mb-3.5">
      <div className="mb-2 text-[11px] tracking-[0.08em] text-ink-3">{title.toUpperCase()}</div>
      <div className="grid gap-2">
        {matches.map((m, i) => {
          const card = (
            <div
              className="relative overflow-hidden rounded-2xl p-3"
              style={{
                background: m.isFinal ? 'var(--ink)' : '#fff',
                color: m.isFinal ? 'var(--paper)' : 'var(--ink)',
                border: `1px solid ${m.isFinal ? 'var(--ink)' : 'var(--line)'}`,
              }}
            >
              {m.isFinal && (
                <div className="absolute right-3 top-2" style={{ color: 'var(--court)' }}>
                  {Icons.trophy}
                </div>
              )}
              <BracketLine
                seed={m.seed1}
                p={m.p1}
                label={m.team1Label}
                score={m.score1}
                winner={m.winner1}
                dim={m.isFinal}
              />
              <div
                className="my-1.5 h-px"
                style={{ background: m.isFinal ? 'oklch(0.28 0.02 100)' : 'var(--line)' }}
              />
              <BracketLine
                seed={m.seed2}
                p={m.p2}
                label={m.team2Label}
                score={m.score2}
                winner={m.winner2}
                dim={m.isFinal}
              />
            </div>
          );
          return m.href ? (
            <Link key={i} href={m.href} className="block">
              {card}
            </Link>
          ) : (
            <div key={i}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}

function BracketLine({
  seed,
  p,
  label,
  score,
  winner,
  dim,
}: {
  seed: string;
  p: AvatarPlayer | null;
  label: string;
  score?: number | null;
  winner?: boolean;
  dim?: boolean;
}) {
  const isTBD = label === 'TBD' || label === '' || !label;
  return (
    <div className="flex items-center gap-2.5 px-0.5 py-1">
      <div
        className="mono w-3.5 text-[11px]"
        style={{ color: dim ? 'oklch(0.6 0.02 100)' : 'var(--ink-3)' }}
      >
        {seed}
      </div>
      {p ? (
        <Avatar player={p} size={24} />
      ) : (
        <div
          className="h-6 w-6 rounded-full"
          style={{ background: dim ? 'oklch(0.28 0.02 100)' : 'var(--paper-2)' }}
        />
      )}
      <div
        className="flex-1 truncate text-[13px] font-semibold"
        style={{
          color: isTBD
            ? dim
              ? 'oklch(0.6 0.02 100)'
              : 'var(--ink-3)'
            : winner
              ? dim
                ? 'var(--court)'
                : 'var(--court-deep)'
              : 'inherit',
        }}
      >
        {isTBD ? 'TBD' : label}
      </div>
      {score != null && (
        <div
          className="mono text-[14px] font-bold"
          style={{ color: winner ? (dim ? 'var(--court)' : 'var(--court-deep)') : 'inherit' }}
        >
          {score}
        </div>
      )}
    </div>
  );
}
