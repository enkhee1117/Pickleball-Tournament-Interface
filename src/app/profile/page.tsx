import Link from 'next/link';
import { cookies } from 'next/headers';
import { getProfile } from '@/lib/auth';
import { THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';
import { DesktopNav, DesktopSurface } from '@/components/desktop';
import { Chip } from '@/components/ui/Chip';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { Icons } from '@/components/ui/icons';
import { ProfileForm } from './ProfileForm';
import { saveProfile } from './actions';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; edit?: string }>;
}) {
  const profile = await getProfile();
  const sp = await searchParams;
  const editing = sp.edit === '1';
  const cookieStore = await cookies();
  const theme = readThemeFromCookie(cookieStore.get(THEME_COOKIE)?.value);

  if (!profile) {
    return (
      <DesktopSurface withCommandBar>
        <DesktopNav theme={theme} active="Me" />
        <main id="main" className="mx-auto w-full max-w-[520px] px-4 pt-10">
          <div className="rounded-2xl bg-white p-6 text-center" style={{ border: '1px solid var(--line)' }}>
            <div className="text-[15px] font-semibold text-ink">Sign in to set up your profile</div>
            <div className="mt-1.5 text-xs text-ink-3">You can browse anything public, but DUPR sync and saved settings need an account.</div>
            <Link href="/login" className="mt-3.5 inline-block rounded-2xl px-5 py-3 text-[13px] font-semibold" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
              Sign in
            </Link>
          </div>
        </main>
      </DesktopSurface>
    );
  }

  if (editing) {
    return <ProfileForm profile={profile} saveAction={saveProfile} />;
  }

  const displayName = profile.display_name ?? 'Player';
  const player = playerFromName(displayName, profile.avatar_url);
  const handle = displayName.toLowerCase().split(' ').filter(Boolean)[0] ?? 'player';
  const dupr = profile.dupr_doubles;
  const duprSingles = profile.dupr_singles;

  return (
    <DesktopSurface withCommandBar>
      <DesktopNav theme={theme} active="Me" />
      <main id="main" className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-7 sm:px-6 lg:px-8">
        {sp.saved && (
          <div className="mb-4 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--court-deep)', color: 'var(--court-deep)', background: 'oklch(0.96 0.04 140)' }}>
            Saved.
          </div>
        )}
        {sp.error && (
          <div className="mb-4 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--berry)', color: 'var(--berry)', background: 'oklch(0.96 0.04 12)' }}>
            {sp.error}
          </div>
        )}

        {/* hero */}
        <div className="mb-7 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:text-left">
          <Avatar player={player} size={110} ring />
          <div className="text-center sm:text-left">
            <h1 className="serif text-[34px] leading-none text-ink sm:text-[44px]">{displayName}</h1>
            <div className="mt-2 text-sm text-ink-3">
              @{handle} · Member since {new Date(profile.created_at).getFullYear()}
            </div>
            <div className="mt-3.5 flex flex-wrap justify-center gap-2 sm:justify-start">
              {dupr ? <Chip tone="court">{dupr.toFixed(2)} DUPR</Chip> : <Chip tone="ghost">No DUPR yet</Chip>}
              <Chip tone="ghost">{capitalize(profile.role)}</Chip>
            </div>
          </div>
          <Link
            href="/profile?edit=1"
            className="rounded-btn border px-5 py-3 text-sm font-semibold sm:ml-auto"
            style={{ borderColor: 'var(--line)', color: 'var(--ink)', background: 'white' }}
          >
            Edit profile
          </Link>
        </div>

        {/* two-column */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
          {/* LEFT */}
          <div className="flex flex-col gap-4">
            {/* DUPR card */}
            <div className="rounded-[18px] p-6" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[15px] font-semibold">DUPR rating</h3>
                {profile.dupr_id ? (
                  <span className="chip" style={{ background: 'rgba(255,255,255,.12)', borderColor: 'rgba(255,255,255,.2)', color: '#fff' }}>
                    Verified
                  </span>
                ) : (
                  <span className="chip" style={{ background: 'rgba(255,255,255,.08)', borderColor: 'rgba(255,255,255,.16)', color: 'rgba(255,255,255,.7)' }}>
                    Not linked
                  </span>
                )}
              </div>
              <div className="flex items-end gap-8">
                <div>
                  <div className="mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'rgba(255,255,255,.55)' }}>Doubles</div>
                  <div className="mono text-[44px] font-bold tracking-[-0.03em]" style={{ color: 'var(--court)' }}>{dupr ? dupr.toFixed(2) : '—'}</div>
                </div>
                <div>
                  <div className="mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'rgba(255,255,255,.55)' }}>Singles</div>
                  <div className="mono text-[30px] font-semibold" style={{ color: 'rgba(255,255,255,.85)' }}>{duprSingles ? duprSingles.toFixed(2) : '—'}</div>
                </div>
              </div>
              <div className="mt-4 text-[13px]" style={{ color: 'rgba(255,255,255,.7)' }}>
                {profile.dupr_id ? 'Synced from dupr.com — updates after each rated event.' : 'Add your DUPR ID below to sync ratings automatically.'}
              </div>
            </div>

            {/* Season stats → real aggregates live in the trophy case */}
            <Link
              href="/history"
              className="flex items-center justify-between rounded-[18px] bg-white p-5"
              style={{ border: '1px solid var(--line)' }}
            >
              <div>
                <div className="text-[15px] font-semibold text-ink">Season stats &amp; trophy case</div>
                <div className="mt-1 text-[13px] text-ink-3">Wins, titles, recent form, and best partners — in Stats.</div>
              </div>
              <span className="text-ink-3">{Icons.arrow}</span>
            </Link>
          </div>

          {/* RIGHT — settings */}
          <div className="rounded-[18px] bg-white p-6" style={{ border: '1px solid var(--line)' }}>
            <h3 className="mb-2 text-[15px] font-semibold text-ink">Settings</h3>
            <SettingRow href="/profile?edit=1" label="Display name" value={profile.display_name ?? '—'} />
            <SettingRow href="/profile?edit=1" label="Gender for mixed doubles" desc="Used to balance mixed pairings." value={genderLabel(profile.gender)} />
            <SettingRow href="/profile?edit=1" label="DUPR ID" desc="Link your rating to auto-sync." value={profile.dupr_id ?? '—'} hint="XXXX-00" />
            <SettingRow href="/profile?edit=1" label="Bio" value={profile.bio ? profile.bio : 'Add a line'} />
            <div className="border-b py-4" style={{ borderColor: 'var(--line)' }}>
              <div className="mb-2.5 text-[14.5px] font-semibold text-ink">Theme</div>
              <ThemeSwitcher />
            </div>
            <form action="/auth/signout" method="post" className="pt-4">
              <button type="submit" className="text-sm font-semibold text-ink-2 hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </main>
    </DesktopSurface>
  );
}

function SettingRow({ href, label, value, desc, hint }: { href: string; label: string; value: string; desc?: string; hint?: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-4 border-b py-3.5" style={{ borderColor: 'var(--line)' }}>
      <div>
        <div className="text-[14.5px] font-semibold text-ink">{label}</div>
        {desc && <div className="mt-0.5 text-[12.5px] text-ink-3">{desc}</div>}
      </div>
      <div className="flex items-center gap-2 text-[14px] text-ink-2">
        {hint && (
          <span className="mono rounded-md px-1.5 py-0.5 text-[10px]" style={{ background: 'color-mix(in oklch, var(--court) 12%, transparent)', color: 'var(--court-deep)' }}>
            {hint}
          </span>
        )}
        <span className="max-w-[180px] truncate">{value}</span>
        <span className="text-ink-3">{Icons.arrow}</span>
      </div>
    </Link>
  );
}

function genderLabel(g: 'm' | 'f' | 'x' | null): string {
  if (g === 'm') return 'Male';
  if (g === 'f') return 'Female';
  if (g === 'x') return 'Other';
  return '—';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
