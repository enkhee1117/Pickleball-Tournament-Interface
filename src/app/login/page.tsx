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
        <div className="serif text-[56px] leading-[0.95] tracking-[-0.03em]">
          Run a
          <br />
          tournament
          <br />
          <span className="italic" style={{ color: 'var(--court)' }}>in 90 seconds.</span>
        </div>
        <div className="mt-[18px] max-w-[280px] text-[15px] leading-[1.45] opacity-70">
          Round robin, fixed partners, brackets. Skill-balanced auto-pairings. WhatsApp updates. Less spreadsheet, more pickleball.
        </div>

        {sp.ok && (
          <div
            className="mt-5 rounded-2xl px-3.5 py-2.5 text-sm"
            style={{ background: 'oklch(0.28 0.04 140)', color: 'var(--court)' }}
          >
            {sp.ok}
          </div>
        )}

        <LoginForm next={sp.next ?? '/'} />

        <Link
          href="/join"
          className="mt-2 block rounded-2xl py-3.5 text-center text-sm font-medium opacity-70"
        >
          I have an invite code →
        </Link>

        <div className="mt-2 flex items-center justify-between text-[11px] opacity-60">
          <Link href="/forgot-password" className="hover:opacity-100">
            Forgot password?
          </Link>
          <Link
            href={`/signup${sp.next && sp.next !== '/' ? `?next=${encodeURIComponent(sp.next)}` : ''}`}
            className="hover:opacity-100"
          >
            New here? Create an account
          </Link>
        </div>

        <div className="mt-3.5 text-center text-[11px] opacity-40">
          By continuing you agree to our terms. We don&rsquo;t spam.
        </div>
      </div>
    </div>
  );
}
