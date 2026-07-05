'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Props = {
  tournamentId: string;
};

// Client-only. Refreshes the current server component tree whenever the
// mixer state machine advances (round state, pairings, scores, snapshots).
// Debounces bursts so a single "draw" that touches three tables only refreshes
// once. RLS is the boundary; this component only observes what the caller
// is allowed to read.
export function MixerRealtimeSync({ tournamentId }: Props) {
  const router = useRouter();
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const filter = `tournament_id=eq.${tournamentId}`;

    const schedule = () => {
      if (pending.current) return;
      pending.current = setTimeout(() => {
        pending.current = null;
        router.refresh();
      }, 250);
    };

    const channel = supabase
      .channel(`mixer:${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mixer_rounds', filter }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mixer_pairings' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mixer_scores' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mixer_check_ins', filter }, schedule)
      // Ballot confirmations drive the organizer's live participation ring and a
      // player's own "locked in" state. Blind-safe: this table holds only
      // (round, player, confirmed_at) — never the picks — so realtime on it can
      // never leak the blind vote (unlike mixer_votes, which we deliberately do
      // NOT subscribe to on the client for exactly that reason).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mixer_round_ballots', filter }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mixer_final_snapshots', filter }, schedule)
      .subscribe();

    return () => {
      if (pending.current) clearTimeout(pending.current);
      supabase.removeChannel(channel);
    };
  }, [router, tournamentId]);

  return null;
}
