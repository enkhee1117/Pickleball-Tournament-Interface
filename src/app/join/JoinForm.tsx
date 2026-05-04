'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { TopBar } from '@/components/ui/TopBar';
import { IconBtn } from '@/components/ui/IconBtn';
import { BigButton } from '@/components/ui/BigButton';
import { Icons } from '@/components/ui/icons';

export function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const set = (i: number, v: string) => {
    if (!/^[a-z0-9]?$/i.test(v)) return;
    const next = [...code];
    next[i] = v.toUpperCase();
    setCode(next);
    if (v && i < 5) refs.current[i + 1]?.focus();
  };

  const onBackspace = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  const filled = code.join('').length === 6;

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
              maxLength={1}
              autoFocus={i === 0}
              className="mono h-14 w-11 rounded-xl bg-white text-center text-2xl font-bold text-ink outline-none transition-colors"
              style={{ border: `1.5px solid ${c ? 'var(--ink)' : 'var(--line)'}` }}
            />
          ))}
        </div>

        <div className="mt-auto pt-6 pb-[18px]">
          <BigButton
            tone="ink"
            disabled={!filled}
            onClick={() => router.push('/tournaments')}
          >
            Join
          </BigButton>
        </div>
      </div>
    </div>
  );
}
