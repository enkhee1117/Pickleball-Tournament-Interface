import Link from 'next/link';
import { TPMark } from '@/components/ui/TPMark';
import { LoginForm } from './LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div
      data-fullscreen="ink"
      className="relative flex min-h-[100dvh] flex-1 flex-col overflow-hidden lg:flex-row"
      style={{ background: 'var(--ink)', color: 'var(--paper)' }}
    >
      {/* Court motif — top-right on mobile, larger and left-of-center on desktop. */}
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

      {/* Brand column — top region on mobile, left half on desktop. */}
      <div className="relative flex flex-col lg:flex-1 lg:justify-between lg:p-16">
        <div className="px-[22px] pt-7 lg:p-0">
          <TPMark size={36} color="var(--paper)" accent="var(--court)" />
        </div>
        <div className="relative flex flex-1 flex-col justify-end px-[22px] pb-0 pt-6 lg:flex-none lg:px-0 lg:pt-16">
          <div className="serif text-[56px] leading-[0.95] tracking-[-0.03em] lg:text-[88px]">
            Run a
            <br />
            tournament
            <br />
            <span className="italic" style={{ color: 'var(--court)' }}>without spreadsheets.</span>
          </div>
          <div className="mt-[18px] max-w-[280px] text-[15px] leading-[1.45] opacity-70 lg:max-w-[440px] lg:text-lg">
            Mixers, round robins, fixed partners, and brackets. Invite players, run the room, and keep the night moving.
          </div>
        </div>
      </div>

      {/* Form column — bottom on mobile, right ~ 520px card on desktop. */}
      <div
        className="relative flex flex-col p-[22px] lg:w-[560px] lg:justify-center lg:border-l lg:p-16"
        style={{ borderColor: 'oklch(0.28 0.03 100)' }}
      >
        {sp.ok && (
          <div
            className="mb-4 rounded-2xl px-3.5 py-2.5 text-sm"
            style={{ background: 'oklch(0.28 0.04 140)', color: 'var(--court)' }}
          >
            {sp.ok}
          </div>
        )}

        <LoginForm next={sp.next ?? '/'} />

        <Link
          href={`/signup${sp.next && sp.next !== '/' ? `?next=${encodeURIComponent(sp.next)}` : ''}`}
          className="mt-3 block rounded-2xl py-[18px] text-center text-base font-semibold tracking-tight transition active:scale-[0.97]"
          style={{
            background: 'transparent',
            color: 'var(--paper)',
            border: '1.5px solid var(--court)',
          }}
        >
          New here? Create an account
        </Link>

        <Link
          href="/join"
          className="mt-2 block rounded-2xl py-3.5 text-center text-sm font-medium opacity-70"
        >
          I have an invite code →
        </Link>

        <Link
          href="/forgot-password"
          className="mt-1 block text-center text-xs font-medium opacity-50 hover:opacity-80"
        >
          Forgot password?
        </Link>

        <div className="mt-3.5 text-center text-[11px] opacity-40">
          By continuing you agree to our terms. We don&rsquo;t spam.
        </div>
      </div>
    </div>
  );
}
