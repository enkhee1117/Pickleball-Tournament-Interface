'use client';

import { useActionState } from 'react';
import { signInWithPassword } from './actions';
import { emptyFormState } from '@/lib/forms';

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signInWithPassword, emptyFormState);

  return (
    <form action={formAction} className="mt-7 grid gap-2.5">
      <input type="hidden" name="next" value={next} />
      <input
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        autoFocus
        placeholder="+1 555 123 4567"
        className="rounded-2xl px-5 py-[18px] text-base outline-none"
        style={{
          background: 'oklch(0.24 0.02 100)',
          color: 'var(--paper)',
          border: '1.5px solid oklch(0.32 0.02 100)',
        }}
      />
      <input
        name="password"
        type="password"
        required
        placeholder="password"
        className="rounded-2xl px-5 py-[18px] text-base outline-none"
        style={{
          background: 'oklch(0.24 0.02 100)',
          color: 'var(--paper)',
          border: '1.5px solid oklch(0.32 0.02 100)',
        }}
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
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
