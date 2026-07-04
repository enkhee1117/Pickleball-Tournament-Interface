'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Theme } from '@/lib/theme';
import { DesktopNav } from '@/components/desktop/DesktopNav';
import { DesktopSurface } from '@/components/desktop/DesktopSurface';
import { CommandBar, type Command } from '@/components/desktop/CommandBar';
import { useToast } from '@/components/desktop/ToastProvider';

type Tone = 'warn' | 'serve' | 'berry';

interface Opt {
  title: string;
  desc: string;
  recommended?: boolean;
}

const initials = (n: string) =>
  n.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

function Face({ name }: { name: string }) {
  return (
    <span className="av" style={{ width: 34, height: 34, fontSize: 12, color: 'var(--court-deep)' }} aria-hidden>
      {initials(name)}
    </span>
  );
}

const toneColor: Record<Tone, string> = { warn: 'var(--amber)', serve: 'var(--serve)', berry: 'var(--berry)' };

export function RosterRecovery({
  theme,
  tournamentId,
  tournamentName,
  roundNo,
  roundState,
  activeCount,
  courts,
  leftover,
  byeCandidates,
  withdrawn,
  shortCourt,
}: {
  theme: Theme;
  tournamentId: string;
  tournamentName: string;
  roundNo: number;
  roundState: string;
  activeCount: number;
  courts: number;
  leftover: number;
  byeCandidates: { name: string; sitOuts: number }[];
  withdrawn: { name: string }[];
  shortCourt: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const runHref = `/tournaments/${tournamentId}/mixer/admin?tab=run`;
  const rosterHref = `/tournaments/${tournamentId}/mixer/admin?tab=roster`;

  const commands: Command[] = [
    { group: 'Go to', label: 'Admin cockpit', icon: '◎', run: () => router.push(`/tournaments/${tournamentId}/mixer/admin`) },
    { group: 'Go to', label: 'Score entry', icon: '#', run: () => router.push(`/tournaments/${tournamentId}/mixer/score`) },
    { group: 'Live', label: 'Between-rounds board', icon: '▶', run: () => router.push(`/tournaments/${tournamentId}/mixer/present/between`) },
  ];

  function act(href: string, message: string) {
    toast({ type: 'success', title: 'Recommended fix', desc: message });
    router.push(href);
  }

  const oddDetected = leftover > 0;
  const noShowDetected = shortCourt != null;
  const leaveDetected = withdrawn.length > 0;

  const live = roundState === 'playing' || roundState === 'open';

  return (
    <DesktopSurface variant="default">
      <DesktopNav theme={theme} event={tournamentName} active="Tournaments" live={live} primaryAction="Cockpit" primaryHref={`/tournaments/${tournamentId}/mixer/admin`} />
      <CommandBar commands={commands} />
      <main id="main" className="mx-auto max-w-[1440px] px-8 pb-10 pt-6" style={{ color: 'var(--text)' }}>
        <div className="mb-6">
          <h1 className="serif text-[40px] leading-none">
            When the roster <em className="serif-i" style={{ color: 'var(--accent)' }}>doesn&apos;t cooperate.</em>
          </h1>
          <p className="mt-2 max-w-[52em] text-[14.5px] leading-[1.55]" style={{ color: 'var(--text2)' }}>
            Every mixer hits these — an odd count, a no-show after the draw, someone leaving at round {Math.max(roundNo, 3)}.
            The cockpit detects the problem, recommends the fairest fix, and links you straight to the control. The
            blind-vote guardrail holds through all of it.
          </p>
        </div>

        <div className="grid grid-cols-3 items-start gap-[18px]">
          {/* ODD COUNT */}
          <Case
            tone="warn"
            tag="Odd count"
            title={oddDetected ? `${activeCount} players, 4 to a court` : `${activeCount} players — courts fill evenly`}
            when={oddDetected ? 'Detected at lock · before the draw' : 'Checked at lock'}
            detected={oddDetected}
            banner={
              oddDetected
                ? { title: `${leftover} player${leftover === 1 ? '' : 's'} can't be seated`, desc: `${activeCount} doesn't divide into full courts of four. The draw handles the odd one out this round.` }
                : { title: 'Every court fills', desc: `${activeCount} active players across ${courts} courts — no byes needed this round.` }
            }
            options={
              oddDetected
                ? [
                    { title: 'Rotating bye', desc: 'Fewest-byes player sits, earns an average-points bye, auto-seated next round.', recommended: true },
                    { title: 'Add a 5-player court', desc: 'One court runs king-of-the-court rotation instead of doubles.' },
                    { title: 'Organizer fills in', desc: 'You take the empty slot and play the round.' },
                  ]
                : []
            }
            players={byeCandidates.map((b) => ({ name: b.name, tag: 'gets bye', tagTone: 'sky' }))}
            ctaLabel="Lock & draw"
            onCta={() => act(runHref, 'Byes rotate automatically in the draw — no one sits twice before everyone has sat once.')}
            foot="Byes rotate so no one sits twice before everyone's sat once."
          />

          {/* NO-SHOW */}
          <Case
            tone="serve"
            tag="No-show"
            title={noShowDetected ? `Court ${shortCourt} is a player short` : 'Every court is full'}
            when={noShowDetected ? 'Detected after the draw' : 'Checked after the draw'}
            detected={noShowDetected}
            banner={
              noShowDetected
                ? { title: `Court ${shortCourt} can't start`, desc: 'A team is short. The draw is preserved — swap in a bench player from roster management.' }
                : { title: 'No short courts', desc: 'Every drawn court has two full teams right now.' }
            }
            options={[]}
            players={[]}
            ctaLabel="Manage roster"
            onCta={() => act(rosterHref, 'Swap in a bench player (sorted by fewest games). The seat is inherited — never the ballot.')}
            foot="If the missing player arrives, they re-enter the bye pool — no full re-draw."
          />

          {/* EARLY LEAVE */}
          <Case
            tone="berry"
            tag="Early leave"
            title={leaveDetected ? `${withdrawn[0].name.split(' ')[0]} is heading out` : 'Everyone is still in'}
            when={leaveDetected ? `Round ${roundNo} · already has results` : 'No mid-event departures'}
            detected={leaveDetected}
            banner={
              leaveDetected
                ? { title: `${withdrawn.length} player${withdrawn.length === 1 ? '' : 's'} withdrew`, desc: 'Completed results stay on the board. Choose how the remaining rounds handle the empty slot.' }
                : { title: 'Full roster', desc: 'No one has left mid-event — nothing to recover.' }
            }
            options={
              leaveDetected
                ? [
                    { title: 'Retire & keep results', desc: 'Played rounds count toward standings; removed from remaining pairings.', recommended: true },
                    { title: 'Replace with a sub', desc: 'A bench player inherits the remaining schedule.' },
                    { title: 'Withdraw entirely', desc: 'Removes all results — standings recompute. Rarely used.' },
                  ]
                : []
            }
            players={withdrawn.map((w) => ({ name: w.name, tag: 'results kept', tagTone: 'sky' }))}
            ctaLabel="Manage roster"
            onCta={() => act(rosterHref, 'Retire keeps played rounds and drops them from future pairings. Standings recompute only for affected rounds.')}
            foot="Standings recompute only for affected rounds — the rest is untouched."
          />
        </div>

        <div
          className="mt-[22px] flex items-center gap-2 rounded-xl px-4 py-3 text-[13px]"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--line)', color: 'var(--text2)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)', flexShrink: 0 }} aria-hidden>
            <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            <b style={{ color: 'var(--text)' }}>Guardrail preserved:</b> every recovery re-pairs from the existing draw — it never
            re-opens or reveals anyone&apos;s blind partner vote. Substitutions inherit a seat, not a ballot.
          </span>
        </div>
      </main>
    </DesktopSurface>
  );
}

function Case({
  tone,
  tag,
  title,
  when,
  detected,
  banner,
  options,
  players,
  ctaLabel,
  onCta,
  foot,
}: {
  tone: Tone;
  tag: string;
  title: string;
  when: string;
  detected: boolean;
  banner: { title: string; desc: string };
  options: Opt[];
  players: { name: string; tag: string; tagTone: 'sky' | 'accent' | 'berry' }[];
  ctaLabel: string;
  onCta: () => void;
  foot: string;
}) {
  const recommendedIndex = Math.max(0, options.findIndex((o) => o.recommended));
  const [selected, setSelected] = useState(recommendedIndex);
  const c = toneColor[tone];

  return (
    <section className="flex flex-col overflow-hidden rounded-[20px]" style={{ background: 'var(--surface-card)', border: '1px solid var(--line)' }}>
      <div className="border-b p-[16px_20px]" style={{ borderColor: 'var(--line)' }}>
        <span
          className="mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[.1em]"
          style={{ color: c, background: `color-mix(in oklch, ${c} 16%, transparent)` }}
        >
          {tag}
          {!detected ? <span style={{ opacity: 0.7 }}>· clear</span> : null}
        </span>
        <h2 className="mt-2.5 text-[19px] font-bold">{title}</h2>
        <div className="mt-1 text-[13px]" style={{ color: 'var(--text3)' }}>{when}</div>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 p-[18px_20px]">
        <div className="flex gap-3 rounded-[13px] p-[13px_14px]" style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[9px] text-white" style={{ background: c }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 8v5M12 16h.01" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="1.6" />
            </svg>
          </span>
          <div>
            <div className="text-[14px] font-semibold">{banner.title}</div>
            <div className="mt-0.5 text-[12.5px] leading-[1.45]" style={{ color: 'var(--text3)' }}>{banner.desc}</div>
          </div>
        </div>

        {options.length > 0 ? (
          <div className="flex flex-col gap-[9px]">
            {options.map((o, i) => {
              const on = i === selected;
              return (
                <button
                  key={o.title}
                  type="button"
                  onClick={() => setSelected(i)}
                  className="flex items-start gap-[11px] rounded-[13px] p-[12px_13px] text-left transition-colors"
                  style={{
                    border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                    background: on ? 'color-mix(in oklch, var(--accent) 10%, transparent)' : undefined,
                  }}
                >
                  <span
                    className="relative mt-0.5 h-[18px] w-[18px] flex-shrink-0 rounded-full"
                    style={{ border: `2px solid ${on ? 'var(--accent)' : 'var(--line-2)'}` }}
                  >
                    {on ? <span className="absolute inset-[3px] rounded-full" style={{ background: 'var(--accent)' }} /> : null}
                  </span>
                  <span>
                    <span className="text-[13.5px] font-semibold">
                      {o.title}
                      {o.recommended ? (
                        <span className="mono ml-1.5 rounded-[5px] border px-[5px] py-px text-[9px]" style={{ color: 'var(--accent)', borderColor: 'color-mix(in oklch, var(--accent) 40%, transparent)' }}>
                          Recommended
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-[1.45]" style={{ color: 'var(--text3)' }}>{o.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {players.length > 0 ? (
          <div className="flex flex-col gap-2">
            {players.map((p) => (
              <div key={p.name} className="flex items-center gap-[11px] rounded-xl p-[9px_12px]" style={{ background: 'var(--surface-inset)' }}>
                <Face name={p.name} />
                <span className="flex-1 text-[14px] font-semibold">{p.name}</span>
                <span className="mono rounded-md px-2 py-[3px] text-[10px] uppercase tracking-[.06em]" style={{ color: 'var(--sky)', background: 'color-mix(in oklch, var(--sky) 18%, transparent)' }}>
                  {p.tag}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex gap-2.5 pt-1">
          {detected ? (
            <button type="button" onClick={onCta} className="btn btn-accent btn-sm flex-1">
              {ctaLabel}
            </button>
          ) : (
            <div className="mono w-full rounded-[11px] py-2.5 text-center text-[11px] uppercase tracking-[.08em]" style={{ background: 'var(--surface-inset)', color: 'var(--text3)' }}>
              Nothing to fix
            </div>
          )}
        </div>
        <div className="text-[12px] leading-[1.5]" style={{ color: 'var(--text3)' }}>{foot}</div>
      </div>
    </section>
  );
}
