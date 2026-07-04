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

const EXPLAINER_STEPS: Array<[string, string]> = [
  ['Vote for partners', "Secretly spend tokens on who you'd love to play with."],
  ['The draw decides', 'Votes shuffle the teams. Most-wanted often become partners.'],
  ['Play & climb', 'New partner each round. Win to climb the board.'],
];

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

  const codeEntry = (
    <>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/design-handoff/dink/coach.png" alt="" width={64} height={64} className="lg:hidden" style={{ width: 64, height: 64, objectFit: 'contain' }} />
        <div>
          <div className="serif text-[28px] leading-[1.05] text-ink lg:text-[38px]">
            You&apos;re a few taps from <span className="italic" style={{ color: 'var(--court-deep)' }}>your first game.</span>
          </div>
        </div>
      </div>
      <div className="mb-6 mt-2 text-[13px] text-ink-3 lg:text-[14px]">
        Enter the 6-digit code from your invite. <b className="text-ink-2">No account needed yet.</b>
      </div>

      <div className="flex justify-center gap-2 lg:justify-start">
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
            className="mono h-14 w-11 rounded-xl bg-white text-center text-2xl font-bold text-ink outline-none transition-colors lg:h-16 lg:w-[52px]"
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
    </>
  );

  const explainer = (
    <div className="rounded-2xl bg-white p-4 lg:p-5" style={{ border: '1px solid var(--line)' }}>
      <div className="mono text-[10px] uppercase tracking-[0.1em] text-ink-3">How a mixer works</div>
      <div className="mt-3 flex flex-col gap-2.5 lg:gap-3.5">
        {EXPLAINER_STEPS.map(([t, d], i) => (
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
  );

  const cta = (
    <>
      <BigButton tone="ink" disabled={!filled || isPending} onClick={submit}>
        {isPending ? 'Joining…' : 'Join the event'}
      </BigButton>
      <div className="mt-2.5 text-center text-[12px] text-ink-3">Play first — secure your account after your first game.</div>
    </>
  );

  // Desktop (join.html / cold-join.html): the code entry becomes the left
  // pane with the CTA inline; the mixer explainer + Coach Dink sit on the
  // right. Mobile keeps the single-column flow with the CTA pinned low.
  return (
    <div data-fullscreen className="flex min-h-[100dvh] flex-col bg-paper">
      <div className="mx-auto w-full max-w-[480px] lg:max-w-[1020px]">
        <TopBar
          title="Join tournament"
          left={
            <IconBtn aria-label="Close" onClick={() => router.push('/')}>
              {Icons.close}
            </IconBtn>
          }
        />
      </div>

      {/* Mobile flow */}
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-[18px] pt-5 lg:hidden">
        {codeEntry}
        <div className="mt-7">{explainer}</div>
        <div className="mt-auto pt-6 pb-[18px]">{cta}</div>
      </div>

      {/* Desktop flow */}
      <div className="mx-auto hidden w-full max-w-[1020px] flex-1 content-start gap-10 px-6 pt-[9vh] lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          {codeEntry}
          <div className="mt-8 max-w-[380px]">{cta}</div>
        </div>
        <div className="pt-2">
          {explainer}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/design-handoff/dink/coach.png"
            alt=""
            width={150}
            height={150}
            className="mx-auto mt-8"
            style={{ width: 150, height: 150, objectFit: 'contain' }}
          />
        </div>
      </div>
    </div>
  );
}
