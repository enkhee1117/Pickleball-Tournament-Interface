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
        <div className="serif text-[30px] leading-[1.1] text-ink">
          Got an
          <br />
          <span className="italic" style={{ color: 'var(--court-deep)' }}>invite code?</span>
        </div>
        <div className="mb-7 mt-2 text-[13px] text-ink-3">
          Six characters, usually shouted across the court.
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

        <div className="mt-auto pt-6 pb-[18px]">
          <BigButton tone="ink" disabled={!filled || isPending} onClick={submit}>
            {isPending ? 'Joining…' : 'Join'}
          </BigButton>
        </div>
      </div>
    </div>
  );
}
