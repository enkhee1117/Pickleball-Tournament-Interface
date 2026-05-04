import Link from 'next/link';
import { TPMark } from '@/components/ui/TPMark';
import { SignupForm } from './SignupForm';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next ?? '/';
  return (
    <div
      className="relative flex min-h-[100dvh] flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--ink)', color: 'var(--paper)' }}
    >
      <svg
        className="pointer-events-none absolute -right-[60px] -top-[40px] opacity-20"
        width="380"
        height="380"
        viewBox="0 0 200 200"
        aria-hidden
      >
        <rect x="20" y="20" width="160" height="160" stroke="var(--court)" strokeWidth="1.5" fill="none" />
        <line x1="20" y1="100" x2="180" y2="100" stroke="var(--court)" strokeWidth="1" strokeDasharray="3 3" />
        <line x1="60" y1="20" x2="60" y2="180" stroke="var(--court)" strokeWidth="1" />
        <line x1="140" y1="20" x2="140" y2="180" stroke="var(--court)" strokeWidth="1" />
      </svg>

      <div className="px-[22px] pt-7">
        <TPMark size={36} color="var(--paper)" accent="var(--court)" />
      </div>

      <div className="relative flex flex-1 flex-col justify-end p-[22px]">
        <div className="serif text-[48px] leading-[0.95] tracking-[-0.03em]">
          Make a name
          <br />
          <span className="italic" style={{ color: 'var(--court)' }}>for yourself.</span>
        </div>
        <div className="mt-[14px] max-w-[280px] text-[14px] leading-[1.45] opacity-70">
          Join TourneyPal to run tournaments, manage players, and track match history.
        </div>

        <SignupForm next={next} />

        <p className="mt-3.5 text-center text-[12px] opacity-60">
          Already have an account?{' '}
          <Link
            href={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="font-semibold opacity-100"
            style={{ color: 'var(--court)' }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
