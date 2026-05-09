import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { TopBar } from '@/components/ui/TopBar';
import { Icons } from '@/components/ui/icons';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { formatInviteCode, isValidInviteCode, normalizeInviteCode } from '@/lib/invite-codes';
import { claimViaPersonalInvite } from './actions';

type PageProps = {
  params: Promise<{ code: string; playerId: string }>;
};

type PublicTournament = {
  tournament: { id: string; name: string; status: string; invite_code: string };
  players: { id: string; display_name: string; profile_id?: string | null }[];
};

// Personal invite landing. The SMS sent from the roster includes a link
// like /t/<code>/p/<player_id> so the recipient lands here. We confirm
// the slot with them before stamping their profile_id on the row — a
// forwarded link should never silently link the wrong person.
export default async function PersonalInvitePage({ params }: PageProps) {
  const { code: rawCode, playerId } = await params;
  const code = normalizeInviteCode(rawCode);

  if (!isValidInviteCode(code) || !playerId) {
    return <NotFound message="That invite link doesn't look right." />;
  }

  const supabase = await createClient();
  const [
    { data: payload, error },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase.rpc('app_get_public_tournament_by_code', { p_code: code }),
    supabase.auth.getUser(),
  ]);

  if (error || !payload) {
    return <NotFound message="We couldn't find that tournament." />;
  }

  const data = payload as PublicTournament;
  const t = data.tournament;
  const player = data.players.find((p) => p.id === playerId);
  if (!player) {
    return <NotFound message="The roster slot in your invite is no longer there." />;
  }

  const claimedByOther = !!player.profile_id && (!user || player.profile_id !== user.id);

  if (!user) {
    // Fresh invitee → signup is the preferred path. Existing users can flip
    // to login from the signup screen. Either way the next param brings
    // them right back here so we can confirm the claim.
    const next = `/t/${code.toLowerCase()}/p/${playerId}`;
    return (
      <PersonalInviteShell tournamentName={t.name} inviteCode={t.invite_code}>
        <Avatar player={playerFromName(player.display_name)} size={88} ring />
        <div className="serif mt-3 text-[28px] leading-[1.05] text-ink">
          You&rsquo;re invited as <span className="italic">{player.display_name}</span>
        </div>
        <div className="mt-1.5 text-[13px] text-ink-3">
          Sign up so we can lock in your slot in <strong>{t.name}</strong> and post your match scores to your history.
        </div>
        <div className="mt-5 grid w-full gap-2">
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="block w-full rounded-2xl px-5 py-[14px] text-center text-[15px] font-semibold tracking-tight"
            style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          >
            Create an account
          </Link>
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="block w-full rounded-2xl px-5 py-[14px] text-center text-[15px] font-semibold tracking-tight"
            style={{ background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
          >
            Already have an account
          </Link>
        </div>
      </PersonalInviteShell>
    );
  }

  if (player.profile_id === user.id) {
    // Already linked — just send them to the scoreboard.
    redirect(`/tournaments/${t.id}`);
  }

  if (claimedByOther) {
    return (
      <PersonalInviteShell tournamentName={t.name} inviteCode={t.invite_code}>
        <Avatar player={playerFromName(player.display_name)} size={88} ring />
        <div className="serif mt-3 text-[26px] leading-[1.05] text-ink">
          That slot is already linked
        </div>
        <div className="mt-1.5 text-[13px] text-ink-3">
          {player.display_name}&rsquo;s row in <strong>{t.name}</strong> is already claimed by another account. If that&rsquo;s a mistake, ask the organizer to unlink it and resend the invite.
        </div>
        <div className="mt-5 grid w-full gap-2">
          <Link
            href={`/t/${code.toLowerCase()}`}
            className="block w-full rounded-2xl px-5 py-[14px] text-center text-[15px] font-semibold tracking-tight"
            style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          >
            Open the scoreboard
          </Link>
        </div>
      </PersonalInviteShell>
    );
  }

  // Confirmation card — Yes claims, No drops them on the public scoreboard.
  return (
    <PersonalInviteShell tournamentName={t.name} inviteCode={t.invite_code}>
      <Avatar player={playerFromName(player.display_name)} size={88} ring />
      <div className="serif mt-3 text-[28px] leading-[1.05] text-ink">
        Are you <span className="italic">{player.display_name}</span>?
      </div>
      <div className="mt-1.5 text-[13px] text-ink-3">
        Confirming will link your account to this row in <strong>{t.name}</strong>. Your match scores post to your history.
      </div>
      <form action={claimViaPersonalInvite} className="mt-5 grid w-full gap-2">
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="player_id" value={playerId} />
        <SubmitButton
          pendingLabel="Linking…"
          className="w-full rounded-2xl px-5 py-[14px] text-center text-[15px] font-semibold tracking-tight"
          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
        >
          Yes, that&rsquo;s me
        </SubmitButton>
      </form>
      <Link
        href={`/t/${code.toLowerCase()}`}
        className="mt-2 block w-full rounded-2xl px-5 py-[14px] text-center text-[14px] font-semibold tracking-tight"
        style={{ background: '#fff', color: 'var(--ink-2)', border: '1px solid var(--line)' }}
      >
        Not me — open the scoreboard
      </Link>
    </PersonalInviteShell>
  );
}

function PersonalInviteShell({
  tournamentName,
  inviteCode,
  children,
}: {
  tournamentName: string;
  inviteCode: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <TopBar
        title="Personal invite"
        sub={`${tournamentName} · code ${formatInviteCode(inviteCode)}`}
      />
      <div className="flex-1 px-[18px] pt-2 pb-6">
        <div
          className="flex flex-col items-center rounded-2xl bg-white p-5 text-center"
          style={{ border: '1px solid var(--line)' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <TopBar title="Invite" />
      <div className="flex-1 px-[18px] pt-4">
        <div
          className="rounded-2xl bg-white p-5 text-center"
          style={{ border: '1px dashed var(--line)' }}
        >
          <div className="text-[15px] font-semibold text-ink">Invite link not found</div>
          <div className="mt-1 text-xs text-ink-3">{message}</div>
          <Link
            href="/"
            className="mt-3 inline-flex items-center gap-1 rounded-full px-4 py-2 text-[13px] font-semibold"
            style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}
          >
            Home {Icons.arrow}
          </Link>
        </div>
      </div>
    </div>
  );
}
