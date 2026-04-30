import Link from 'next/link';
import { getProfile } from '@/lib/auth';

export default async function HomePage() {
  const profile = await getProfile();

  if (!profile) {
    return (
      <div className="card max-w-xl">
        <h1 className="text-2xl font-bold">MLP Scoreboard</h1>
        <p className="mt-2 text-neutral-400">
          Invite-only league scoreboard, player profiles, realtime chat. Sign in to continue.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/login" className="btn btn-primary">Sign in</Link>
          <Link href="/legacy/index.html" className="btn btn-ghost">Public scoreboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link href="/scoreboard" className="card hover:border-neutral-600">
        <h2 className="text-lg font-bold">Scoreboard</h2>
        <p className="mt-1 text-sm text-neutral-400">Live tournament play.</p>
      </Link>
      <Link href="/chat" className="card hover:border-neutral-600">
        <h2 className="text-lg font-bold">Chat</h2>
        <p className="mt-1 text-sm text-neutral-400">Talk with other players in realtime.</p>
      </Link>
      <Link href="/profile" className="card hover:border-neutral-600">
        <h2 className="text-lg font-bold">My profile</h2>
        <p className="mt-1 text-sm text-neutral-400">Avatar, DUPR rating, gender, bio.</p>
      </Link>
      {(profile.role === 'admin' || profile.role === 'organizer') && (
        <Link href="/admin" className="card hover:border-neutral-600">
          <h2 className="text-lg font-bold">Admin</h2>
          <p className="mt-1 text-sm text-neutral-400">Invite players, manage roles.</p>
        </Link>
      )}
    </div>
  );
}
