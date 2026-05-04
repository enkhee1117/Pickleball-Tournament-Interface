'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { TopBar } from '@/components/ui/TopBar';
import { IconBtn } from '@/components/ui/IconBtn';
import { BigButton } from '@/components/ui/BigButton';
import { Icons } from '@/components/ui/icons';
import { createTournamentClient } from './actions';

type FormatId = 'rr-mixed' | 'rr-same' | 'fp-mixed' | 'fp-same';
type PairingId = 'balanced' | 'random' | 'snake' | 'manual';

type WizardData = {
  name: string;
  format: FormatId;
  pairing: PairingId;
  playerCount: number;
  courts: number;
  rounds: number;
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
  });
  const set = <K extends keyof WizardData>(k: K, v: WizardData[K]) => setData((d) => ({ ...d, [k]: v }));

  const canNext = step !== 0 || data.name.trim().length > 0;

  const finish = () => {
    startTransition(async () => {
      setError(null);
      const result = await createTournamentClient({
        name: data.name.trim(),
        format: legacyFormat(data.format),
        playerCount: data.playerCount,
      });
      if (result.error || !result.id) {
        setError(result.error ?? 'Could not create tournament.');
        return;
      }
      router.push(`/tournaments/${result.id}/invite?new=1`);
    });
  };

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
        {step === 5 && <StepReview data={data} />}

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
          <BigButton tone="court" disabled={isPending || data.name.trim().length === 0} onClick={finish}>
            {isPending ? 'Creating…' : 'Generate matches →'}
          </BigButton>
        )}
      </div>
    </div>
  );
}

function legacyFormat(f: FormatId): string {
  if (f.startsWith('fp')) return 'fixed_partners';
  return 'round_robin';
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
  const isFixed = data.format.startsWith('fp');
  const opts: Array<{ id: PairingId; title: string; sub: string; emoji: string }> = isFixed
    ? [
        { id: 'manual', title: "I'll set teams", sub: 'Drag to pair people up.', emoji: '✋' },
        { id: 'balanced', title: 'Auto-balance', sub: 'High DUPR pairs with low DUPR.', emoji: '⚖️' },
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
  return (
    <div>
      <div className="serif mb-1.5 text-[28px] leading-[1.1] text-ink">
        How many<br />are showing up?
      </div>
      <div className="mb-[22px] text-[13px] text-ink-3">
        We&rsquo;ll create placeholders. Rename or invite real players next.
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
            onClick={() => set('playerCount', Math.max(4, data.playerCount - 1))}
            className="h-11 w-11 rounded-xl bg-white text-[22px]"
            style={{ border: '1.5px solid var(--line)', color: 'var(--ink)' }}
          >
            −
          </button>
          <button
            onClick={() => set('playerCount', Math.min(32, data.playerCount + 1))}
            className="h-11 w-11 rounded-xl text-[22px]"
            style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[4, 6, 8, 10, 12, 16].map((n) => {
          const on = data.playerCount === n;
          return (
            <button
              key={n}
              onClick={() => set('playerCount', n)}
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

function StepReview({ data }: { data: WizardData }) {
  const games = Math.floor(data.playerCount / 4) * data.rounds;
  const rows: Array<[string, string]> = [
    ['Name', data.name || '—'],
    ['Format', FORMAT_LABEL[data.format]],
    ['Pairing', PAIRING_LABEL[data.pairing]],
    ['Players', `${data.playerCount}`],
    ['Courts', `${data.courts}`],
    ['Rounds', `${data.rounds}`],
    ['Total games', `~${games}`],
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
          <strong>Heads up:</strong> we&rsquo;ll generate Round 1 immediately. You can keep adding rounds as games finish.
        </div>
      </div>
    </div>
  );
}
