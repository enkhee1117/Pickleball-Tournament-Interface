import type { ReactNode } from 'react';
import { playerFromName } from '@/components/ui/Avatar';
import type { PlayerRow } from '../_types';

// Presentation primitives used across the Mixer night surfaces (player page,
// tabs, empty states). Kept independent of the page so each tab component
// can pull just what it needs.

export type DinkPose = 'token-t' | 'presenting-t' | 'wave' | 'coach' | 'idle';

export function Dink({ pose, size }: { pose: DinkPose; size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/design-handoff/dink/${pose}.png`}
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'oklch(0.285 0.038 266)' }}>
      <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'oklch(0.7 0.03 264)' }}>{label}</div>
      <div className="mono mt-1 text-[22px] font-bold" style={{ color: 'var(--court)' }}>{value}</div>
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) {
  return (
    <div className="mx-[18px] mb-3 rounded-xl px-3 py-2 text-sm" style={{
      color: tone === 'ok' ? 'var(--court)' : 'var(--serve)',
      background: 'oklch(0.215 0.03 264)',
      border: '1px solid oklch(0.36 0.04 266)',
    }}>
      {children}
    </div>
  );
}

export function EmptyNight({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-[18px] pt-6">
      <div className="rounded-2xl p-6 text-center" style={{ background: 'oklch(0.215 0.03 264)', border: '1px dashed oklch(0.36 0.04 266)' }}>
        <div className="mb-2 flex justify-center"><Dink pose="presenting-t" size={96} /></div>
        <div className="serif text-[30px] leading-none">{title}</div>
        <div className="mt-2 text-sm" style={{ color: 'oklch(0.78 0.028 264)' }}>{body}</div>
      </div>
    </div>
  );
}

export function ordinal(n: number) {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st'
    : n % 10 === 2 && n % 100 !== 12 ? 'nd'
    : n % 10 === 3 && n % 100 !== 13 ? 'rd'
    : 'th';
  return `${n}${suffix}`;
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function mixerAvatarFor(player: Pick<PlayerRow, 'id' | 'display_name'>, selfId?: string) {
  if (selfId && player.id === selfId) {
    return playerFromName(player.display_name, '/design-handoff/avatars/me.png');
  }
  const n = 2 + (hashString(player.id || player.display_name) % 11);
  return playerFromName(player.display_name, `/design-handoff/avatars/p${n}.png`);
}
