import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushBatch, type PushPayload } from './server';

// Lock-screen push, notify.html touchpoint 1: the moment a draw seats a
// player, push "You're on Court N" to their device — even with the app
// closed. Quiet hours are respected: a player is only pushed while the event
// is live (tournament active) AND they are checked into it. Nothing here reads
// votes, so the blind-vote guardrail holds — the push names the player's own
// seat and opponents only.
//
// Called from the drawMixerRound server action after the draw RPC commits.
// Best-effort and self-contained: any failure is logged, never thrown, so a
// push hiccup can't roll back a successful draw.

type PairingRow = {
  player_a_id: string;
  player_b_id: string;
  court_no: number;
};

export async function notifySeatedPlayers(tournamentId: string, roundId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const [{ data: tournament }, { data: pairings }, { data: players }, { data: checkIns }] =
      await Promise.all([
        admin.from('tournaments').select('name,status').eq('id', tournamentId).maybeSingle(),
        admin.from('mixer_pairings').select('player_a_id,player_b_id,court_no').eq('round_id', roundId),
        admin.from('tournament_players').select('id,display_name,profile_id').eq('tournament_id', tournamentId),
        admin.from('mixer_check_ins').select('player_id').eq('tournament_id', tournamentId),
      ]);

    // Quiet hours: only during a live event.
    if (!tournament || (tournament as { status: string }).status !== 'active') return;
    const pairingRows = (pairings ?? []) as PairingRow[];
    if (pairingRows.length === 0) return;

    const eventName = (tournament as { name: string }).name;
    const nameOf = new Map<string, string>();
    const profileOf = new Map<string, string | null>();
    for (const p of (players ?? []) as { id: string; display_name: string; profile_id: string | null }[]) {
      nameOf.set(p.id, p.display_name);
      profileOf.set(p.id, p.profile_id);
    }
    // Quiet hours: only players checked into the event.
    const checkedIn = new Set((checkIns ?? []).map((c) => (c as { player_id: string }).player_id));

    const first = (id: string) => (nameOf.get(id) ?? 'a partner').split(' ')[0];
    const team = (a: string, b: string) => `${first(a)} & ${first(b)}`;

    // Group the round's pairings by court so we can name opponents.
    const byCourt = new Map<number, PairingRow[]>();
    for (const pr of pairingRows) {
      byCourt.set(pr.court_no, [...(byCourt.get(pr.court_no) ?? []), pr]);
    }

    const url = `/tournaments/${tournamentId}/mixer?tab=match`;

    // Build every per-player payload first, then fan out with a single
    // subscriptions query (sendPushBatch) instead of one query per player.
    const items: Array<{ userId: string; payload: PushPayload }> = [];
    for (const pr of pairingRows) {
      const opponent = (byCourt.get(pr.court_no) ?? []).find((o) => o !== pr) ?? null;
      const oppText = opponent ? ` vs. ${team(opponent.player_a_id, opponent.player_b_id)}` : '';
      for (const playerId of [pr.player_a_id, pr.player_b_id]) {
        const profileId = profileOf.get(playerId);
        if (!profileId || !checkedIn.has(playerId)) continue;
        const partnerId = playerId === pr.player_a_id ? pr.player_b_id : pr.player_a_id;
        items.push({
          userId: profileId,
          payload: {
            title: `You're on Court ${pr.court_no} 🏓`,
            body: `Paired with ${first(partnerId)}${oppText}. Head over — round starts when all teams check in.`,
            url,
            tag: `court-call-${tournamentId}`,
            renotify: true,
          },
        });
      }
    }
    await sendPushBatch(items);
  } catch (err) {
    console.error('[push] notifySeatedPlayers failed', err);
  }
}
