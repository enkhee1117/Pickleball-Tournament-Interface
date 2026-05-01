import { getProfile } from '@/lib/auth';
import { saveProfile } from './actions';
import { AvatarUpload } from '@/components/AvatarUpload';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const profile = await getProfile();
  const sp = await searchParams;

  if (!profile) {
    return (
      <div className="card mx-auto mt-12 max-w-xl p-6">
        <h1 className="font-display text-2xl font-bold">Profile</h1>
        <p className="mt-2 text-sm text-text-muted">
          Sign in to view and edit your TourneyPal profile.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <div className="card">
        <AvatarUpload userId={profile.id} initialUrl={profile.avatar_url} />
        <p className="mt-3 text-xs text-text-muted">
          Role: <span className="text-slate-200">{profile.role}</span>
        </p>
      </div>

      <form action={saveProfile} className="card space-y-4">
        <h1 className="font-display text-xl font-bold">My profile</h1>

        {sp.saved && (
          <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-emerald-300">
            Saved.
          </div>
        )}
        {sp.error && (
          <div className="rounded-md border border-error/40 bg-error/10 px-3 py-2 text-sm text-red-300">
            {sp.error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Display name</label>
            <input className="input" name="display_name" defaultValue={profile.display_name ?? ''} required />
          </div>
          <div>
            <label className="label">Full name</label>
            <input className="input" name="full_name" defaultValue={profile.full_name ?? ''} />
          </div>
          <div>
            <label className="label">Gender (for mixed-doubles assignments)</label>
            <select className="input" name="gender" defaultValue={profile.gender ?? ''}>
              <option value="">—</option>
              <option value="m">Male</option>
              <option value="f">Female</option>
              <option value="x">Other / prefer not to say</option>
            </select>
          </div>
          <div>
            <label className="label">DUPR ID</label>
            <input className="input" name="dupr_id" placeholder="e.g. 1234567" defaultValue={profile.dupr_id ?? ''} />
          </div>
          <div>
            <label className="label">DUPR singles</label>
            <input className="input" name="dupr_singles" type="number" step="0.001" min="2" max="8"
                   defaultValue={profile.dupr_singles ?? ''} />
          </div>
          <div>
            <label className="label">DUPR doubles</label>
            <input className="input" name="dupr_doubles" type="number" step="0.001" min="2" max="8"
                   defaultValue={profile.dupr_doubles ?? ''} />
          </div>
        </div>

        <div>
          <label className="label">Bio</label>
          <textarea className="input min-h-24" name="bio" defaultValue={profile.bio ?? ''} maxLength={500} />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            Tip: paste your DUPR ID — your public DUPR profile lives at
            <span className="font-mono"> dashboard.dupr.com/dashboard/player/&lt;id&gt;</span>.
          </p>
          <button className="btn btn-primary" type="submit">Save</button>
        </div>
      </form>
    </div>
  );
}
