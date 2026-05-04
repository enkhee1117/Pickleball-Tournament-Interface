'use client';

import { useActionState } from 'react';
import { sendPasswordReset } from './actions';
import { emptyFormState } from '@/lib/forms';

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(sendPasswordReset, emptyFormState);

  return (
    <form action={formAction} className="mt-6 grid gap-2.5">
      <input
        name="email"
        type="email"
        required
        autoFocus
        placeholder="you@email.com"
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
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
}
