'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { addInvitePlayer, searchInvitees, type InviteeMatch } from './actions';
import { buildSmsUrl, formatE164, normalizeE164 } from '@/lib/phone';
import { ContactPickerButton } from '@/components/ui/ContactPickerButton';

type Props = {
  tournamentId: string;
  tournamentName: string;
  inviteCode: string;
  // Profile IDs already on the roster — typeahead suggestions matching one
  // of these are dropped so an organizer can't pick the same registered
  // user twice (the DB unique index would reject it anyway, but the UX
  // should never offer the option).
  existingProfileIds?: string[];
};

// Add Player form with two new affordances:
//   1. As the manager types a name OR phone, we hit the search RPC and show
//      up to 5 registered profiles. Selecting one prefills the row and
//      stamps the new tournament_player with that profile's phone, so
//      app_add_tournament_player auto-links the row to their profile.
//   2. If the manager picks a phone for someone who isn't registered, an
//      "Invite via SMS" button generates a deep-link to the device's
//      messaging app with a prefilled invite body. We still create the
//      tournament_player row with the phone so a future signup using the
//      same number auto-links.

export function AddPlayerForm({ tournamentId, tournamentName, inviteCode, existingProfileIds }: Props) {
  const excluded = new Set(existingProfileIds ?? []);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dupr, setDupr] = useState('');
  const [matches, setMatches] = useState<InviteeMatch[]>([]);
  const [searching, startSearching] = useTransition();
  const [submitting, startSubmitting] = useTransition();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pickedRegistered, setPickedRegistered] = useState<InviteeMatch | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Debounced search whenever name or phone changes.
  useEffect(() => {
    const phoneClean = normalizeE164(phone);
    const query = phoneClean ?? name.trim();
    if (query.length < 2) {
      setMatches([]);
      return;
    }
    if (pickedRegistered) {
      // The user just picked someone; don't keep showing the dropdown.
      return;
    }
    const t = setTimeout(() => {
      startSearching(async () => {
        const result = await searchInvitees(query);
        setMatches(result);
      });
    }, 220);
    return () => clearTimeout(t);
  }, [name, phone, pickedRegistered]);

  const onPick = (m: InviteeMatch) => {
    setName(m.display_name ?? '');
    setPhone(m.phone ?? '');
    if (m.dupr != null) setDupr(String(m.dupr));
    setPickedRegistered(m);
    setOpen(false);
  };

  const onClear = () => {
    setPickedRegistered(null);
    setMatches([]);
    setDupr('');
  };

  const phoneClean = normalizeE164(phone);
  const isUnregisteredWithPhone = !pickedRegistered && !!phoneClean && name.trim().length >= 2;
  // Drop suggestions that are already on the roster so the organizer can't
  // pick the same registered user twice.
  const visibleMatches = matches.filter((m) => !excluded.has(m.user_id));

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (phoneClean) fd.set('phone', phoneClean);
    else fd.delete('phone');
    const dupr_clean = dupr.trim();
    if (dupr_clean) fd.set('dupr', dupr_clean);
    else fd.delete('dupr');
    if (pickedRegistered) fd.set('user_id', pickedRegistered.user_id);
    else fd.delete('user_id');
    startSubmitting(async () => {
      await addInvitePlayer(fd);
      setName('');
      setPhone('');
      setDupr('');
      setPickedRegistered(null);
      setMatches([]);
    });
  };

  return (
    <form onSubmit={onSubmit} className="mb-3 grid gap-2">
      <input type="hidden" name="tournament_id" value={tournamentId} />

      <div ref={containerRef} className="relative">
        <input
          name="display_name"
          value={name}
          onChange={(e) => {
            // Keep the pick attached when the user just tweaks the name —
            // the explicit Unlink button on the linked pill is the way to
            // detach. Clearing on every keystroke meant a single typo
            // turned a registered profile back into an anonymous row and
            // submitted as PENDING.
            setName(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setOpen(false);
              phoneRef.current?.focus();
            }
          }}
          required
          placeholder="Player name"
          maxLength={120}
          autoComplete="off"
          className="w-full rounded-xl bg-white px-3.5 py-3 text-sm text-ink outline-none"
          style={{ border: '1px solid var(--line)' }}
        />
        {open && visibleMatches.length > 0 && !pickedRegistered && (
          <div
            className="absolute left-0 right-0 top-12 z-10 overflow-hidden rounded-xl bg-white shadow-md"
            style={{ border: '1px solid var(--line)' }}
          >
            <div
              className="px-3 py-1.5 text-[10px] uppercase tracking-[0.06em] text-ink-3"
              style={{ borderBottom: '1px solid var(--line)' }}
            >
              {searching ? 'Searching…' : 'Registered players'}
            </div>
            {visibleMatches.map((m) => (
              <button
                key={m.user_id}
                type="button"
                onClick={() => onPick(m)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-paper-2"
              >
                <div>
                  <div className="text-[13px] font-semibold text-ink">{m.display_name}</div>
                  {m.phone && (
                    <div className="mono text-[11px] text-ink-3">{formatE164(m.phone)}</div>
                  )}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-3">
                  Pick
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          name="email"
          type="email"
          autoComplete="off"
          placeholder="Email (optional)"
          className="flex-1 rounded-xl bg-white px-3.5 py-3 text-sm text-ink outline-none"
          style={{ border: '1px solid var(--line)' }}
        />
        <input
          ref={phoneRef}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="+1 555 123 4567"
          value={phone}
          onChange={(e) => {
            // Don't drop the pick when adding/correcting a phone — it's a
            // common reason to edit (the registered profile didn't have
            // one yet). Use the Unlink button on the linked pill if the
            // manager is genuinely picking someone different.
            setPhone(e.target.value);
            setOpen(true);
          }}
          className="flex-1 rounded-xl bg-white px-3.5 py-3 text-sm text-ink outline-none"
          style={{ border: '1px solid var(--line)' }}
        />
        <ContactPickerButton
          label="Contacts"
          className="rounded-xl px-3 py-3 text-[12px] font-semibold"
          onPick={({ name: pickedName, phone: pickedPhone }) => {
            if (pickedName) setName(pickedName);
            if (pickedPhone) setPhone(pickedPhone);
            setPickedRegistered(null);
          }}
        />
      </div>
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
          placeholder="3.20 default"
          className="mono w-24 rounded-xl bg-white px-3 py-2 text-sm text-ink outline-none"
          style={{ border: '1px solid var(--line)' }}
        />
        <span className="text-[11px] text-ink-3">
          Empty = pick from profile, fall back to 3.20
        </span>
      </div>

      {pickedRegistered && (
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]"
          style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}
        >
          <span>
            Linking to <strong>{pickedRegistered.display_name}</strong>
            {pickedRegistered.phone ? ` · ${formatE164(pickedRegistered.phone)}` : ''}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="ml-auto text-[11px] font-semibold underline"
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
        >
          {submitting ? 'Adding…' : 'Add player'}
        </button>
        {isUnregisteredWithPhone && phoneClean && (
          <a
            href={buildSmsUrl(
              phoneClean,
              `Hey ${name.trim()} — you're in the ${tournamentName} pickleball tournament. Track your matches here: ${typeof window !== 'undefined' ? window.location.origin : ''}/t/${inviteCode}`,
            )}
            className="flex items-center justify-center rounded-xl px-3 py-2.5 text-sm font-semibold text-white"
            style={{ background: '#25D366' }}
            aria-label="Send SMS invite"
          >
            Text invite
          </a>
        )}
      </div>
    </form>
  );
}
