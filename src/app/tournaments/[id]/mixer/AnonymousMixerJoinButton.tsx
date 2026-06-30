'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { joinMixerAsAnonymous } from '@/app/t/[code]/actions';

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full rounded-2xl px-5 py-[18px] text-center text-base font-semibold tracking-tight disabled:opacity-60"
      style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}
    >
      {pending ? 'Joining…' : 'Join the Mixer'}
    </button>
  );
}

export function AnonymousMixerJoinButton({
  tournamentId,
  inviteCode,
}: {
  tournamentId: string;
  inviteCode?: string;
}) {
  const [displayName, setDisplayName] = useState('');
  const trimmed = displayName.trim();
  return (
    <form action={joinMixerAsAnonymous} className="grid gap-2">
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="code" value={inviteCode ?? ''} />
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
          Your name on the scoreboard
        </span>
        <input
          name="display_name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          autoComplete="off"
          maxLength={60}
          placeholder="e.g. Maya"
          className="w-full rounded-2xl border bg-white px-4 py-3 text-[15px] text-ink outline-none"
          style={{ borderColor: 'var(--line)' }}
          required
        />
      </label>
      <SubmitButton disabled={trimmed.length === 0} />
      <p className="px-1 text-center text-[11px] text-ink-3">
        No account, no email. We never process payment — your organizer collects entry on their side.
      </p>
    </form>
  );
}
