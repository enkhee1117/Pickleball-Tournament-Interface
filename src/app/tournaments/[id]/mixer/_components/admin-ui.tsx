import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icons } from '@/components/ui/icons';
import { confirmMixerPayment, setMixerRoundState } from '../actions';
import type { RoundRow } from '../_types';
import type { PaymentMethod } from './payment-methods';
import { ActionForm } from './ActionForm';
import { ORGANIZER_TABS, type OrganizerTab } from './admin-helpers';
import { money } from './admin-helpers';

// Small, reusable UI atoms for the mixer admin surfaces. No data fetching.

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{title}</div>
      {children}
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
      <div className="text-[10px] uppercase tracking-[0.08em] text-ink-3">{label}</div>
      <div className="mono mt-1 text-[24px] font-bold text-ink">{value}</div>
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) {
  return (
    <div className="mb-3 rounded-xl border px-3 py-2 text-sm" style={{
      borderColor: tone === 'ok' ? 'var(--court-deep)' : 'var(--berry)',
      color: tone === 'ok' ? 'var(--court-deep)' : 'var(--berry)',
      background: tone === 'ok' ? 'var(--note-ok-bg)' : 'var(--note-err-bg)',
    }}>
      {children}
    </div>
  );
}

export function AdminLink({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link href={href} className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
      <span className="flex items-center justify-between gap-2 text-sm font-bold text-ink">
        {title}
        <span className="text-ink-3">{Icons.arrow}</span>
      </span>
      <span className="mt-1 block text-xs text-ink-3">{sub}</span>
    </Link>
  );
}

export function RoundRail({ rounds, activeRoundId }: { rounds: RoundRow[]; activeRoundId: string }) {
  return (
    <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
      {rounds.map((round) => {
        const active = round.id === activeRoundId;
        return (
          <div
            key={round.id}
            className="flex min-w-[76px] flex-col items-center rounded-xl px-3 py-2 text-center"
            style={{
              background: active ? 'var(--ink)' : 'var(--paper-2)',
              color: active ? 'var(--paper)' : 'var(--ink)',
              border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}`,
            }}
          >
            <span className="mono text-sm font-bold">R{round.round_no}</span>
            <span className="mt-0.5 text-[10px] uppercase tracking-[0.08em]" style={{ color: active ? 'var(--chip-on-label)' : 'var(--ink-3)' }}>
              {round.state}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function StateButton({ tournamentId, roundId, state, label, disabled = false }: { tournamentId: string; roundId: string; state: string; label: string; disabled?: boolean }) {
  return (
    <ActionForm action={setMixerRoundState}>
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="round_id" value={roundId} />
      <input type="hidden" name="state" value={state} />
      <button disabled={disabled} className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-ink disabled:opacity-40" style={{ border: '1px solid var(--line)' }}>
        {label}
      </button>
    </ActionForm>
  );
}

export function PaymentButton({ tournamentId, paymentId, status, label }: { tournamentId: string; paymentId: string; status: 'confirmed' | 'refunded'; label: string }) {
  return (
    <ActionForm action={confirmMixerPayment}>
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="status" value={status} />
      <button className="rounded-xl px-3 py-2 text-xs font-semibold" style={{
        background: status === 'confirmed' ? 'var(--court)' : 'transparent',
        color: status === 'confirmed' ? 'var(--night-court-ink)' : 'var(--berry)',
        border: status === 'confirmed' ? 'none' : '1px solid var(--berry)',
      }}>
        {label}
      </button>
    </ActionForm>
  );
}

export function NumberField({ name, label, value, min, max, step = '1', prefix }: { name: string; label: string; value: string | number; min: number; max: number; step?: string; prefix?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ink-3">{label}</span>
      <div className="mt-1 flex h-11 items-center rounded-xl bg-paper-2 px-3">
        {prefix && <span className="mr-1 text-sm font-semibold text-ink-3">{prefix}</span>}
        <input name={name} type="number" min={min} max={max} step={step} defaultValue={value} className="mono w-full bg-transparent text-sm font-bold text-ink outline-none" />
      </div>
    </label>
  );
}

export function ToggleField({ name, label, checked, sub }: { name: string; label: string; checked: boolean; sub?: string }) {
  return (
    <label className="flex items-center gap-3 rounded-xl bg-paper-2 px-3 py-2">
      <input name={name} type="checkbox" defaultChecked={checked} className="h-5 w-5 accent-[var(--court)]" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{label}</span>
        {sub && <span className="block text-xs text-ink-3">{sub}</span>}
      </span>
    </label>
  );
}

export function PaymentMethodField({ name, label, method, placeholder }: { name: 'zelle' | 'venmo'; label: string; method: PaymentMethod; placeholder: string }) {
  return (
    <div className="rounded-xl bg-paper-2 px-3 py-2">
      <ToggleField name={`pay_${name}_on`} label={label} checked={method.on} />
      <input name={`pay_${name}_handle`} defaultValue={method.handle} placeholder={placeholder} className="mt-2 h-10 w-full rounded-xl bg-white px-3 text-sm font-semibold text-ink" style={{ border: '1px solid var(--line)' }} />
    </div>
  );
}

export function RangeField({ name, label, value, amount }: { name: string; label: string; value: number; amount: number }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-semibold text-ink-3">
        <span>{label}</span>
        <span className="mono">{Math.round(value)}% · {money(amount)}</span>
      </span>
      <input name={name} type="range" min={0} max={100} step={5} defaultValue={Math.round(value)} className="mt-1 w-full accent-[var(--court)]" />
    </label>
  );
}

export function PrizeBucket({ label, pct, amount }: { label: string; pct: number; amount: number }) {
  return (
    <div className="rounded-xl bg-white p-3" style={{ border: '1px solid var(--line)' }}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="mono text-ink">{Math.round(pct * 100)}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-2">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%`, background: 'var(--court)' }} />
      </div>
      <div className="mt-1 text-xs text-ink-3">{money(amount)}</div>
    </div>
  );
}

export function OrganizerTabNav({
  tournamentId,
  active,
  pendingPayments,
}: {
  tournamentId: string;
  active: OrganizerTab;
  pendingPayments: number;
}) {
  return (
    <nav aria-label="Organizer sections" className="mb-4 overflow-x-auto">
      <div className="flex min-w-max gap-2">
        {ORGANIZER_TABS.map((tab) => {
          const on = active === tab.id;
          const badge = tab.id === 'roster' && pendingPayments > 0 ? pendingPayments : null;
          return (
            <Link
              key={tab.id}
              href={tab.id === 'run' ? `/tournaments/${tournamentId}/mixer/admin` : `/tournaments/${tournamentId}/mixer/admin?tab=${tab.id}`}
              aria-current={on ? 'page' : undefined}
              className="flex min-w-[104px] flex-col rounded-2xl px-3 py-2.5"
              style={{
                background: on ? 'var(--ink)' : '#fff',
                color: on ? 'var(--paper)' : 'var(--ink)',
                border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`,
              }}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-bold">
                {tab.label}
                {badge ? (
                  <span className="mono rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--serve)', color: 'var(--paper)' }}>
                    {badge}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 text-[10.5px]" style={{ color: on ? 'var(--chip-on-label)' : 'var(--ink-3)' }}>
                {tab.description}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
