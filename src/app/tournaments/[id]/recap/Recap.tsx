'use client';

import { useRouter } from 'next/navigation';
import type { Theme } from '@/lib/theme';
import { formatInviteCode } from '@/lib/invite-codes';
import { DesktopNav } from '@/components/desktop/DesktopNav';
import { DesktopSurface } from '@/components/desktop/DesktopSurface';
import { useToast } from '@/components/desktop/ToastProvider';
import { GALAXY_BG } from '@/lib/demo-roster';
import type { Superlative } from './recap-stats';

const initials = (n: string) => n.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const firstName = (n: string) => n.split(' ')[0];

function Face({ name, size, ring }: { name: string; size: number; ring?: boolean }) {
  return (
    <span className={`av${ring ? ' ring' : ''}`} style={{ width: size, height: size, fontSize: size * 0.34, color: 'var(--court-deep)' }} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Recap({
  theme,
  tournamentId,
  tournamentName,
  inviteCode,
  champion,
  podium,
  superlatives,
  nightNumbers,
  attendance,
  playersCount,
  roundsTotal,
  pot,
  raffleWinner,
  csv,
  duprCsv,
  completedLabel,
  durationLabel,
}: {
  theme: Theme;
  tournamentId: string;
  tournamentName: string;
  inviteCode: string;
  finalized: boolean;
  champion: string | null;
  podium: { rank: number; name: string; record: string }[];
  superlatives: { label: string; sup: Superlative }[];
  nightNumbers: { closestMatch: { label: string; detail: string } | null; avgMargin: number | null; longestStreak: number | null; matches: number };
  attendance: { name: string; guest: boolean }[];
  playersCount: number;
  roundsTotal: number;
  pot: number;
  raffleWinner: string | null;
  csv: string;
  duprCsv: string;
  completedLabel: string | null;
  durationLabel: string | null;
}) {
  const router = useRouter();
  const toast = useToast();

  const slug = tournamentName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  function download(content: string, mime: string, filename: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadCsv() {
    download(csv, 'text/csv;charset=utf-8', `${slug}-results.csv`);
    toast({ type: 'success', title: 'Results CSV ready', desc: 'Every match, score & standing downloaded.' });
  }

  function downloadDupr() {
    download(duprCsv, 'text/csv;charset=utf-8', `${slug}-dupr.csv`);
    toast({ type: 'success', title: 'DUPR export ready', desc: 'Match sheet downloaded — upload it to DUPR.' });
  }

  // Offline recap card: a self-contained SVG the organizer can drop in a group
  // chat (no external image service, so it works anywhere).
  function downloadRecapImage() {
    const esc = (s: string) => s.replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' })[c] as string);
    const [p2, p1, p3] = [podium[1], podium[0], podium[2]];
    const podLine = (p: { rank: number; name: string; record: string } | undefined, medal: string) =>
      p ? `${medal} ${esc(firstName(p.name))} · ${esc(p.record)}` : '';
    const sups = superlatives.slice(0, 3).map((s) => `${esc(s.label)}: ${esc(firstName(s.sup.name))}`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#16182a"/>
  <rect width="1200" height="6" fill="#9cd96b"/>
  <text x="64" y="120" fill="#9cd96b" font-family="monospace" font-size="26" letter-spacing="4">EVENT COMPLETE${completedLabel ? ' · ' + esc(completedLabel).toUpperCase() : ''}</text>
  <text x="64" y="210" fill="#fff" font-family="Georgia, serif" font-size="76" font-style="italic">${esc(tournamentName)}</text>
  <text x="64" y="262" fill="#c8c8d4" font-family="sans-serif" font-size="26">Partner Mixer · ${playersCount} players · ${roundsTotal} rounds · ${nightNumbers.matches} matches${durationLabel ? ' · ' + durationLabel : ''}</text>
  <text x="64" y="360" fill="#f0d060" font-family="sans-serif" font-size="40" font-weight="700">${podLine(p1, '🥇')}</text>
  <text x="64" y="420" fill="#cfd3e0" font-family="sans-serif" font-size="34">${podLine(p2, '🥈')}</text>
  <text x="64" y="472" fill="#d6a15a" font-family="sans-serif" font-size="34">${podLine(p3, '🥉')}</text>
  ${sups.map((s, i) => `<text x="64" y="${548 + i * 34}" fill="#8a8fa3" font-family="monospace" font-size="22">${s}</text>`).join('\n  ')}
  <text x="1136" y="596" fill="#5b6070" font-family="monospace" font-size="20" text-anchor="end">Try to Dink</text>
</svg>`;
    download(svg, 'image/svg+xml;charset=utf-8', `${slug}-recap.svg`);
    toast({ type: 'success', title: 'Recap card ready', desc: 'Saved an SVG you can share anywhere.' });
  }

  async function copyPublicLink() {
    const link = `${window.location.origin}/t/${inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({ type: 'success', title: 'Public link copied', desc: 'Anyone with the link sees the final board.' });
    } catch {
      toast({ type: 'info', title: 'Public link', desc: link });
    }
  }

  const exportRows = [
    { key: 'csv', title: 'Full results — CSV', desc: 'Every match, score & standing for your records', onClick: downloadCsv },
    { key: 'link', title: 'Public results link', desc: 'Anyone with the link sees the final board', onClick: copyPublicLink },
    { key: 'image', title: 'Recap image for the group chat', desc: 'Podium + superlatives — download an SVG card', onClick: downloadRecapImage },
    { key: 'dupr', title: 'Submit to DUPR', desc: 'Rated-match sheet (CSV) for DUPR upload', onClick: downloadDupr },
  ];

  const medalBg = ['var(--court)', 'var(--ink-3)', 'var(--amber)'];
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean); // 2-1-3

  return (
    <DesktopSurface variant="default">
      <DesktopNav theme={theme} event={tournamentName} active="Tournaments" primaryAction="Cockpit" primaryHref={`/tournaments/${tournamentId}/mixer/admin`} />
      <main id="main" className="mx-auto max-w-[1440px] px-8 pb-16 pt-6" style={{ color: 'var(--text)' }}>
        {/* HERO */}
        <section
          className="relative overflow-hidden rounded-[24px] p-[34px_38px]"
          style={{
            color: 'var(--paper)',
            background: `linear-gradient(135deg, oklch(0.24 0.05 150 / .95), oklch(0.17 0.02 140 / .92) 60%, oklch(0.16 0.02 260 / .9)), url('${GALAXY_BG}') center/cover no-repeat, oklch(0.16 0.02 260)`,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="mono text-[12px] uppercase tracking-[.14em]" style={{ color: 'rgba(255,255,255,.66)' }}>
              Event complete{completedLabel ? ` · ${completedLabel}` : ''}
            </div>
            <div className="flex gap-2.5">
              <button type="button" onClick={copyPublicLink} className="btn btn-glass btn-sm">Share recap</button>
              <button type="button" onClick={() => { toast({ type: 'success', title: 'New event drafted', desc: 'Same format — edit & publish.' }); router.push('/tournaments/new'); }} className="btn btn-accent btn-sm">
                Run it again →
              </button>
            </div>
          </div>
          <div className="mt-5 flex items-end justify-between gap-8">
            <div>
              <h1 className="serif text-[52px] leading-[.98]">{tournamentName}</h1>
              <div className="mono mt-2.5 text-[14px] tracking-[.02em]" style={{ color: 'rgba(255,255,255,.72)' }}>
                Partner Mixer · {playersCount} players · {roundsTotal} rounds · {nightNumbers.matches} matches{durationLabel ? ` · ${durationLabel}` : ''}
              </div>
            </div>
            <div className="flex gap-3">
              <HeroStat label="Champion" value={champion ? firstName(champion) : '—'} />
              <HeroStat label="Matches" value={String(nightNumbers.matches)} mono />
              {pot > 0 ? <HeroStat label="Prize pot" value={`$${pot}`} mono /> : null}
            </div>
          </div>
        </section>

        <div className="mt-6 grid grid-cols-[1.5fr_1fr] items-start gap-[22px]">
          {/* LEFT: results */}
          <div className="flex flex-col gap-5">
            <div className="card p-[22px_24px]">
              <SecHead title="Final podium" chip={`Top 3 of ${playersCount}`} />
              {podium.length === 0 ? (
                <Empty>No completed matches yet — the podium fills in once scores are posted.</Empty>
              ) : (
                <div className="grid grid-cols-3 items-end gap-3.5">
                  {podiumOrder.map((p) => {
                    const first = p.rank === 1;
                    return (
                      <div
                        key={p.rank}
                        className="relative rounded-[16px] p-[18px_12px] text-center"
                        style={
                          first
                            ? { background: 'linear-gradient(160deg, var(--court-soft), color-mix(in oklch, var(--court-soft) 30%, var(--card)))', border: '1px solid color-mix(in oklch, var(--court) 45%, var(--line))', paddingTop: 26 }
                            : { background: 'var(--paper-2)', border: '1px solid var(--line)' }
                        }
                      >
                        {first ? (
                          <span className="absolute left-1/2 top-[-14px] -translate-x-1/2" style={{ color: 'var(--amber)' }}>
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M3 7l4.5 4L12 5l4.5 6L21 7l-1.6 11H4.6L3 7z" fill="currentColor" /></svg>
                          </span>
                        ) : null}
                        <span className="disp mx-auto mb-2.5 grid h-[30px] w-[30px] place-items-center rounded-[9px] text-[15px] font-black text-white" style={{ background: medalBg[p.rank - 1], color: p.rank === 2 ? '#fff' : 'var(--accent-ink)' }}>
                          {p.rank}
                        </span>
                        <div className="mx-auto mb-2.5 flex justify-center">
                          <Face name={p.name} size={first ? 68 : 56} ring={first} />
                        </div>
                        <div className={first ? 'text-[18px] font-bold' : 'text-[15px] font-bold'}>{p.name}</div>
                        <div className="mono mt-[3px] text-[11px]" style={{ color: 'var(--ink-3)' }}>{p.record}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {superlatives.length > 0 ? (
                <div className="mt-[18px] grid grid-cols-2 gap-2.5">
                  {superlatives.map(({ label, sup }) => (
                    <div key={label} className="flex items-center gap-3 rounded-[13px] p-[11px_13px]" style={{ background: 'var(--paper-2)' }}>
                      <Face name={sup.name} size={38} />
                      <div>
                        <div className="mono text-[9.5px] uppercase tracking-[.08em]" style={{ color: 'var(--court-deep)' }}>{label}</div>
                        <div className="mt-px text-[14px] font-semibold">{firstName(sup.name)} · {sup.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="card p-[22px_24px]">
              <SecHead title="The night in numbers" />
              <div className="grid grid-cols-2 gap-3">
                <Tile label="Closest match" value={nightNumbers.closestMatch?.label ?? '—'} detail={nightNumbers.closestMatch?.detail ?? 'No matches yet'} />
                <Tile label="Avg. margin" value={nightNumbers.avgMargin != null ? String(nightNumbers.avgMargin) : '—'} unit=" pts" detail="Lower = tighter draws" />
                <Tile label="Longest streak" value={nightNumbers.longestStreak != null ? String(nightNumbers.longestStreak) : '—'} unit=" wins" detail="Wire to wire" />
                <Tile label="Matches played" value={String(nightNumbers.matches)} detail={`Across ${roundsTotal} rounds`} />
              </div>
            </div>
          </div>

          {/* RIGHT: export + attendance + next */}
          <aside className="flex flex-col gap-5">
            <div className="card p-[22px_24px]">
              <SecHead title="Share & export" />
              <div className="flex flex-col gap-2.5">
                {exportRows.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={r.onClick}
                    className="flex items-center gap-3.5 rounded-[14px] border p-[13px_15px] text-left transition-colors hover:bg-[var(--paper-2)]"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[11px]" style={{ background: 'var(--paper-2)', color: 'var(--ink-2)' }}>
                      {r.key === 'csv' ? '⤓' : r.key === 'link' ? '🔗' : r.key === 'image' ? '🖼' : '★'}
                    </span>
                    <span className="flex-1">
                      <span className="block text-[14.5px] font-semibold">{r.title}</span>
                      <span className="block text-[12px]" style={{ color: 'var(--ink-3)' }}>{r.desc}</span>
                    </span>
                    <span style={{ color: 'var(--ink-3)' }}>→</span>
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[16px] font-semibold">Who came · {playersCount}</h3>
                  <span className="chip chip-court" style={{ padding: '3px 9px' }}>{attendance.filter((a) => a.guest).length} guest</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-[7px]">
                  {attendance.map((a) => (
                    <span key={a.name} className="flex items-center gap-[7px] rounded-full py-[5px] pl-[5px] pr-[11px] text-[13px] font-semibold" style={{ background: 'var(--paper-2)' }}>
                      <Face name={a.name} size={26} />
                      {firstName(a.name)}
                      {a.guest ? <span className="mono rounded-[5px] border px-1 text-[8px]" style={{ color: 'var(--court-deep)', borderColor: 'color-mix(in oklch, var(--court) 40%, var(--line))' }}>GUEST</span> : null}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {raffleWinner ? (
              <div className="card p-[18px_20px]">
                <div className="mono text-[10px] uppercase tracking-[.1em]" style={{ color: 'var(--court-deep)' }}>Raffle winner</div>
                <div className="serif mt-1 text-[26px]">{raffleWinner}</div>
              </div>
            ) : null}

            <div className="card p-[18px_20px]">
              <div className="flex items-center gap-3.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/design-handoff/dink/happy-bust.png" alt="" width={52} height={52} style={{ width: 52 }} />
                <div>
                  <div className="text-[15px] font-bold">Same time next week?</div>
                  <div className="text-[12.5px]" style={{ color: 'var(--ink-2)' }}>Clone this setup & invite everyone again.</div>
                </div>
                <button
                  type="button"
                  onClick={() => { toast({ type: 'success', title: 'Event cloned', desc: 'Next week drafted with your roster.' }); router.push('/tournaments/new'); }}
                  className="btn btn-accent btn-sm ml-auto"
                >
                  Clone event
                </button>
              </div>
            </div>

            <div className="text-center text-[12px]" style={{ color: 'var(--ink-3)' }}>
              Invite code · <span className="mono">{formatInviteCode(inviteCode)}</span>
            </div>
          </aside>
        </div>
      </main>
    </DesktopSurface>
  );
}

function HeroStat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[14px] p-[12px_18px]" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', minWidth: 104 }}>
      <div className="mono text-[10px] uppercase tracking-[.12em]" style={{ color: 'rgba(255,255,255,.6)' }}>{label}</div>
      <div className={`${mono ? 'mono font-bold tracking-[-.02em]' : 'serif'} mt-[3px] text-[28px]`}>{value}</div>
    </div>
  );
}

function SecHead({ title, chip }: { title: string; chip?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-[20px] font-semibold">{title}</h2>
      {chip ? <span className="chip">{chip}</span> : null}
    </div>
  );
}

function Tile({ label, value, unit, detail }: { label: string; value: string; unit?: string; detail: string }) {
  return (
    <div className="rounded-[14px] p-[16px_18px]" style={{ background: 'var(--paper-2)' }}>
      <div className="mono text-[10px] uppercase tracking-[.1em]" style={{ color: 'var(--ink-3)' }}>{label}</div>
      <div className="mono mt-1.5 text-[30px] font-bold tracking-[-.03em]">
        {value}
        {unit ? <span className="text-[14px]" style={{ color: 'var(--ink-3)' }}>{unit}</span> : null}
      </div>
      <div className="mt-1 text-[12px]" style={{ color: 'var(--ink-2)' }}>{detail}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[13px] p-6 text-center text-[13px]" style={{ color: 'var(--ink-3)', background: 'var(--paper-2)' }}>
      {children}
    </div>
  );
}
