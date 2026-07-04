'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { TopBar } from '@/components/ui/TopBar';
import { IconBtn } from '@/components/ui/IconBtn';
import { BigButton } from '@/components/ui/BigButton';
import { Icons } from '@/components/ui/icons';
import {
  INVITE_CODE_LENGTH,
  isValidInviteCode,
  normalizeInviteCode,
} from '@/lib/invite-codes';
import { joinByInviteCode } from './actions';

type Props = {
  initialCode?: string;
};

const SLOTS = Array.from({ length: INVITE_CODE_LENGTH });

function digitsFromCode(raw: string): string[] {
  const normalized = normalizeInviteCode(raw);
  return SLOTS.map((_, i) => normalized[i] ?? '');
}

export function JoinForm({ initialCode = '' }: Props) {
  const router = useRouter();
  const [code, setCode] = useState<string[]>(() => digitsFromCode(initialCode));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const hasAutoSubmittedRef = useRef(false);

  const set = (i: number, v: string) => {
    if (!/^[a-z0-9]?$/i.test(v)) return;
    const next = [...code];
    next[i] = v.toUpperCase();
    setCode(next);
    if (v && i < INVITE_CODE_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const onBackspace = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    const next = digitsFromCode(pasted);
    if (next.join('').length === 0) return;
    e.preventDefault();
    setCode(next);
    const lastIdx = next.findLastIndex((c) => c.length > 0);
    refs.current[Math.min(INVITE_CODE_LENGTH - 1, Math.max(0, lastIdx))]?.focus();
  };

  const submit = () => {
    const candidate = normalizeInviteCode(code.join(''));
    if (!isValidInviteCode(candidate)) {
      setError('Enter all six characters from the share code.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await joinByInviteCode(candidate);
      if (result.error || !result.tournamentId) {
        setError(result.error ?? 'Could not join that tournament.');
        return;
      }
      router.push(`/tournaments/${result.tournamentId}`);
    });
  };

  // Auto-submit when the page is opened with a valid ?code= prefilled.
  useEffect(() => {
    if (hasAutoSubmittedRef.current) return;
    const candidate = normalizeInviteCode(code.join(''));
    if (isValidInviteCode(candidate) && initialCode) {
      hasAutoSubmittedRef.current = true;
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filled = code.join('').length === INVITE_CODE_LENGTH;

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <TopBar
        title="Join tournament"
        left={
          <IconBtn aria-label="Close" onClick={() => router.push('/')}>
            {Icons.close}
          </IconBtn>
        }
      />

      <div className="flex flex-1 flex-col px-[18px] pt-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/design-handoff/dink/coach.png" alt="" width={64} height={64} style={{ width: 64, height: 64, objectFit: 'contain' }} />
          <div>
            <div className="serif text-[28px] leading-[1.05] text-ink">
              You&apos;re a few taps from <span className="italic" style={{ color: 'var(--court-deep)' }}>your first game.</span>
            </div>
          </div>
        </div>
        <div className="mb-6 mt-2 text-[13px] text-ink-3">
          Enter the 6-digit code from your invite. <b className="text-ink-2">No account needed yet.</b>
        </div>

        <div className="flex justify-center gap-2">
          {code.map((c, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={c}
              onChange={(e) => set(i, e.target.value)}
              onKeyDown={(e) => onBackspace(i, e)}
              onPaste={onPaste}
              maxLength={1}
              autoFocus={i === 0}
              autoCapitalize="characters"
              autoComplete="off"
              inputMode="text"
              className="mono h-14 w-11 rounded-xl bg-white text-center text-2xl font-bold text-ink outline-none transition-colors"
              style={{ border: `1.5px solid ${c ? 'var(--ink)' : 'var(--line)'}` }}
            />
          ))}
        </div>

        {error && (
          <div
            className="mt-4 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--berry)', color: 'var(--berry)', background: 'oklch(0.96 0.04 12)' }}
          >
            {error}
          </div>
        )}

        <div className="mt-7 rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
          <div className="mono text-[10px] uppercase tracking-[0.1em] text-ink-3">How a mixer works</div>
          <div className="mt-3 flex flex-col gap-2.5">
            {[
              ['Vote for partners', "Secretly spend tokens on who you'd love to play with."],
              ['The draw decides', 'Votes shuffle the teams. Most-wanted often become partners.'],
              ['Play & climb', 'New partner each round. Win to climb the board.'],
            ].map(([t, d], i) => (
              <div key={t} className="flex items-start gap-3">
                <span
                  className="mono grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[12px] font-bold"
                  style={{ background: 'color-mix(in oklch, var(--court) 16%, transparent)', color: 'var(--court-deep)' }}
                >
                  {i + 1}
                </span>
                <div>
                  <div className="text-[13.5px] font-semibold text-ink">{t}</div>
                  <div className="mt-0.5 text-[12px] leading-[1.4] text-ink-3">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto pt-6 pb-[18px]">
          <BigButton tone="ink" disabled={!filled || isPending} onClick={submit}>
            {isPending ? 'Joining…' : 'Join the event'}
          </BigButton>
          <div className="mt-2.5 text-center text-[12px] text-ink-3">Play first — secure your account after your first game.</div>
        </div>
      </div>
    </div>
  );
}
