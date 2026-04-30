import { requireProfile } from '@/lib/auth';

// The original vanilla-JS scoreboard lives in /public/legacy/index.html and
// uses Firebase Realtime DB for sync. We embed it here while we migrate the
// scoring logic into Next.js components.
export default async function ScoreboardPage() {
  await requireProfile();
  return (
    <div className="-mx-4 -my-6 h-[calc(100vh-3rem)]">
      <iframe
        src="/legacy/index.html"
        title="MLP Scoreboard (legacy)"
        className="h-full w-full border-0"
      />
    </div>
  );
}
