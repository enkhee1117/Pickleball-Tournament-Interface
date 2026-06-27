'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function AnonymousMixerJoinButton({ tournamentId }: { tournamentId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
      return;
    }
    const { error: bindError } = await supabase.rpc('app_mixer_bind_roster_entry', {
      p_tournament_id: tournamentId,
      p_display_name: 'Guest player',
    });
    if (bindError) {
      setError(bindError.message);
      setBusy(false);
      return;
    }
    window.location.reload();
  };

  return (
    <div>
      <button
        onClick={join}
        disabled={busy}
        className="w-full rounded-2xl px-5 py-[18px] text-center text-base font-semibold tracking-tight disabled:opacity-60"
        style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}
      >
        {busy ? 'Joining…' : 'Join anonymously'}
      </button>
      {error && <div className="mt-2 text-center text-xs" style={{ color: 'var(--berry)' }}>{error}</div>}
    </div>
  );
}
