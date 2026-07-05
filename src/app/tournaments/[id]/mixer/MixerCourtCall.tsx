'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { enablePush } from '@/lib/push/client';
import { checkInToMixer } from './actions';

// notify.html touchpoint 2 — the in-app court call. A glowing serve-gradient
// banner that sits above the feed once the draw seats you, distinct from the
// go-time takeover in the Match tab. "I'm here ✓" records your check-in
// (silencing the escalation chain) and opts you into lock-screen pushes for
// the rest of the event; "2 min" snoozes the banner locally without acking.
export function MixerCourtCall({
  tournamentId,
  roundId,
  courtNo,
  waveNo = 1,
  partnerName,
  opponentTeam,
}: {
  tournamentId: string;
  roundId: string;
  courtNo: number;
  waveNo?: number;
  partnerName: string;
  opponentTeam: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [snoozed, setSnoozed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (snoozed) return null;

  const ack = () => {
    setError(null);
    startTransition(async () => {
      // The tap is a user gesture — good moment to opt into push. Fire and
      // forget: a declined permission must not block the check-in.
      void enablePush();
      const result = await checkInToMixer(tournamentId, roundId);
      if (!result.ok) {
        setError(result.error ?? 'Could not check in. Try again.');
        return;
      }
      router.refresh();
    });
  };

  const snooze = () => {
    setSnoozed(true);
    window.setTimeout(() => setSnoozed(false), 2 * 60 * 1000);
  };

  return (
    <div className="px-[18px] pt-1">
      <style>{`@keyframes tpCourtGlow{0%,100%{box-shadow:0 0 0 0 color-mix(in oklch,var(--serve) 55%,transparent)}50%{box-shadow:0 0 0 10px transparent}}`}</style>
      <div
        className="relative overflow-hidden rounded-[18px] p-4 text-white"
        style={{
          background: 'linear-gradient(135deg, var(--serve), var(--night-serve-deep))',
          animation: 'tpCourtGlow 2s ease-in-out infinite',
        }}
      >
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ opacity: 0.9 }}>
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          Your court is ready
        </div>
        <div className="disp mt-2 text-[30px] font-extrabold leading-none">Court {courtNo} — go now</div>
        {waveNo > 1 && <div className="mono mt-1 text-[10px] uppercase tracking-[0.12em]" style={{ opacity: 0.9 }}>Heat {waveNo}</div>}
        <div className="mt-2 text-[13px]" style={{ opacity: 0.95 }}>
          You &amp; {partnerName}
          {opponentTeam ? ` vs. ${opponentTeam}` : ''}. Other teams are checking in.
        </div>
        {error && <div className="mt-2 text-[12px] font-semibold" style={{ color: 'var(--night-cream)' }}>{error}</div>}
        <div className="mt-3.5 flex gap-2">
          <button
            type="button"
            onClick={ack}
            disabled={pending}
            className="flex-1 rounded-xl py-2.5 text-[13.5px] font-bold disabled:opacity-70"
            style={{ background: '#fff', color: 'var(--serve)' }}
          >
            {pending ? 'Checking in…' : "I'm here ✓"}
          </button>
          <button
            type="button"
            onClick={snooze}
            disabled={pending}
            className="rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-70"
            style={{ background: 'rgba(255,255,255,.2)' }}
          >
            2 min
          </button>
        </div>
      </div>
    </div>
  );
}

// A quieter presence check-in shown during the event when the player isn't
// currently court-called and hasn't checked in yet. Feeds the same
// mixer_check_ins state that drives the present-between face-wall and the
// push "quiet hours" gate.
export function MixerPresenceCheckIn({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const checkIn = () => {
    setError(null);
    startTransition(async () => {
      void enablePush();
      const result = await checkInToMixer(tournamentId, null);
      if (!result.ok) {
        setError(result.error ?? 'Could not check in. Try again.');
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="px-[18px] pt-1">
      <div
        className="flex items-center justify-between gap-3 rounded-2xl p-3.5"
        style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}
      >
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold" style={{ color: 'var(--night-text)' }}>You&apos;re here — let the host know</div>
          <div className="mt-0.5 text-[12px]" style={{ color: 'var(--night-text2)' }}>
            {error ?? 'Check in so you show on the board and get court calls.'}
          </div>
        </div>
        <button
          type="button"
          onClick={checkIn}
          disabled={pending}
          className="shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-extrabold disabled:opacity-60"
          style={{ background: 'var(--court)', color: 'var(--night-court-ink)' }}
        >
          {pending ? 'Checking in…' : "I'm here ✓"}
        </button>
      </div>
    </div>
  );
}
