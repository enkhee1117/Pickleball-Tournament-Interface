'use client';

import { useState, useTransition } from 'react';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { Icons } from '@/components/ui/icons';
import { claimInvitePlayer, removeInvitePlayer, updateInvitePlayer } from './actions';
import { buildSmsUrl, formatE164, normalizeE164 } from '@/lib/phone';
import { ConfirmForm } from '@/components/ui/ConfirmForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { ContactPickerButton } from '@/components/ui/ContactPickerButton';

type Gender = 'm' | 'f' | 'x' | null;

type Props = {
  tournamentId: string;
  tournamentName?: string;
  inviteCode?: string;
  player: {
    id: string;
    display_name: string;
    email: string | null;
    profile_id: string | null;
    gender?: Gender;
    phone?: string | null;
    dupr?: number | null;
  };
  // The signed-in user's user_id, when they're a member of this tournament
  // and haven't claimed a slot yet. Drives the "This is me" affordance.
  currentUserId?: string | null;
  userHasClaimedSlot?: boolean;
  // True when the current user can edit/remove this row (owner + organizer
  // roles). The "This is me" claim button stays available to any member.
  canManage?: boolean;
  // When true, surface the gender picker in the edit panel; on for
  // tournaments with gender_mode = 'mixed' or 'same'.
  showGender?: boolean;
};

export function RosterRow({
  tournamentId,
  tournamentName,
  inviteCode,
  player,
  currentUserId = null,
  userHasClaimedSlot = false,
  canManage = false,
  showGender = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.display_name);
  const [email, setEmail] = useState(player.email ?? '');
  const [phone, setPhone] = useState(player.phone ?? '');
  const [gender, setGender] = useState<Gender>(player.gender ?? null);
  const [dupr, setDupr] = useState(player.dupr != null ? String(player.dupr) : '');
  // Inline phone-prompt for the SMS icon when we don't yet have a number.
  const [smsPromptOpen, setSmsPromptOpen] = useState(false);
  const [smsPromptPhone, setSmsPromptPhone] = useState('');
  const [smsPromptError, setSmsPromptError] = useState<string | null>(null);
  const [savingPhone, startSavingPhone] = useTransition();

  const linked = !!player.profile_id;
  const isMe = !!currentUserId && player.profile_id === currentUserId;
  // We don't actually track "invite sent" state, so labelling a row INVITED
  // just because it has a phone number was misleading. Anything not yet
  // linked to a profile is PENDING — the subtext + the SMS button convey
  // whether we already have contact info to invite them with.
  const status = isMe ? 'YOU' : linked ? 'IN' : 'PENDING';
  const tone: 'court' | 'default' | 'ghost' = isMe || linked ? 'court' : 'ghost';

  const subtext = isMe
    ? 'Linked to your stats'
    : linked
      ? 'Signed up · results post to their history'
      : player.phone
        ? `${formatE164(player.phone)} · will link when they sign up`
        : player.email
          ? `${player.email} · will link when they sign up`
          : 'Placeholder · tap edit to add an email or phone';

  const phoneClean = normalizeE164(phone);
  const canTextInvite =
    canManage && !linked && !!phoneClean && !!tournamentName && !!inviteCode;

  // Origin is needed to build absolute /t/<code>/p/<id> links in the SMS
  // body. window may be undefined during SSR — guard so the component
  // doesn't explode if rendered server-side. The personal-invite URL
  // lands on a confirmation card that links the recipient's account to
  // this exact roster slot once they sign up.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const smsBody = (toName: string) =>
    `Hey ${toName} — you're in the ${tournamentName ?? ''} pickleball tournament. Tap to confirm your spot: ${origin}/t/${(inviteCode ?? '').toLowerCase()}/p/${player.id}`;

  // The inline SMS button next to the player name. With a phone, it just
  // opens the device's messaging app. Without one, it expands a small
  // phone-entry pill so the manager can fix that in one flow instead of
  // hunting through the edit panel.
  const showSmsButton = canManage && !linked && !!tournamentName && !!inviteCode;
  const onSmsButtonClick = () => {
    if (phoneClean) {
      window.open(buildSmsUrl(phoneClean, smsBody(player.display_name)), '_blank');
      return;
    }
    setSmsPromptError(null);
    setSmsPromptOpen((v) => !v);
  };

  const onPhonePromptSubmit = () => {
    const cleaned = normalizeE164(smsPromptPhone);
    if (!cleaned) {
      setSmsPromptError('Enter a phone in international format, e.g. +15551234567.');
      return;
    }
    startSavingPhone(async () => {
      const fd = new FormData();
      fd.set('tournament_id', tournamentId);
      fd.set('player_id', player.id);
      fd.set('display_name', player.display_name);
      fd.set('email', player.email ?? '');
      fd.set('phone', cleaned);
      fd.set('gender', player.gender ?? '');
      if (player.dupr != null) fd.set('dupr', String(player.dupr));
      try {
        await updateInvitePlayer(fd);
        setPhone(cleaned);
        setSmsPromptOpen(false);
        setSmsPromptPhone('');
        window.open(buildSmsUrl(cleaned, smsBody(player.display_name)), '_blank');
      } catch {
        setSmsPromptError('Could not save the phone — try again.');
      }
    });
  };

  const canClaim = !!currentUserId && !linked && !userHasClaimedSlot;

  return (
    <div
      className="rounded-[14px] bg-white px-3.5 py-2.5"
      style={{ border: `1px solid ${isMe ? 'var(--court-deep)' : 'var(--line)'}` }}
    >
      <div className="flex items-center gap-3">
        <Avatar player={playerFromName(player.display_name)} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-sm font-semibold text-ink">{player.display_name}</div>
            {player.dupr != null && (
              <span className="mono text-[10px] font-bold tracking-tight text-ink-3">
                {Number(player.dupr).toFixed(2)}
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-ink-3">{subtext}</div>
        </div>
        <Chip tone={tone}>{status}</Chip>
        {showSmsButton && (
          <button
            type="button"
            onClick={onSmsButtonClick}
            aria-label={phoneClean ? `Text invite to ${player.display_name}` : `Add phone and text invite ${player.display_name}`}
            title={phoneClean ? 'Text invite' : 'Add phone & text invite'}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ color: '#fff', background: '#25D366' }}
          >
            {Icons.message}
          </button>
        )}
        {canManage && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="ml-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
            style={{ color: 'var(--ink-2)', border: '1px solid var(--line)' }}
          >
            {editing ? 'Close' : 'Edit'}
          </button>
        )}
      </div>

      {smsPromptOpen && !phoneClean && (
        <div
          className="mt-2.5 grid gap-2 rounded-xl px-2.5 py-2"
          style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
        >
          <div className="text-[11px] text-ink-3">
            No phone on file for {player.display_name}. Add one to send the invite.
          </div>
          <div className="flex gap-2">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="off"
              autoFocus
              placeholder="+15551234567"
              value={smsPromptPhone}
              onChange={(e) => setSmsPromptPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onPhonePromptSubmit();
                }
              }}
              className="flex-1 rounded-lg bg-white px-3 py-2 text-sm text-ink outline-none"
              style={{ border: '1px solid var(--line)' }}
            />
            <ContactPickerButton
              label="Pick"
              className="rounded-lg px-3 py-2 text-[12px] font-semibold"
              onPick={({ name: contactName, phone: contactPhone }) => {
                if (contactPhone) setSmsPromptPhone(contactPhone);
                if (contactName && !player.display_name) {
                  // Don't overwrite an existing name silently — only
                  // back-fill when the row was anonymous.
                }
              }}
            />
          </div>
          {smsPromptError && (
            <div className="text-[11px]" style={{ color: 'var(--berry)' }}>
              {smsPromptError}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onPhonePromptSubmit}
              disabled={savingPhone || !smsPromptPhone.trim()}
              className="flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: '#25D366' }}
            >
              {savingPhone ? 'Saving…' : 'Save & text invite'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSmsPromptOpen(false);
                setSmsPromptPhone('');
                setSmsPromptError(null);
              }}
              className="rounded-lg px-3 py-2 text-[12px] font-semibold"
              style={{ color: 'var(--ink-2)', border: '1px solid var(--line)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {canClaim && (
        <form action={claimInvitePlayer} className="mt-2.5">
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <input type="hidden" name="player_id" value={player.id} />
          <SubmitButton
            pendingLabel="Linking…"
            className="w-full rounded-xl px-3 py-2 text-[12px] font-semibold"
            style={{ background: 'var(--paper-2)', color: 'var(--ink)' }}
          >
            This is me — link to my stats
          </SubmitButton>
        </form>
      )}

      {editing && canManage && (
        <div className="mt-3 grid gap-2 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
          <form action={updateInvitePlayer} className="grid gap-2">
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="player_id" value={player.id} />
            <input
              name="display_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="rounded-xl bg-white px-3 py-2.5 text-sm text-ink outline-none"
              style={{ border: '1px solid var(--line)' }}
              placeholder="Player name"
              maxLength={120}
            />
            <input
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="off"
              className="rounded-xl bg-white px-3 py-2.5 text-sm text-ink outline-none"
              style={{ border: '1px solid var(--line)' }}
              placeholder="Email (optional)"
            />
            <input
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              className="rounded-xl bg-white px-3 py-2.5 text-sm text-ink outline-none"
              style={{ border: '1px solid var(--line)' }}
              placeholder="Phone +15551234567"
            />
            <input type="hidden" name="gender" value={gender ?? ''} />
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.06em] text-ink-3">
                DUPR
              </span>
              <input
                name="dupr"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="2"
                max="8"
                value={dupr}
                onChange={(e) => setDupr(e.target.value)}
                placeholder="3.20"
                className="mono w-20 rounded-lg bg-white px-2 py-1.5 text-[13px] text-ink outline-none"
                style={{ border: '1px solid var(--line)' }}
              />
              <span className="text-[11px] text-ink-3">2.00 – 8.00</span>
            </div>
            {showGender && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.06em] text-ink-3">
                  Gender
                </span>
                <div className="flex flex-1 gap-1.5">
                  {([
                    ['m', 'M'],
                    ['f', 'F'],
                    ['x', 'X'],
                  ] as Array<['m' | 'f' | 'x', string]>).map(([value, label]) => {
                    const on = gender === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setGender(on ? null : value)}
                        className="flex-1 rounded-lg py-1.5 text-[12px] font-bold"
                        style={{
                          background: on ? 'var(--ink)' : '#fff',
                          color: on ? 'var(--paper)' : 'var(--ink-2)',
                          border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <SubmitButton
              pendingLabel="Saving…"
              className="rounded-xl px-3 py-2 text-[13px] font-semibold"
              style={{ background: 'var(--ink)', color: 'var(--paper)' }}
            >
              Save
            </SubmitButton>
          </form>
          {canTextInvite && phoneClean && tournamentName && inviteCode && (
            <a
              href={buildSmsUrl(phoneClean, smsBody(player.display_name))}
              className="block w-full rounded-xl px-3 py-2 text-center text-[13px] font-semibold text-white"
              style={{ background: '#25D366' }}
            >
              Text invite via SMS
            </a>
          )}
          <ConfirmForm
            action={removeInvitePlayer}
            confirm={`Remove ${player.display_name} from the roster?`}
          >
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="player_id" value={player.id} />
            <SubmitButton
              pendingLabel="Removing…"
              className="w-full rounded-xl px-3 py-2 text-[13px] font-semibold"
              style={{ color: 'var(--berry)', border: '1px solid var(--berry)', background: 'transparent' }}
            >
              Remove from roster
            </SubmitButton>
          </ConfirmForm>
        </div>
      )}
    </div>
  );
}
