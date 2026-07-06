'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { signInWithPassword } from './actions';
import { emptyFormState } from '@/lib/forms';

const INPUT_WRAP = 'flex h-[50px] items-center gap-2.5 rounded-xl bg-white px-3.5 transition-colors';

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signInWithPassword, emptyFormState);
  const [show, setShow] = useState(false);
  const [shaking, setShaking] = useState(false);
  const err = !!state.error;

  // Re-trigger the shake on every failed submit (new state object each time)
  // without remounting the inputs.
  useEffect(() => {
    if (!state.error) return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 450);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <form action={formAction} className={`grid gap-3.5 ${shaking ? 'ttd-shake' : ''}`}>
      <style>{`@keyframes ttdShake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-4px)}40%,60%{transform:translateX(4px)}}.ttd-shake{animation:ttdShake .4s cubic-bezier(.36,.07,.19,.97)}`}</style>
      <input type="hidden" name="next" value={next} />

      <div>
        <label className="mb-1.5 block text-[13px] font-semibold text-ink-2">Email</label>
        <div className={INPUT_WRAP} style={{ border: '1.5px solid var(--line)' }}>
          <input
            name="phone"
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            autoFocus
            placeholder="you@club.com"
            className="flex-1 bg-transparent text-[15px] text-ink outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[13px] font-semibold text-ink-2">Password</label>
        <div className={INPUT_WRAP} style={{ border: `1.5px solid ${err ? 'var(--berry)' : 'var(--line)'}` }}>
          <input
            name="password"
            type={show ? 'text' : 'password'}
            required
            placeholder="••••••••"
            className="flex-1 bg-transparent text-[15px] text-ink outline-none"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="grid place-items-center text-ink-3 transition-colors hover:text-ink"
          >
            {show ? (
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            ) : (
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 4l16 16M9.5 9.6A2.6 2.6 0 0012 14.6M6.2 6.7C3.9 8.2 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.45 4.2-1.1M10 5.8c.65-.13 1.3-.2 2-.2 6 0 9.5 6.4 9.5 6.4a17 17 0 01-2.3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
        {err && (
          <div className="mt-2 flex items-center justify-between gap-2.5">
            <span className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--berry)' }} role="alert">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                <path d="M12 7v6M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {state.error}
            </span>
            <Link href="/forgot-password" className="shrink-0 text-[13px] font-semibold" style={{ color: 'var(--court-deep)' }}>
              Forgot password?
            </Link>
          </div>
        )}
      </div>

      <button type="submit" disabled={pending} className="btn btn-accent btn-lg mt-1 w-full justify-center disabled:opacity-70">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
