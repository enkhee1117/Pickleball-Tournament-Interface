import Link from 'next/link';
import { getProfile } from '@/lib/auth';
import { TopBar } from '@/components/ui/TopBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
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

  if (!profile) {
    return (
      <div className="flex min-h-full flex-col bg-paper">
        <TopBar title="Profile" />
        <div className="px-[18px] pt-2">
          <div
            className="rounded-2xl bg-white p-5 text-center"
            style={{ border: '1px solid var(--line)' }}
          >
            <div className="text-[15px] font-semibold text-ink">Sign in to set up your profile</div>
            <div className="mt-1.5 text-xs text-ink-3">
              You can browse anything public, but DUPR sync and saved settings need an account.
            </div>
            <Link
              href="/login"
              className="mt-3.5 inline-block rounded-2xl px-5 py-3 text-[13px] font-semibold"
              style={{ background: 'var(--ink)', color: 'var(--paper)' }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
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
    <div className="flex min-h-full flex-col bg-paper">
      <TopBar
        title=""
        right={
          <Link
            href="/profile?edit=1"
            aria-label="Edit"
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ color: 'var(--ink)' }}
          >
            {Icons.more}
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto px-[18px] pb-24">
        {sp.saved && (
          <div
            className="mb-3 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--court-deep)', color: 'var(--court-deep)', background: 'oklch(0.96 0.04 140)' }}
          >
            Saved.
          </div>
        )}
        {sp.error && (
          <div
            className="mb-3 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--berry)', color: 'var(--berry)', background: 'oklch(0.96 0.04 12)' }}
          >
            {sp.error}
          </div>
        )}

        <div className="text-center pt-1 pb-[18px]">
          <Avatar player={player} size={110} />
          <div className="serif mt-3 text-[30px] leading-[1.1] text-ink">{displayName}</div>
          <div className="mt-1 text-xs text-ink-3">
            @{handle} · Member since {new Date(profile.created_at).getFullYear()}
          </div>
          <div className="mt-3 flex justify-center gap-2">
            {dupr ? <Chip tone="court">DUPR {dupr.toFixed(2)}</Chip> : <Chip tone="ghost">No DUPR yet</Chip>}
            <Chip tone="ghost">{capitalize(profile.role)}</Chip>
          </div>
        </div>

        <SectionHeader title="DUPR profile" mute="Synced from dupr.com" />
        <div
          className="mb-[18px] rounded-[18px] p-4"
          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
        >
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[11px] tracking-[0.06em] opacity-60">DOUBLES</div>
              <div
                className="mono text-[36px] font-bold tracking-tight"
                style={{ color: 'var(--court)', letterSpacing: '-0.02em' }}
              >
                {dupr ? dupr.toFixed(2) : '—'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] tracking-[0.06em] opacity-60">SINGLES</div>
              <div className="mono text-[24px] font-semibold opacity-70">
                {duprSingles ? duprSingles.toFixed(2) : '—'}
              </div>
            </div>
          </div>
          {!dupr && !duprSingles && (
            <div className="mt-3 text-[11px] opacity-60">
              Add your DUPR ID below to sync ratings.
            </div>
          )}
        </div>

        <SectionHeader title="Appearance" />
        <div className="mb-[18px]">
          <ThemeSwitcher />
        </div>

        <SectionHeader title="Settings" />
        <div
          className="overflow-hidden rounded-2xl bg-white"
          style={{ border: '1px solid var(--line)' }}
        >
          <SettingRow href="/profile?edit=1" label="Display name" value={profile.display_name ?? '—'} />
          <SettingRow
            href="/profile?edit=1"
            label="Gender for mixed doubles"
            value={genderLabel(profile.gender)}
          />
          <SettingRow
            href="/profile?edit=1"
            label="DUPR ID"
            value={profile.dupr_id ?? '—'}
          />
          <SettingRow href="/profile?edit=1" label="Bio" value={profile.bio ? '✏️ Edit' : 'Add a line'} />
          <form action="/auth/signout" method="post" className="contents">
            <button
              type="submit"
              className="flex w-full items-center justify-between px-4 py-3.5 text-left"
              style={{ borderTop: '1px solid var(--line)' }}
            >
              <div className="text-sm font-semibold" style={{ color: 'var(--berry)' }}>
                Sign out
              </div>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-4 py-3.5"
      style={{ borderBottom: '1px solid var(--line)' }}
    >
      <div className="text-sm font-medium text-ink">{label}</div>
      <div className="flex items-center gap-1.5 text-[13px] text-ink-3">
        <span className="max-w-[160px] truncate">{value}</span>
        {Icons.arrow}
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
