'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { joinMixerWithQuickAccount } from '@/app/t/[code]/actions';
import { GENDER_OPTIONS, SKILL_LEVELS } from '@/lib/quick-join';

// cold-join.html step 3, revised — the 15-second profile now includes real
// credentials. Name, gender, level, email/phone + password: enough for a
// durable account without a verification wall. Email confirmation is
// deferred to the moment it matters (hosting an event). The blind-vote
// guardrail is untouched — this screen never surfaces anyone's picks.

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

const LABEL_CLS = 'mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3';

export function QuickJoinForm({
  tournamentId,
  inviteCode,
}: {
  tournamentId: string;
  inviteCode?: string;
}) {
  const [displayName, setDisplayName] = useState('');
  const [skill, setSkill] = useState('mid');
  const [gender, setGender] = useState<string>('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const nameOk = displayName.trim().length > 0;
  const ready = nameOk && identifier.trim().length > 2 && password.length >= 8;

  const segStyle = (on: boolean) => ({
    borderWidth: 1.5,
    borderStyle: 'solid' as const,
    borderColor: on ? 'var(--court)' : 'var(--line)',
    background: on ? 'color-mix(in oklch, var(--court) 12%, transparent)' : 'white',
    color: on ? 'var(--court-deep)' : 'var(--ink-2)',
  });

  return (
    <form action={joinMixerWithQuickAccount} className="grid gap-3 text-left">
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="code" value={inviteCode ?? ''} />
      <input type="hidden" name="skill_level" value={skill} />
      <input type="hidden" name="gender" value={gender} />

      <div>
        <div className="serif text-[23px] leading-none text-ink">A name, a level, a login.</div>
        <p className="mt-1.5 text-[12.5px] leading-[1.45] text-ink-3">
          15 seconds and you&apos;re voting. We&apos;ll only ask you to verify your email if you host
          your own event later.
        </p>
      </div>

      <label className="block">
        <span className={LABEL_CLS}>Your name</span>
        <input
          name="display_name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          autoComplete="name"
          maxLength={60}
          placeholder="e.g. Sam Rivera"
          className="w-full rounded-xl bg-paper-2 px-4 py-3 text-[15px] font-semibold text-ink outline-none"
          style={{ borderWidth: 1.5, borderStyle: 'solid', borderColor: nameOk ? 'color-mix(in oklch, var(--court) 50%, transparent)' : 'var(--line)' }}
          required
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className={LABEL_CLS}>Roughly your level</span>
          <div className="flex gap-1.5">
            {SKILL_LEVELS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSkill(s.value)}
                aria-pressed={skill === s.value}
                className="flex-1 rounded-xl py-2.5 text-[12px] font-semibold"
                style={segStyle(skill === s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={LABEL_CLS}>You are</span>
          <div className="flex gap-1.5">
            {GENDER_OPTIONS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGender(gender === g.value ? '' : g.value)}
                aria-pressed={gender === g.value}
                className="flex-1 rounded-xl py-2.5 text-[12px] font-semibold"
                style={segStyle(gender === g.value)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="block">
        <span className={LABEL_CLS}>Email or phone</span>
        <input
          name="identifier"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete="email"
          inputMode="email"
          placeholder="sam@example.com or +1 555 010 1234"
          className="w-full rounded-xl bg-paper-2 px-4 py-3 text-[15px] text-ink outline-none"
          style={{ borderWidth: 1.5, borderStyle: 'solid', borderColor: 'var(--line)' }}
          required
        />
      </label>

      <label className="block">
        <span className={LABEL_CLS}>Password</span>
        <input
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={8}
          placeholder="8+ characters"
          className="w-full rounded-xl bg-paper-2 px-4 py-3 text-[15px] text-ink outline-none"
          style={{ borderWidth: 1.5, borderStyle: 'solid', borderColor: 'var(--line)' }}
          required
        />
      </label>

      <SubmitButton disabled={!ready} />
      <p className="text-center text-[11px] text-ink-3">
        Already play here? Same form — your existing password signs you in and joins this event.
      </p>
    </form>
  );
}
