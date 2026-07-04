'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { joinMixerAsAnonymous } from '@/app/t/[code]/actions';

// cold-join.html step 3 — the 15-second quick profile. Captures a name and a
// rough skill band before the first vote, then binds an anonymous session and
// persists both onto it (see joinMixerAsAnonymous). No password, no email; the
// account is deferred until after the first game. The blind-vote guardrail is
// untouched — this screen never surfaces anyone's picks.

const SKILLS: { value: string; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'mid', label: '3.0–3.5' },
  { value: 'high', label: '4.0+' },
];

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="mt-1 w-full rounded-2xl px-5 py-[16px] text-center text-base font-semibold tracking-tight disabled:opacity-60"
      style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}
    >
      {pending ? 'Joining…' : 'Enter the mixer'}
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
  const [skill, setSkill] = useState('mid');
  const trimmed = displayName.trim();

  return (
    <form action={joinMixerAsAnonymous} className="grid gap-3 text-left">
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="code" value={inviteCode ?? ''} />
      <input type="hidden" name="skill_level" value={skill} />

      <div>
        <div className="serif text-[23px] leading-none text-ink">Just a name &amp; level.</div>
        <p className="mt-1.5 text-[12.5px] leading-[1.45] text-ink-3">
          So teammates know who they&apos;ve got. You can add a photo and secure the account later.
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">
          Your name
        </span>
        <input
          name="display_name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          autoComplete="off"
          maxLength={60}
          placeholder="e.g. Sam Rivera"
          className="w-full rounded-xl bg-white px-4 py-3 text-[15px] font-semibold text-ink outline-none"
          style={{ borderWidth: 1.5, borderStyle: 'solid', borderColor: trimmed ? 'color-mix(in oklch, var(--court) 50%, transparent)' : 'var(--line)' }}
          required
        />
      </label>

      <div>
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">
          Roughly your level
        </span>
        <div className="flex gap-2">
          {SKILLS.map((s) => {
            const on = skill === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setSkill(s.value)}
                aria-pressed={on}
                className="flex-1 rounded-xl py-2.5 text-[12.5px] font-semibold"
                style={{
                  borderWidth: 1.5,
                  borderStyle: 'solid',
                  borderColor: on ? 'var(--court)' : 'var(--line)',
                  background: on ? 'color-mix(in oklch, var(--court) 12%, transparent)' : 'white',
                  color: on ? 'var(--court-deep)' : 'var(--ink-2)',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <SubmitButton disabled={trimmed.length === 0} />
      <p className="text-center text-[11px] text-ink-3">
        No account, no email. Play first — secure your spot after your first game.
      </p>
    </form>
  );
}
