'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { TopBar } from '@/components/ui/TopBar';
import { IconBtn } from '@/components/ui/IconBtn';
import { BigButton } from '@/components/ui/BigButton';
import { Icons } from '@/components/ui/icons';
import {
  defaultPairingForFormat,
  isFixedPartners,
  isValidPairingForFormat,
  shouldAutoGenerate,
  type WizardFormat,
  type WizardPairing,
} from '@/lib/tournament-wizard';
import { createTournamentClient } from './actions';

type FormatId = WizardFormat;
type PairingId = WizardPairing;

type WizardData = {
  name: string;
  format: FormatId;
  pairing: PairingId;
  playerCount: number;
  courts: number;
  rounds: number;
  rosterMode: 'placeholders' | 'names';
  playerNames: string[];
};

const STEP_LABELS = ['Name', 'Format', 'Pairing', 'Roster', 'Schedule', 'Review'];

export function CreateWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<WizardData>({
    name: '',
    format: 'rr-mixed',
    pairing: 'balanced',
    playerCount: 8,
    courts: 2,
    rounds: 5,
    rosterMode: 'placeholders',
    playerNames: ['', '', '', '', '', '', '', ''],
  });
  const set = <K extends keyof WizardData>(k: K, v: WizardData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const manualFp = !shouldAutoGenerate(data.format, data.pairing);

  // Pairing choices vary by format — reset to a sane default whenever the
  // format flips between round-robin and fixed-partners.
  useEffect(() => {
    if (!isValidPairingForFormat(data.format, data.pairing)) {
      set('pairing', defaultPairingForFormat(data.format));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.format]);

  const namesValid =
    data.rosterMode !== 'names' ||
    data.playerNames.slice(0, data.playerCount).filter((n) => n.trim().length >= 2).length ===
      data.playerCount;

  const canNext = (() => {
    if (step === 0) return data.name.trim().length > 0;
    if (step === 3 && data.rosterMode === 'names') return namesValid;
    return true;
  })();

  const finish = () => {
    startTransition(async () => {
      setError(null);
      const result = await createTournamentClient({
        name: data.name.trim(),
        format: data.format,
        pairing: data.pairing,
        playerCount: data.playerCount,
        playerNames:
          data.rosterMode === 'names'
            ? data.playerNames.slice(0, data.playerCount).map((n) => n.trim())
            : undefined,
        courts: data.courts,
        rounds: data.rounds,
      });
      if (result.error || !result.id) {
        setError(result.error ?? 'Could not create tournament.');
        return;
      }
      // Manual fixed-partners → land on invite/roster so the organizer can
      // wire teams. Otherwise jump straight to the scoreboard with matches.
      if (result.manualTeams) {
        router.push(`/tournaments/${result.id}/invite?new=1&manual=1`);
      } else if (result.matchesGenerated > 0) {
        router.push(
          `/tournaments/${result.id}?ok=${encodeURIComponent(
            `Generated ${result.matchesGenerated} matches`,
          )}`,
        );
      } else {
        router.push(`/tournaments/${result.id}/invite?new=1`);
      }
    });
  };

  const ctaLabel = manualFp ? 'Set up teams →' : 'Generate matches →';

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <TopBar
        title="New tournament"
        sub={`Step ${step + 1} of ${STEP_LABELS.length} · ${STEP_LABELS[step]}`}
        left={
          <IconBtn onClick={() => (step === 0 ? router.push('/') : setStep(step - 1))} aria-label="Back">
            {Icons.back}
          </IconBtn>
        }
        right={
          <IconBtn onClick={() => router.push('/')} aria-label="Close">
            {Icons.close}
          </IconBtn>
        }
      />

      <div className="flex gap-1 px-[18px] pb-3.5">
        {STEP_LABELS.map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: i <= step ? 'var(--ink)' : 'var(--line)' }}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-[18px] pt-1 pb-4">
        {step === 0 && <StepName data={data} set={set} />}
        {step === 1 && <StepFormat data={data} set={set} />}
        {step === 2 && <StepPairing data={data} set={set} />}
        {step === 3 && <StepRoster data={data} set={set} />}
        {step === 4 && <StepSchedule data={data} set={set} />}
        {step === 5 && <StepReview data={data} manualTeams={manualFp} />}

        {error && (
          <div
            className="mt-4 rounded-2xl border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--berry)', color: 'var(--berry)', background: 'oklch(0.96 0.04 12)' }}
          >
            {error}
          </div>
        )}
      </div>

      <div className="border-t bg-paper px-[18px] pt-3 pb-[18px]" style={{ borderColor: 'var(--line)' }}>
        {step < STEP_LABELS.length - 1 ? (
          <BigButton tone="ink" disabled={!canNext} onClick={() => setStep(step + 1)}>
            Continue
          </BigButton>
        ) : (
          <BigButton
            tone="court"
            disabled={isPending || data.name.trim().length === 0}
            onClick={finish}
          >
            {isPending ? 'Creating…' : ctaLabel}
          </BigButton>
        )}
      </div>
    </div>
  );
}

function StepName({ data, set }: { data: WizardData; set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void }) {
  return (
    <div className="pt-2">
      <div className="serif mb-2.5 text-[32px] leading-[1.1] text-ink">
        What are we
        <br />
        <span className="italic" style={{ color: 'var(--court-deep)' }}>calling this one?</span>
      </div>
      <div className="mb-[22px] text-[13px] text-ink-3">
        Pick something memorable. &ldquo;Tuesday Mixer&rdquo; beats &ldquo;Tournament 47&rdquo; any day.
      </div>
      <input
        autoFocus
        value={data.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder="Friday Night Lights"
        className="w-full rounded-2xl bg-white px-[18px] py-4 text-[18px] font-medium tracking-tight text-ink outline-none transition-colors"
        style={{ border: '1.5px solid var(--line)' }}
        onFocus={(e) => (e.target.style.borderColor = 'var(--ink)')}
        onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
      />
      <div className="mt-3.5 text-xs text-ink-3">
        Tip: try a vibe — &ldquo;Sunset Smash&rdquo;, &ldquo;Sock Hop Doubles&rdquo;, &ldquo;Aunt Linda&rsquo;s Birthday Bash&rdquo;.
      </div>
    </div>
  );
}

const FORMAT_OPTS: Array<{ id: FormatId; title: string; sub: string; desc: string; emoji: string }> = [
  { id: 'rr-mixed', title: 'Round Robin', sub: 'Mixed gender', desc: 'Random partners shuffle each round.', emoji: '🎲' },
  { id: 'rr-same', title: 'Round Robin', sub: 'Same gender', desc: 'Random partners, M/M and F/F games.', emoji: '🎲' },
  { id: 'fp-mixed', title: 'Fixed Partners', sub: 'Mixed (PPA)', desc: 'Set teams play every other team.', emoji: '🤝' },
  { id: 'fp-same', title: 'Fixed Partners', sub: 'Same gender', desc: 'Locked teams, same-gender doubles.', emoji: '🤝' },
];

function StepFormat({ data, set }: { data: WizardData; set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void }) {
  return (
    <div>
      <div className="serif mb-1.5 text-[28px] leading-[1.1] text-ink">How do we play?</div>
      <div className="mb-[18px] text-[13px] text-ink-3">Round robin = social mixer. Fixed = team commitment.</div>
      <div className="grid gap-2.5">
        {FORMAT_OPTS.map((o) => {
          const on = data.format === o.id;
          return (
            <button
              key={o.id}
              onClick={() => set('format', o.id)}
              className="flex items-center gap-3.5 rounded-2xl p-4 text-left transition-colors"
              style={{
                background: on ? 'var(--ink)' : '#fff',
                color: on ? 'var(--paper)' : 'var(--ink)',
                border: `1.5px solid ${on ? 'var(--ink)' : 'var(--line)'}`,
              }}
            >
              <div className="text-[26px]">{o.emoji}</div>
              <div className="flex-1">
                <div className="text-[15px] font-semibold tracking-tight">
                  {o.title} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {o.sub}</span>
                </div>
                <div className="mt-0.5 text-xs" style={{ opacity: 0.7 }}>{o.desc}</div>
              </div>
              {on && <span style={{ color: 'var(--court)' }}>{Icons.check}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepPairing({ data, set }: { data: WizardData; set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void }) {
  const isFixed = isFixedPartners(data.format);
  const opts: Array<{ id: PairingId; title: string; sub: string; emoji: string }> = isFixed
    ? [
        { id: 'manual', title: "I'll set teams", sub: 'Pair people up on the roster screen.', emoji: '✋' },
        { id: 'balanced', title: 'Auto-pair (adjacent)', sub: 'P1+P2, P3+P4 in roster order.', emoji: '⚖️' },
        { id: 'random', title: 'Surprise me', sub: 'Random teams. Chaos welcome.', emoji: '🎰' },
      ]
    : [
        { id: 'balanced', title: 'Skill-balanced', sub: 'High DUPR pairs with low DUPR each round.', emoji: '⚖️' },
        { id: 'random', title: 'Pure random', sub: 'Avoids same partner & same opponent twice.', emoji: '🎲' },
        { id: 'snake', title: 'Snake seeding', sub: '1+8, 2+7, 3+6, 4+5 — competitive.', emoji: '🐍' },
      ];

  return (
    <div>
      <div className="serif mb-1.5 text-[28px] leading-[1.1] text-ink">
        How should we<br />pair up players?
      </div>
      <div className="mb-[18px] text-[13px] text-ink-3">We&rsquo;ll auto-avoid repeating partners and opponents.</div>
      <div className="grid gap-2.5">
        {opts.map((o) => {
          const on = data.pairing === o.id;
          return (
            <button
              key={o.id}
              onClick={() => set('pairing', o.id)}
              className="flex items-center gap-3.5 rounded-2xl p-4 text-left transition-colors"
              style={{
                background: on ? 'var(--court)' : '#fff',
                border: `1.5px solid ${on ? 'var(--court-deep)' : 'var(--line)'}`,
                color: 'var(--ink)',
              }}
            >
              <div className="text-[26px]">{o.emoji}</div>
              <div className="flex-1">
                <div className="text-[15px] font-semibold tracking-tight">{o.title}</div>
                <div
                  className="mt-0.5 text-xs"
                  style={{ color: on ? 'oklch(0.3 0.04 140)' : 'var(--ink-3)' }}
                >
                  {o.sub}
                </div>
              </div>
              {on && <span style={{ color: 'var(--ink)' }}>{Icons.check}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepRoster({ data, set }: { data: WizardData; set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void }) {
  const setName = (idx: number, value: string) => {
    const next = data.playerNames.slice();
    while (next.length <= idx) next.push('');
    next[idx] = value;
    set('playerNames', next);
  };

  const setCount = (n: number) => {
    const clamped = Math.max(4, Math.min(32, n));
    if (data.playerNames.length < clamped) {
      const padded = data.playerNames.slice();
      while (padded.length < clamped) padded.push('');
      set('playerNames', padded);
    }
    set('playerCount', clamped);
  };

  return (
    <div>
      <div className="serif mb-1.5 text-[28px] leading-[1.1] text-ink">
        How many<br />are showing up?
      </div>
      <div className="mb-[18px] text-[13px] text-ink-3">
        Pick a count. Toggle below to type names now or use placeholders and rename later.
      </div>

      <div
        className="mb-4 rounded-[18px] bg-white p-[22px] text-center"
        style={{ border: '1.5px solid var(--line)' }}
      >
        <div className="mono text-[64px] font-bold leading-none tracking-[-0.04em] text-ink">
          {data.playerCount}
        </div>
        <div className="mt-1 text-xs uppercase tracking-[0.06em] text-ink-3">PLAYERS</div>
        <div className="mt-[18px] flex justify-center gap-2">
          <button
            onClick={() => setCount(data.playerCount - 1)}
            className="h-11 w-11 rounded-xl bg-white text-[22px]"
            style={{ border: '1.5px solid var(--line)', color: 'var(--ink)' }}
          >
            −
          </button>
          <button
            onClick={() => setCount(data.playerCount + 1)}
            className="h-11 w-11 rounded-xl text-[22px]"
            style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          >
            +
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[4, 6, 8, 10, 12, 16].map((n) => {
          const on = data.playerCount === n;
          return (
            <button
              key={n}
              onClick={() => setCount(n)}
              className="rounded-full px-4 py-2.5 text-[13px] font-semibold"
              style={{
                background: on ? 'var(--ink)' : '#fff',
                color: on ? 'var(--paper)' : 'var(--ink-2)',
                border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>

      <div
        className="mb-3 grid grid-cols-2 gap-1 rounded-xl p-1"
        style={{ background: 'var(--paper-2)' }}
      >
        {(['placeholders', 'names'] as const).map((mode) => {
          const on = data.rosterMode === mode;
          return (
            <button
              key={mode}
              onClick={() => set('rosterMode', mode)}
              className="rounded-[10px] py-2 text-[12px] font-semibold"
              style={{
                background: on ? 'var(--ink)' : 'transparent',
                color: on ? 'var(--paper)' : 'var(--ink-2)',
              }}
            >
              {mode === 'placeholders' ? 'Use placeholders' : 'Type names now'}
            </button>
          );
        })}
      </div>

      {data.rosterMode === 'names' && (
        <div className="grid gap-2">
          {Array.from({ length: data.playerCount }).map((_, i) => (
            <input
              key={i}
              value={data.playerNames[i] ?? ''}
              onChange={(e) => setName(i, e.target.value)}
              placeholder={`Player ${i + 1}`}
              className="rounded-xl bg-white px-3.5 py-3 text-sm text-ink outline-none"
              style={{ border: '1px solid var(--line)' }}
            />
          ))}
          <div className="text-[11px] text-ink-3">
            Names need at least 2 characters. You can edit them anytime from the roster screen.
          </div>
        </div>
      )}
    </div>
  );
}

function StepSchedule({ data, set }: { data: WizardData; set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void }) {
  const games = Math.floor(data.playerCount / 4) * data.rounds;
  const minutes = Math.ceil(games / Math.max(1, data.courts)) * 18;
  return (
    <div>
      <div className="serif mb-1.5 text-[28px] leading-[1.1] text-ink">Courts and rounds</div>
      <div className="mb-[22px] text-[13px] text-ink-3">We&rsquo;ll squeeze the schedule to fit your courts.</div>

      <Stepper label="Courts" value={data.courts} min={1} max={6} onChange={(v) => set('courts', v)} />
      <Stepper label="Rounds" value={data.rounds} min={3} max={12} onChange={(v) => set('rounds', v)} />

      <div
        className="mt-2 flex items-center gap-3.5 rounded-[18px] p-4"
        style={{ background: 'var(--ink)', color: 'var(--paper)' }}
      >
        <span style={{ color: 'var(--court)' }}>{Icons.spark}</span>
        <div>
          <div className="text-[13px] opacity-60">Schedule preview</div>
          <div className="mt-0.5 text-base font-semibold">~{games} games · {minutes} min</div>
        </div>
      </div>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div
      className="mb-3 flex items-center justify-between rounded-2xl bg-white p-4"
      style={{ border: '1px solid var(--line)' }}
    >
      <div>
        <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3">{label}</div>
        <div className="mono text-[28px] font-bold tracking-tight text-ink">{value}</div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-10 w-10 rounded-xl bg-white text-[20px]"
          style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
        >
          −
        </button>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-10 w-10 rounded-xl text-[20px]"
          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
        >
          +
        </button>
      </div>
    </div>
  );
}

const FORMAT_LABEL: Record<FormatId, string> = {
  'rr-mixed': 'Round Robin · Mixed',
  'rr-same': 'Round Robin · Same gender',
  'fp-mixed': 'Fixed Partners · Mixed',
  'fp-same': 'Fixed Partners · Same gender',
};
const PAIRING_LABEL: Record<PairingId, string> = {
  balanced: 'Skill-balanced',
  random: 'Random',
  snake: 'Snake seeding',
  manual: 'Manual',
};

function StepReview({ data, manualTeams }: { data: WizardData; manualTeams: boolean }) {
  const games = Math.floor(data.playerCount / 4) * data.rounds;
  const rows: Array<[string, string]> = [
    ['Name', data.name || '—'],
    ['Format', FORMAT_LABEL[data.format]],
    ['Pairing', PAIRING_LABEL[data.pairing]],
    ['Players', `${data.playerCount}${data.rosterMode === 'names' ? ' (named)' : ''}`],
    ['Courts', `${data.courts}`],
    ['Rounds', `${data.rounds}`],
    ['Total games', manualTeams ? '—' : `~${games}`],
  ];
  return (
    <div>
      <div className="serif mb-[18px] text-[28px] leading-[1.1] text-ink">Look right?</div>
      <div className="rounded-[18px] bg-white p-1" style={{ border: '1px solid var(--line)' }}>
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className="flex items-center justify-between px-4 py-3.5"
            style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--line)' : 'none' }}
          >
            <div className="text-[13px] text-ink-3">{k}</div>
            <div className="text-right text-sm font-semibold text-ink">{v}</div>
          </div>
        ))}
      </div>
      <div
        className="mt-3.5 flex items-start gap-2.5 rounded-2xl p-3.5 text-[13px]"
        style={{
          background: 'oklch(0.96 0.04 140)',
          border: '1px solid oklch(0.85 0.08 140)',
          color: 'oklch(0.3 0.05 140)',
        }}
      >
        <span style={{ color: 'var(--court-deep)', flexShrink: 0 }}>{Icons.spark}</span>
        <div>
          {manualTeams ? (
            <>
              <strong>Manual teams:</strong> we&rsquo;ll create the tournament and roster, then drop you on
              the invite screen so you can pair people up before the first round.
            </>
          ) : (
            <>
              <strong>Heads up:</strong> we&rsquo;ll generate Round 1 immediately and land you on the
              scoreboard.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
