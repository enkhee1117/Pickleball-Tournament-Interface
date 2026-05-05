'use client';

import { useEffect, useState } from 'react';
import { Icons } from '@/components/ui/icons';

type Props = {
  inviteCode: string;
  rawInviteCode: string;
  tournamentId: string;
  tournamentName: string;
};

export function ShareCodeCard({ inviteCode, rawInviteCode, tournamentId, tournamentName }: Props) {
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setShareUrl(`${window.location.origin}/join?code=${encodeURIComponent(rawInviteCode)}`);
    setCanNativeShare(typeof navigator !== 'undefined' && 'share' in navigator);
  }, [tournamentId, rawInviteCode]);

  const onCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const el = document.createElement('input');
      el.value = shareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const onShare = async () => {
    if (!shareUrl) return;
    if (canNativeShare) {
      try {
        await navigator.share({
          title: tournamentName,
          text: `Join "${tournamentName}" on TourneyPal — code ${inviteCode}`,
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled the share sheet or sharing was blocked.
      }
    }
    onCopy();
  };

  return (
    <div
      className="relative mb-[18px] overflow-hidden rounded-[22px] p-5"
      style={{ background: 'var(--ink)', color: 'var(--paper)' }}
    >
      <div className="text-[11px] tracking-[0.08em]" style={{ color: 'oklch(0.78 0.18 135)' }}>
        SHARE CODE
      </div>
      <div className="mono mt-1.5 text-[38px] font-bold tracking-widest">{inviteCode}</div>
      <div className="mt-1 text-xs opacity-60">Players join with this code in the app.</div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="flex-1 rounded-xl px-3.5 py-3 text-[13px] font-semibold transition active:scale-[0.97]"
          style={{
            background: copied ? 'var(--court)' : 'oklch(0.28 0.04 140)',
            color: copied ? 'oklch(0.2 0.04 140)' : 'var(--paper)',
          }}
        >
          {copied ? '✓ Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={onShare}
          aria-label="Share"
          className="rounded-xl px-4 py-3 text-[13px] font-semibold transition active:scale-[0.97]"
          style={{ background: 'oklch(0.28 0.04 140)', color: 'var(--paper)' }}
        >
          {Icons.share}
        </button>
      </div>
    </div>
  );
}
