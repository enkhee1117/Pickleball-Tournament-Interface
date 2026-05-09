'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { TopBar } from '@/components/ui/TopBar';
import { IconBtn } from '@/components/ui/IconBtn';
import { BigButton } from '@/components/ui/BigButton';
import { Icons } from '@/components/ui/icons';
import {
  defaultPairingForFormat,
  genderModeFor,
  isFixedPartners,
  isValidPairingForFormat,
  shouldAutoGenerate,
  type GenderMode,
  type WizardFormat,
  type WizardPairing,
} from '@/lib/tournament-wizard';
import { searchInvitees, type InviteeMatch } from '@/app/tournaments/[id]/invite/actions';
import { formatE164, normalizeE164 } from '@/lib/phone';
import { createTournamentClient } from './actions';

type FormatId = WizardFormat;
type PairingId = WizardPairing;

type WizardPlayer = {
  name: string;
  gender: 'm' | 'f' | null;
  phone: string;
  // Captured when the user picks a registered profile from the typeahead so
  // we can display "linked" feedback and skip re-fetching their phone.
  profileId: string | null;
  dupr: number | null;
};

type WizardData = {
  name: string;
  format: FormatId;
  pairing: PairingId;
  playerCount: number;
  courts: number;
  rounds: number;
  rosterMode: 'placeholders' | 'names';
  players: WizardPlayer[];
};

const EMPTY_PLAYER: WizardPlayer = {
  name: '',
  gender: null,
  phone: '',
  profileId: null,
  dupr: null,
};

function makePlayers(n: number, existing: WizardPlayer[] = []): WizardPlayer[] {
  const out: WizardPlayer[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(existing[i] ?? { ...EMPTY_PLAYER });
  }
  return out;
}

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
    players: makePlayers(8),
  });
  const set = <K extends keyof WizardData>(k: K, v: WizardData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const manualFp = !shouldAutoGenerate(data.format, data.pairing);
  const genderMode = genderModeFor(data.format);

  // Pairing choices vary by format — reset to a sane default whenever the
  // format flips between round-robin and fixed-partners.
  useEffect(() => {
    if (!isValidPairingForFormat(data.format, data.pairing)) {
      set('pairing', defaultPairingForFormat(data.format));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.format]);

  const visiblePlayers = data.players.slice(0, data.playerCount);
  const namesValid =
    data.rosterMode !== 'names' ||
    visiblePlayers.filter((p) => p.name.trim().length >= 2).length === data.playerCount;
  // For mixed / same-gender tournaments the auto-generator can't balance
  // teams without a tag on every player, so the wizard now blocks Continue
  // until each named row has M or F set.
  const requireGender =
    data.rosterMode === 'names' && (genderMode === 'mixed' || genderMode === 'same');
  const gendersValid =
    !requireGender || visiblePlayers.every((p) => p.name.trim().length < 2 || p.gender !== null);

  const canNext = (() => {
    if (step === 0) return data.name.trim().length > 0;
    if (step === 3 && data.rosterMode === 'names') return namesValid && gendersValid;
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
        players:
          data.rosterMode === 'names'
            ? visiblePlayers.map((p) => ({
                name: p.name.trim(),
                gender: p.gender,
                phone: p.phone.trim() || null,
                dupr: p.dupr,
                profileId: p.profileId,
              }))
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
        {step === 3 && <StepRoster data={data} set={set} genderMode={genderMode} />}
        {step === 4 && <StepSchedule data={data} set={set} />}
        {step === 5 && <StepReview data={data} manualTeams={manualFp} genderMode={genderMode} />}

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

function StepRoster({
  data,
  set,
  genderMode,
}: {
  data: WizardData;
  set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  genderMode: GenderMode;
}) {
  const updatePlayer = (idx: number, patch: Partial<WizardPlayer>) => {
    const next = data.players.slice();
    while (next.length <= idx) next.push({ ...EMPTY_PLAYER });
    next[idx] = { ...next[idx], ...patch };
    set('players', next);
  };

  const setCount = (n: number) => {
    const clamped = Math.max(4, Math.min(32, n));
    if (data.players.length < clamped) {
      set('players', makePlayers(clamped, data.players));
    }
    set('playerCount', clamped);
  };

  // Refs let us focus the next row when the user presses Enter on a name
  // input — much faster than tabbing through.
  const nameRefs = useRef<Array<HTMLInputElement | null>>([]);
  const focusNextName = (idx: number) => {
    for (let i = idx + 1; i < data.playerCount; i += 1) {
      const el = nameRefs.current[i];
      if (el) {
        el.focus();
        return;
      }
    }
    nameRefs.current[idx]?.blur();
  };

  const showGender = genderMode === 'mixed' || genderMode === 'same';
  const visible = data.players.slice(0, data.playerCount);
  const namedPlayers = visible.filter((p) => p.name.trim().length >= 2);
  const ungendered = showGender
    ? namedPlayers.filter((p) => !p.gender).length
    : 0;
  const males = namedPlayers.filter((p) => p.gender === 'm').length;
  const females = namedPlayers.filter((p) => p.gender === 'f').length;

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
          {showGender && namedPlayers.length > 0 && ungendered > 0 && (
            <div
              className="rounded-xl px-3 py-2 text-[12px]"
              style={{ background: 'oklch(0.96 0.06 75)', color: 'oklch(0.32 0.08 75)', border: '1px solid oklch(0.85 0.08 75)' }}
            >
              Tag every player as <strong>M</strong> or <strong>F</strong> before continuing — {ungendered} still untagged. M {males} · F {females} so far. {genderMode === 'mixed' ? 'Mixed-doubles pairing' : 'Same-gender matchmaking'} relies on this.
            </div>
          )}
          {Array.from({ length: data.playerCount }).map((_, i) => {
            // Profile IDs picked in OTHER rows — typeahead suggestions
            // matching one are dropped so the same registered user can't
            // be slotted into two rows of the same wizard.
            const otherPickedIds = data.players
              .slice(0, data.playerCount)
              .flatMap((p, j) => (j !== i && p.profileId ? [p.profileId] : []));
            return (
              <PlayerRow
                key={i}
                index={i}
                player={data.players[i] ?? { ...EMPTY_PLAYER }}
                showGender={showGender}
                excludedProfileIds={otherPickedIds}
                registerRef={(el) => {
                  nameRefs.current[i] = el;
                }}
                onPatch={(patch) => updatePlayer(i, patch)}
                onSubmitName={() => focusNextName(i)}
              />
            );
          })}
          <div className="text-[11px] text-ink-3">
            Names need at least 2 characters. Enter jumps to the next row. You can edit everything from the roster screen.
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerRow({
  index,
  player,
  showGender,
  excludedProfileIds,
  registerRef,
  onPatch,
  onSubmitName,
}: {
  index: number;
  player: WizardPlayer;
  showGender: boolean;
  excludedProfileIds: string[];
  registerRef: (el: HTMLInputElement | null) => void;
  onPatch: (patch: Partial<WizardPlayer>) => void;
  onSubmitName: () => void;
}) {
  const [matches, setMatches] = useState<InviteeMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, startSearching] = useTransition();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Debounced lookup against existing app users by name or phone. Picking
  // a result prefills name + phone (+ gender + DUPR if known) so the
  // organizer doesn't retype it.
  useEffect(() => {
    if (player.profileId) {
      setMatches([]);
      return;
    }
    const phoneClean = normalizeE164(player.phone);
    const query = phoneClean ?? player.name.trim();
    if (query.length < 2) {
      setMatches([]);
      return;
    }
    const t = setTimeout(() => {
      startSearching(async () => {
        const result = await searchInvitees(query);
        setMatches(result);
      });
    }, 220);
    return () => clearTimeout(t);
  }, [player.name, player.phone, player.profileId]);

  // Filter at render time so when another row picks a profile mid-typing
  // here, the suggestion disappears from this row's dropdown immediately.
  const visibleMatches = (() => {
    const excluded = new Set(excludedProfileIds);
    return matches.filter((m) => !excluded.has(m.user_id));
  })();

  const onPick = (m: InviteeMatch) => {
    onPatch({
      name: m.display_name ?? '',
      phone: m.phone ?? '',
      gender: m.gender === 'm' || m.gender === 'f' ? m.gender : null,
      dupr: m.dupr ?? null,
      profileId: m.user_id,
    });
    setMatches([]);
    setOpen(false);
  };

  const onClearLink = () => {
    onPatch({ profileId: null });
  };

  return (
    <div
      className="rounded-xl bg-white p-2.5"
      style={{ border: `1px solid ${player.profileId ? 'var(--court-deep)' : 'var(--line)'}` }}
    >
      <div ref={containerRef} className="relative">
        <input
          ref={registerRef}
          value={player.name}
          onChange={(e) => {
            onPatch({ name: e.target.value, profileId: null });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setOpen(false);
              onSubmitName();
            }
          }}
          placeholder={`Player ${index + 1}`}
          autoComplete="off"
          className="w-full rounded-lg bg-white px-3 py-2.5 text-sm text-ink outline-none"
          style={{ border: '1px solid var(--line)' }}
        />
        {open && visibleMatches.length > 0 && !player.profileId && (
          <div
            className="absolute left-0 right-0 top-11 z-10 overflow-hidden rounded-xl bg-white shadow-md"
            style={{ border: '1px solid var(--line)' }}
          >
            <div
              className="px-3 py-1.5 text-[10px] uppercase tracking-[0.06em] text-ink-3"
              style={{ borderBottom: '1px solid var(--line)' }}
            >
              {searching ? 'Searching…' : 'Registered players'}
            </div>
            {visibleMatches.map((m) => (
              <button
                key={m.user_id}
                type="button"
                onClick={() => onPick(m)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-paper-2"
              >
                <div>
                  <div className="text-[13px] font-semibold text-ink">{m.display_name}</div>
                  {m.phone && (
                    <div className="mono text-[11px] text-ink-3">{formatE164(m.phone)}</div>
                  )}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-3">
                  Pick
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {player.profileId && (
        <div
          className="mt-2 flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px]"
          style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}
        >
          <span>Linked to registered player</span>
          <button
            type="button"
            onClick={onClearLink}
            className="text-[11px] font-semibold underline"
          >
            Unlink
          </button>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        {showGender && (
          <div className="flex gap-1">
            {([
              ['m', 'M'],
              ['f', 'F'],
            ] as Array<['m' | 'f', string]>).map(([value, label]) => {
              const on = player.gender === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onPatch({ gender: on ? null : value })}
                  className="h-9 w-9 rounded-lg text-[12px] font-bold"
                  style={{
                    background: on ? 'var(--ink)' : '#fff',
                    color: on ? 'var(--paper)' : 'var(--ink-2)',
                    border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
        <input
          value={player.phone}
          onChange={(e) => onPatch({ phone: e.target.value, profileId: null })}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="Phone (optional)"
          className="flex-1 rounded-lg bg-white px-3 py-2 text-[13px] text-ink outline-none"
          style={{ border: '1px solid var(--line)' }}
        />
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

function StepReview({
  data,
  manualTeams,
  genderMode,
}: {
  data: WizardData;
  manualTeams: boolean;
  genderMode: GenderMode;
}) {
  const games = Math.floor(data.playerCount / 4) * data.rounds;
  const visible = data.players.slice(0, data.playerCount);
  const named = visible.filter((p) => p.name.trim().length >= 2);
  const males = named.filter((p) => p.gender === 'm').length;
  const females = named.filter((p) => p.gender === 'f').length;
  const linked = named.filter((p) => p.profileId).length;
  const ungendered = named.length - males - females;
  const showGenderRow = (genderMode === 'mixed' || genderMode === 'same') && data.rosterMode === 'names';
  const rows: Array<[string, string]> = [
    ['Name', data.name || '—'],
    ['Format', FORMAT_LABEL[data.format]],
    ['Pairing', PAIRING_LABEL[data.pairing]],
    ['Players', `${data.playerCount}${data.rosterMode === 'names' ? ' (named)' : ''}`],
    ...(showGenderRow
      ? ([['Gender split', `M ${males} · F ${females}${ungendered ? ` · ${ungendered} untagged` : ''}`]] as Array<
          [string, string]
        >)
      : []),
    ...(linked > 0
      ? ([['Linked players', `${linked} from existing accounts`]] as Array<[string, string]>)
      : []),
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
      {showGenderRow && ungendered > 0 && (
        <div
          className="mt-3 rounded-2xl px-3.5 py-3 text-[12.5px]"
          style={{ background: 'oklch(0.96 0.06 75)', color: 'oklch(0.32 0.08 75)', border: '1px solid oklch(0.85 0.08 75)' }}
        >
          <strong>{ungendered} player{ungendered === 1 ? '' : 's'}</strong> still need a gender tag for {genderMode === 'mixed' ? 'mixed-doubles balancing' : 'same-gender matchmaking'}. We&rsquo;ll create the tournament now — finish tagging on the roster screen before you generate Round 1.
        </div>
      )}
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
