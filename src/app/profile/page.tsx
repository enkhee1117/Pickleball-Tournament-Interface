import { requireProfile } from '@/lib/auth';
import { saveProfile } from './actions';
import { AvatarUpload } from '@/components/AvatarUpload';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const profile = await requireProfile();
  const sp = await searchParams;

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <div className="card">
        <AvatarUpload userId={profile.id} initialUrl={profile.avatar_url} />
        <p className="mt-3 text-xs text-neutral-500">
          Role: <span className="text-neutral-300">{profile.role}</span>
        </p>
      </div>

      <form action={saveProfile} className="card space-y-4">
        <h1 className="text-xl font-bold">My profile</h1>

        {sp.saved && (
          <div className="rounded border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
            Saved.
          </div>
        )}
        {sp.error && (
          <div className="rounded border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-300">
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
          <p className="text-xs text-neutral-500">
            Tip: paste your DUPR ID — your public DUPR profile lives at
            <span className="font-mono"> dashboard.dupr.com/dashboard/player/&lt;id&gt;</span>.
          </p>
          <button className="btn btn-primary" type="submit">Save</button>
        </div>
      </form>
    </div>
  );
}
