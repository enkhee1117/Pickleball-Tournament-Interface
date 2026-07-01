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
      data-fullscreen="ink"
      className="relative flex min-h-[100dvh] flex-1 flex-col overflow-hidden lg:flex-row"
      style={{ background: 'var(--ink)', color: 'var(--paper)' }}
    >
      <svg
        className="pointer-events-none absolute -right-[60px] -top-[40px] h-[380px] w-[380px] opacity-20 lg:right-auto lg:top-1/2 lg:left-[36%] lg:h-[560px] lg:w-[560px] lg:-translate-y-1/2 lg:opacity-15"
        viewBox="0 0 200 200"
        aria-hidden
      >
        <rect x="20" y="20" width="160" height="160" stroke="var(--court)" strokeWidth="1.5" fill="none" />
        <line x1="20" y1="100" x2="180" y2="100" stroke="var(--court)" strokeWidth="1" strokeDasharray="3 3" />
        <line x1="60" y1="20" x2="60" y2="180" stroke="var(--court)" strokeWidth="1" />
        <line x1="140" y1="20" x2="140" y2="180" stroke="var(--court)" strokeWidth="1" />
      </svg>

      <div className="relative flex flex-col lg:flex-1 lg:justify-between lg:p-16">
        <div className="px-[22px] pt-7 lg:p-0">
          <TPMark size={36} color="var(--paper)" accent="var(--court)" />
        </div>
        <div className="relative flex flex-1 flex-col justify-end px-[22px] pb-0 pt-6 lg:flex-none lg:px-0 lg:pt-16">
          <div className="serif text-[48px] leading-[0.95] tracking-[-0.03em] lg:text-[80px]">
            Make a name
            <br />
            <span className="italic" style={{ color: 'var(--court)' }}>for yourself.</span>
          </div>
          <div className="mt-[14px] max-w-[280px] text-[14px] leading-[1.45] opacity-70 lg:max-w-[440px] lg:text-lg">
            Join Try to Dink to run tournaments, manage players, and track match history.
          </div>
        </div>
      </div>

      <div
        className="relative flex flex-col p-[22px] lg:w-[560px] lg:justify-center lg:border-l lg:p-16"
        style={{ borderColor: 'oklch(0.28 0.03 100)' }}
      >
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
