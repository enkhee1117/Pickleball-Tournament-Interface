'use client';

import { useActionState, useState } from 'react';
import { signUpWithPassword } from './actions';
import { emptyFormState } from '@/lib/forms';
import { GENDER_OPTIONS } from '@/lib/quick-join';

export function SignupForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signUpWithPassword, emptyFormState);
  const [gender, setGender] = useState('');

  const inputStyle = {
    background: 'oklch(0.24 0.02 100)',
    color: 'var(--paper)',
    border: '1.5px solid oklch(0.32 0.02 100)',
  } as const;

  return (
    <form action={formAction} className="mt-6 grid gap-2.5">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="gender" value={gender} />
      <input
        name="display_name"
        required
        autoFocus
        aria-label="Display name"
        placeholder="Display name"
        className="rounded-2xl px-5 py-[16px] text-base outline-none"
        style={inputStyle}
      />
      <input
        name="phone"
        type="email"
        inputMode="email"
        autoComplete="username"
        required
        aria-label="Email"
        placeholder="Email"
        className="rounded-2xl px-5 py-[16px] text-base outline-none"
        style={inputStyle}
      />
      {/* Gender feeds mixed / same-gender event pairing. Optional — "Skip"
          keeps the account gender-neutral. */}
      <div className="grid grid-cols-3 gap-1.5">
        {GENDER_OPTIONS.map((g) => {
          const on = gender === g.value;
          return (
            <button
              key={g.value}
              type="button"
              onClick={() => setGender(on ? '' : g.value)}
              aria-pressed={on}
              className="rounded-2xl py-3 text-[13px] font-semibold"
              style={{
                background: on ? 'color-mix(in oklch, var(--court) 22%, oklch(0.24 0.02 100))' : 'oklch(0.24 0.02 100)',
                color: on ? 'var(--court)' : 'oklch(0.75 0.015 100)',
                border: `1.5px solid ${on ? 'var(--court)' : 'oklch(0.32 0.02 100)'}`,
              }}
            >
              {g.label}
            </button>
          );
        })}
      </div>
      <input
        name="password"
        type="password"
        required
        aria-label="Password"
        placeholder="password (8+ chars)"
        className="rounded-2xl px-5 py-[16px] text-base outline-none"
        style={inputStyle}
      />
      {state.error && (
        <div
          role="alert"
          className="rounded-2xl px-3.5 py-2.5 text-sm"
          style={{ background: 'oklch(0.28 0.05 12)', color: 'oklch(0.85 0.1 12)' }}
        >
          {state.error}
        </div>
      )}
      {state.ok && (
        <div
          role="status"
          className="rounded-2xl px-3.5 py-2.5 text-sm"
          style={{ background: 'oklch(0.28 0.04 140)', color: 'var(--court)' }}
        >
          {state.ok}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-2xl px-5 py-[18px] text-base font-semibold tracking-tight transition active:scale-[0.97] disabled:opacity-70"
        style={{
          background: 'var(--court)',
          color: 'oklch(0.2 0.04 140)',
          boxShadow: '0 4px 14px oklch(0.2 0.05 100 / 0.12)',
        }}
      >
        {pending ? 'Creating…' : 'Create account'}
      </button>
    </form>
  );
}
