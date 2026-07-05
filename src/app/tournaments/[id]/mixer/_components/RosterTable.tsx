'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Avatar, type AvatarPlayer } from '@/components/ui/Avatar';
import { BallMark } from '@/components/desktop/BallMark';
import { ActionForm } from './ActionForm';
import { updateMixerPlayerGender, updateMixerPlayerPool, confirmMixerPayment } from '../actions';

export type RosterTableRow = {
  id: string;
  name: string;
  sub: string;
  avatar: AvatarPlayer;
  anon: boolean;
  dupr: number | null;
  gender: 'm' | 'f' | 'x' | null;
  pool: 'a' | 'b';
  tokens: number;
  payment: { label: string; tone: 'ok' | 'pend' } | null;
  paymentId: string | null;
  paymentStatus: string | null;
};

// The roster tab's data table — mirrors the desktop handoff (admin.html):
// Player · DUPR · Gender · Payment · Tokens · Actions, with the "···" cell
// expanding an inline editor so organizers keep the gender/pool/payment
// controls that used to live in the old card layout.
const gridStyle: React.CSSProperties = { gridTemplateColumns: '1.7fr 60px 70px 130px 74px 64px' };

export function RosterTable({
  tournamentId,
  inviteHref,
  rows,
}: {
  tournamentId: string;
  inviteHref: string;
  rows: RosterTableRow[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const exportCsv = () => {
    const header = ['Player', 'DUPR', 'Gender', 'Payment', 'Tokens'];
    const lines = rows.map((r) =>
      [
        r.name,
        r.dupr != null ? r.dupr.toFixed(2) : '',
        r.gender ? r.gender.toUpperCase() : '',
        r.payment?.label ?? 'Unpaid',
        String(r.tokens),
      ]
        .map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(','),
    );
    const csv = [header.join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'roster.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="rounded-[18px] p-2" style={{ background: 'var(--surface-card)', border: '1px solid var(--line)' }}>
        <div className="w-full">
          <div
            className="mono grid gap-2.5 px-3.5 py-2.5 text-[10px] uppercase tracking-[0.09em] text-ink-3"
            style={gridStyle}
          >
            <span>Player</span>
            <span>DUPR</span>
            <span>Gender</span>
            <span>Payment</span>
            <span>Tokens</span>
            <span className="text-right">Actions</span>
          </div>

          {rows.length === 0 && (
            <div className="px-3.5 py-8 text-center text-sm text-ink-3">
              No players yet. Share the invite link to fill the courts.
            </div>
          )}

          {rows.map((r, i) => {
            const open = openId === r.id;
            return (
              <div key={r.id}>
                <div
                  className="grid items-center gap-2.5 rounded-xl px-3.5 py-2.5"
                  style={{ ...gridStyle, background: i % 2 === 1 ? 'var(--surface-inset)' : 'transparent' }}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar player={r.avatar} size={34} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[14px] font-semibold text-ink">{r.name}</span>
                        {r.anon && (
                          <span
                            className="mono shrink-0 rounded-full px-2 py-[3px] text-[10px]"
                            style={{ background: 'var(--line-2)', color: 'var(--ink-3)' }}
                          >
                            anon
                          </span>
                        )}
                      </span>
                      <span className="mono block text-[10px] text-ink-3">{r.sub}</span>
                    </span>
                  </span>

                  <span className="mono text-[13px] text-ink-2">{r.dupr != null ? r.dupr.toFixed(2) : '—'}</span>
                  <span className="mono text-[13px] text-ink-2">{r.gender ? r.gender.toUpperCase() : '—'}</span>

                  <span>
                    {r.payment ? (
                      <span
                        className="mono inline-block rounded-full px-2 py-[3px] text-[10px]"
                        style={
                          r.payment.tone === 'ok'
                            ? { background: 'color-mix(in oklch, var(--accent) 16%, transparent)', color: 'var(--court-deep)' }
                            : { background: 'color-mix(in oklch, var(--serve) 16%, transparent)', color: 'var(--serve)' }
                        }
                      >
                        {r.payment.label}
                      </span>
                    ) : (
                      <span className="mono text-[11px] text-ink-3">—</span>
                    )}
                  </span>

                  <span className="mono flex items-center gap-1.5 text-[13px] text-ink-2">
                    {r.tokens}
                    <span className="text-ink"><BallMark size={15} /></span>
                  </span>

                  <span className="text-right">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : r.id)}
                      aria-label={`Actions for ${r.name}`}
                      aria-expanded={open}
                      className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-[18px] leading-none text-ink-3 hover:text-ink"
                      style={{ border: open ? '1px solid var(--line)' : '1px solid transparent' }}
                    >
                      ···
                    </button>
                  </span>
                </div>

                {open && (
                  <div
                    className="mx-2 mb-2 grid gap-2 rounded-xl p-3"
                    style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)' }}
                  >
                    <ActionForm action={updateMixerPlayerGender} className="flex items-center gap-2">
                      <input type="hidden" name="tournament_id" value={tournamentId} />
                      <input type="hidden" name="player_id" value={r.id} />
                      <span className="mono w-16 shrink-0 text-[10px] uppercase tracking-[0.06em] text-ink-3">Gender</span>
                      <select
                        name="gender"
                        defaultValue={r.gender ?? ''}
                        className="h-9 flex-1 rounded-lg bg-paper-2 px-3 text-sm font-semibold text-ink"
                        style={{ border: '1px solid var(--line)' }}
                        aria-label={`Gender for ${r.name}`}
                      >
                        <option value="">Gender —</option>
                        <option value="f">Woman</option>
                        <option value="m">Man</option>
                        <option value="x">Nonbinary</option>
                      </select>
                      <button className="h-9 rounded-lg px-3 text-xs font-bold" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
                        Save
                      </button>
                    </ActionForm>

                    <ActionForm action={updateMixerPlayerPool} className="flex items-center gap-2">
                      <input type="hidden" name="tournament_id" value={tournamentId} />
                      <input type="hidden" name="player_id" value={r.id} />
                      <span className="mono w-16 shrink-0 text-[10px] uppercase tracking-[0.06em] text-ink-3">Pool</span>
                      <select
                        name="pairing_pool"
                        defaultValue={r.pool}
                        className="h-9 flex-1 rounded-lg bg-paper-2 px-3 text-sm font-semibold text-ink"
                        style={{ border: '1px solid var(--line)' }}
                        aria-label={`Pairing pool for ${r.name}`}
                      >
                        <option value="a">Pool A</option>
                        <option value="b">Pool B</option>
                      </select>
                      <button className="h-9 rounded-lg px-3 text-xs font-bold" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
                        Save
                      </button>
                    </ActionForm>

                    {r.paymentId && r.paymentStatus === 'pending' && (
                      <div className="flex items-center gap-2">
                        <span className="mono w-16 shrink-0 text-[10px] uppercase tracking-[0.06em] text-ink-3">Payment</span>
                        <ActionForm action={confirmMixerPayment} className="flex-1">
                          <input type="hidden" name="tournament_id" value={tournamentId} />
                          <input type="hidden" name="payment_id" value={r.paymentId} />
                          <input type="hidden" name="status" value="confirmed" />
                          <button className="w-full rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'var(--court)', color: 'var(--night-court-ink)' }}>
                            Mark paid
                          </button>
                        </ActionForm>
                        <ActionForm action={confirmMixerPayment}>
                          <input type="hidden" name="tournament_id" value={tournamentId} />
                          <input type="hidden" name="payment_id" value={r.paymentId} />
                          <input type="hidden" name="status" value="refunded" />
                          <button className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ color: 'var(--berry)', border: '1px solid var(--berry)' }}>
                            Refund
                          </button>
                        </ActionForm>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <Link
          href={inviteHref}
          className="rounded-btn px-4 py-2.5 text-[13px] font-semibold"
          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
        >
          ＋ Add player
        </Link>
        <Link
          href={inviteHref}
          className="rounded-btn border px-4 py-2.5 text-[13px] font-semibold text-ink"
          style={{ borderColor: 'var(--line-2)', background: 'var(--surface-card)' }}
        >
          Share invite link
        </Link>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-btn border px-4 py-2.5 text-[13px] font-semibold text-ink"
          style={{ borderColor: 'var(--line-2)', background: 'var(--surface-card)' }}
        >
          Export CSV
        </button>
      </div>
    </>
  );
}
