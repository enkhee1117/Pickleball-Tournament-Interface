import { updateMixerConfig } from '../actions';
import type { ConfigRow } from '../_types';
import type { PaymentMethods } from './payment-methods';
import { formatLockDuration, money, type PrizeBuckets } from './admin-helpers';
import {
  NumberField,
  PaymentMethodField,
  RangeField,
  ToggleField,
} from './admin-ui';
import { ResetFormulaButton } from './ResetFormulaButton';

// The Setup-tab form. Big by nature — it edits every knob in event_config,
// including formula parameters and fairness/betting cutoffs (both hidden
// behind advanced disclosures). All fields feed the updateMixerConfig
// server action.

export function ConfigForm({
  tournamentId,
  cfg,
  prizeBuckets,
  paymentMethods,
  playerCount,
  betChips,
}: {
  tournamentId: string;
  cfg: ConfigRow;
  prizeBuckets: PrizeBuckets;
  paymentMethods: PaymentMethods;
  playerCount: number;
  betChips: number;
}) {
  const pot = playerCount * Number(cfg.entry_fee);
  const lockHours = Math.floor(cfg.lock_seconds / 3600);
  const lockExtraSeconds = cfg.lock_seconds % 3600;
  return (
    <form action={updateMixerConfig} className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <div className="grid grid-cols-2 gap-3">
        <NumberField name="rounds" label="Rounds" value={cfg.rounds} min={1} max={50} />
        <NumberField name="courts" label="Courts" value={cfg.courts} min={1} max={16} />
        <NumberField name="starting_tokens" label="Start tokens" value={cfg.starting_tokens} min={1} max={100} />
        <NumberField name="starting_chips" label="Start chips" value={cfg.starting_chips} min={0} max={100000} />
      </div>

      <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Voting</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-ink-3">Lock mode</span>
            <select name="lock_mode" defaultValue={cfg.lock_mode} className="mt-1 h-11 w-full rounded-xl bg-paper-2 px-3 text-sm font-semibold text-ink">
              <option value="timer">Countdown</option>
              <option value="manual">Manual close</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <NumberField name="lock_hours" label="Lock hours" value={lockHours} min={0} max={168} />
            <NumberField name="lock_extra_seconds" label="Fine-tune seconds" value={lockExtraSeconds} min={0} max={3599} />
          </div>
        </div>
        <div className="mt-2 text-xs text-ink-3">
          Current window: {formatLockDuration(cfg.lock_seconds)}. Use hours for signup-day voting windows; extra seconds are only for fine tuning.
        </div>
        <div className="mt-3 grid gap-2">
          <ToggleField name="downvotes_enabled" label="Downvotes" checked={cfg.downvotes_enabled} sub="Let players spend tokens on a gentle no-thanks." />
        </div>
      </div>

      <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Tokens and money</div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField name="entry_fee" label="Entry fee" value={cfg.entry_fee} min={0} max={100000} prefix="$" />
          <NumberField name="boost_price" label="Boost price" value={cfg.boost_price} min={0} max={100000} prefix="$" />
          <NumberField name="boost_tokens" label="Boost tokens" value={cfg.boost_tokens} min={0} max={100} />
          <NumberField name="boost_limit" label="Boost limit" value={cfg.boost_limit} min={0} max={10} />
        </div>
        <div className="mt-3 grid gap-2">
          <ToggleField name="pay_to_play_enabled" label="Pay-to-play token boost" checked={cfg.pay_to_play_enabled} sub="Bought tokens affect matchmaking but never raffle tickets." />
          <ToggleField name="betting_enabled" label="Pooled betting" checked={cfg.betting_enabled} sub={`${betChips} chips currently staked.`} />
          <ToggleField name="raffle_enabled" label="Raffle draw" checked={cfg.raffle_enabled} sub="Tickets come from upvotes received plus unused base tokens." />
        </div>
      </div>

      <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Payment methods</div>
        <div className="grid gap-2">
          <PaymentMethodField name="zelle" label="Zelle" method={paymentMethods.zelle} placeholder="email or mobile number" />
          <PaymentMethodField name="venmo" label="Venmo" method={paymentMethods.venmo} placeholder="@username" />
          <ToggleField name="pay_cash_on" label="Cash / in person" checked={paymentMethods.cash.on} sub="No destination required." />
        </div>
      </div>

      <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Prize buckets</div>
          <div className="mono text-xs text-ink-3">pot {money(pot)}</div>
        </div>
        <div className="mt-3 grid gap-3">
          <RangeField name="bucket_tournament" label="Tournament" value={prizeBuckets.tournament * 100} amount={pot * prizeBuckets.tournament} />
          <RangeField name="bucket_raffle" label="Raffle" value={prizeBuckets.raffle * 100} amount={pot * prizeBuckets.raffle} />
          <RangeField name="bucket_betting" label="Betting" value={prizeBuckets.betting * 100} amount={pot * prizeBuckets.betting} />
          <RangeField name="bucket_reserve" label="Reserve" value={prizeBuckets.reserve * 100} amount={pot * prizeBuckets.reserve} />
          <label>
            <span className="text-xs font-semibold text-ink-3">Raffle prize</span>
            <input name="raffle_prize" defaultValue={cfg.raffle_prize ?? 'Raffle prize'} className="mt-1 h-11 w-full rounded-xl bg-paper-2 px-3 text-sm font-semibold text-ink" />
          </label>
        </div>
      </div>

      <details className="mt-4 rounded-2xl bg-paper-2 p-3">
        <summary className="cursor-pointer text-sm font-bold text-ink">Matching formula</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField name="alpha" label="Alpha (α)" value={cfg.alpha} min={0} max={100} step="0.1" />
          <NumberField name="beta" label="Beta (β)" value={cfg.beta} min={0} max={100} step="0.1" />
          <NumberField name="gamma" label="Gamma (γ)" value={cfg.gamma} min={0} max={100} step="0.1" />
          <NumberField name="tau" label="Tau (τ)" value={cfg.tau} min={0.01} max={100} step="0.1" />
          <NumberField name="grief_floor" label="Grief floor (C)" value={cfg.grief_floor} min={0} max={100} step="0.1" />
          <NumberField name="repeat_decay" label="Repeat decay" value={cfg.repeat_decay} min={0} max={1} step="0.05" />
        </div>
        <div className="mt-2 text-[11px] text-ink-3">
          score = α·(u+u′) + β·√(u·u′) − γ·(d+d′), floored at −C, then weight = e<sup>score/τ</sup> · decay<sup>prior pairings</sup>.
        </div>
        <ResetFormulaButton />
      </details>

      <details className="mt-3 rounded-2xl bg-paper-2 p-3">
        <summary className="cursor-pointer text-sm font-bold text-ink">Fairness & betting cutoffs</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField name="upvote_cap_per_target" label="Upvotes / target" value={cfg.upvote_cap_per_target ?? 3} min={1} max={99} />
          <label className="block">
            <span className="text-xs font-semibold text-ink-3">Betting closes before round</span>
            <input
              name="bet_lock_round_no"
              type="number"
              min={1}
              max={50}
              defaultValue={cfg.bet_lock_round_no ?? ''}
              placeholder={`= last (${cfg.rounds})`}
              className="mt-1 h-11 w-full rounded-xl bg-paper-2 px-3 text-sm font-semibold text-ink"
              style={{ border: '1px solid var(--line)' }}
            />
          </label>
          <NumberField name="podium_markets" label="Podium markets" value={cfg.podium_markets} min={1} max={8} />
          <NumberField name="betting_prize_winners" label="Betting winners" value={cfg.betting_prize_winners} min={1} max={20} />
          <NumberField name="betting_rake_pct" label="Rake %" value={Number(cfg.betting_rake_pct) * 100} min={0} max={100} step="1" />
        </div>
        <div className="mt-2 text-[11px] text-ink-3">
          Upvote cap blocks vote farming per target. Betting cutoff round rejects wagers once that round starts play — leave blank to close at the final round.
        </div>
      </details>

      <button className="mt-4 w-full rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: 'var(--court)', color: 'var(--night-court-ink)' }}>
        Save event settings
      </button>
    </form>
  );
}
