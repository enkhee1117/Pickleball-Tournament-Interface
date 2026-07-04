import { Avatar } from '@/components/ui/Avatar';
import { formatInviteCode } from '@/lib/invite-codes';
import { requestMixerPayment } from '../actions';
import type {
  ConfigRow,
  PaymentRow,
  PlayerRow,
  RaffleItem,
  StandingItem,
  StateRow,
  TournamentRow,
} from '../_types';
import { mixerAvatarFor, Stat } from './mixer-night';
import { firstEnabledPaymentMethod, normalizePaymentMethods, paymentMethodRows } from './payment-methods';

// The player's "Me" tab — identity + balances, payments (Zelle/Venmo/cash
// destinations + entry & boost request buttons) and raffle-ticket breakdown.
// The app never processes money; this UI records intent and lets the
// organizer confirm on their side.

export function MeTab({
  tournament,
  config,
  player,
  state,
  inviteCode,
  payments,
  raffleTickets,
  raffleWinner,
  standings,
}: {
  tournament: TournamentRow;
  config: ConfigRow;
  player: PlayerRow;
  state: StateRow | null;
  inviteCode: string;
  payments: PaymentRow[];
  raffleTickets: RaffleItem[];
  raffleWinner: RaffleItem | null;
  standings: StandingItem[];
}) {
  const entry = payments.find((p) => p.type === 'entry');
  const boost = payments.find((p) => p.type === 'pay_to_play');
  const boostUsed = (state?.boosts_used ?? 0) > 0;
  const methods = normalizePaymentMethods(config.payment_methods);
  const primaryMethod = firstEnabledPaymentMethod(methods);
  const myTickets = raffleTickets.find((r) => r.playerId === player.id);
  const myStanding = standings.find((s) => s.playerId === player.id);
  const wonRaffle = raffleWinner?.playerId === player.id;
  return (
    <div className="px-[18px]">
      <div className="rounded-2xl p-5" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
        <div className="flex items-center gap-3">
          <Avatar player={mixerAvatarFor(player, player.id)} size={56} />
          <div>
            <div className="serif text-[30px] leading-none">{player.display_name}</div>
            <div className="mt-1 text-xs" style={{ color: 'var(--night-text2)' }}>{tournament.name}</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Stat label="Tokens" value={(state?.tokens_base_remaining ?? config.starting_tokens) + (state?.tokens_bought_remaining ?? 0)} />
          <Stat label="Chips" value={state?.chips_remaining ?? config.starting_chips} />
          <Stat label="Raffle" value={myTickets ? Math.round(myTickets.tickets * 10) / 10 : '—'} />
          <Stat label="Standing" value={myStanding ? `#${myStanding.rank}` : 'Live'} />
          <Stat label="Entry fee" value={`$${config.entry_fee}`} />
          <Stat label="Code" value={formatInviteCode(inviteCode)} />
        </div>
      </div>
      {raffleWinner && (
        <div className="mt-3 rounded-2xl p-5" style={{ background: wonRaffle ? 'color-mix(in oklch, var(--court) 22%, var(--night-card))' : 'var(--night-card)', border: wonRaffle ? '1px solid var(--court)' : '1px solid var(--night-line)' }}>
          <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--court)' }}>Raffle winner</div>
          <div className="serif mt-2 text-[30px] leading-none">{wonRaffle ? 'You won' : raffleWinner.displayName}</div>
          <div className="mt-1 text-sm" style={{ color: 'var(--night-text2)' }}>
            {raffleWinner.prize ?? config.raffle_prize} · {Math.round(Number(raffleWinner.tickets ?? 0) * 10) / 10} tickets
          </div>
        </div>
      )}
      <div className="mt-3 rounded-2xl p-5" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
        <div className="serif text-[28px] leading-none">Payments</div>
        <div className="mt-1 text-xs" style={{ color: 'var(--night-text2)' }}>The app never processes payment — organizers confirm Zelle / cash on their side.</div>
        <div className="mt-3 grid gap-2">
          {paymentMethodRows(methods).map((m) => (
            <div key={m.key} className="rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--night-inset)' }}>
              <div className="font-bold">{m.label}</div>
              <div className="mono mt-1 text-xs" style={{ color: 'var(--night-text2)' }}>{m.handle || 'Pay organizer in person'} · memo: {player.display_name}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3">
          <PaymentRequest
            tournamentId={tournament.id}
            playerId={player.id}
            type="entry"
            title="Entry"
            amount={config.entry_fee}
            method={primaryMethod}
            status={entry?.status}
            disabled={!!entry && entry.status !== 'refunded'}
          />
          {config.pay_to_play_enabled && (
            <PaymentRequest
              tournamentId={tournament.id}
              playerId={player.id}
              type="pay_to_play"
              title={`+${config.boost_tokens} token boost`}
              amount={config.boost_price}
              method={primaryMethod}
              status={boost?.status ?? (boostUsed ? 'confirmed' : undefined)}
              disabled={boostUsed || (state?.boosts_used ?? 0) >= config.boost_limit || (!!boost && boost.status !== 'refunded')}
            />
          )}
        </div>
        {myTickets && (
          <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: 'var(--night-inset)' }}>
            <div className="font-bold">Raffle ticket math</div>
            <div className="mt-1 text-xs leading-5" style={{ color: 'var(--night-text2)' }}>
              Popularity {Math.round(myTickets.popularityTickets * 10) / 10} + unused base token bonus {Math.round(myTickets.frugalityTickets * 10) / 10}. Bought tokens do not count.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentRequest({
  tournamentId,
  playerId,
  type,
  title,
  amount,
  method,
  status,
  disabled,
}: {
  tournamentId: string;
  playerId: string;
  type: 'entry' | 'pay_to_play';
  title: string;
  amount: number;
  method: string;
  status?: string;
  disabled: boolean;
}) {
  return (
    <form action={requestMixerPayment} className="rounded-xl p-3" style={{ background: 'var(--night-inset)' }}>
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="player_id" value={playerId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="method" value={method} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold">{title}</div>
          <div className="mono mt-1 text-xs" style={{ color: 'var(--night-text2)' }}>${amount} · {status ?? 'not requested'}</div>
        </div>
        <button disabled={disabled} className="rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-40" style={{ background: 'var(--court)', color: 'var(--night-court-ink)' }}>
          Request
        </button>
      </div>
    </form>
  );
}
