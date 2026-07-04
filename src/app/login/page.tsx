import Link from 'next/link';
import { BallMark } from '@/components/desktop';
import { LoginForm } from './LoginForm';

// Sign in (handoff auth.html): a light split-panel that inherits the
// paper-light landing surface — no light→dark whiplash arriving from the
// front door. Brand story on the left, form on the right. Stacks on mobile.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const signupHref = `/signup${sp.next && sp.next !== '/' ? `?next=${encodeURIComponent(sp.next)}` : ''}`;
  return (
    <div
      data-fullscreen
      className="relative min-h-[100dvh] lg:grid lg:grid-cols-[46%_54%]"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      {/* LEFT — brand panel */}
      <div
        className="relative flex flex-col justify-between gap-10 overflow-hidden p-8 lg:p-14"
        style={{
          background: 'linear-gradient(160deg, color-mix(in oklch, var(--court) 16%, var(--paper)), var(--paper) 70%)',
          borderRight: '1px solid var(--line)',
        }}
      >
        <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, oklch(0.55 0.2 25) 0 40%, #fff 40% 60%, oklch(0.42 0.14 258) 60%)' }} />
        {/* court motif */}
        <svg className="pointer-events-none absolute -right-24 top-1/2 h-[360px] w-[360px] -translate-y-1/2 opacity-10" viewBox="0 0 32 32" fill="none" aria-hidden>
          <rect x="6" y="6" width="20" height="20" rx="3" transform="rotate(45 16 16)" stroke="var(--court-deep)" strokeWidth="1.2" />
          <line x1="16" y1="3.5" x2="16" y2="28.5" stroke="var(--court-deep)" strokeWidth="1.2" strokeDasharray="1.5 1.8" />
          <circle cx="11" cy="20" r="2.2" fill="var(--court)" />
          <circle cx="21" cy="12" r="2.2" fill="var(--court)" />
        </svg>

        <div className="relative flex items-center gap-2.5">
          <BallMark size={30} />
          <span className="serif text-[24px]">Try to Dink</span>
          <span className="mono rounded-md px-2 py-[3px] text-[10px] font-bold text-white" style={{ background: 'oklch(0.55 0.2 25)' }}>
            ★ 250
          </span>
        </div>

        <div className="relative">
          <div className="eyebrow mb-4">Mixed doubles, reinvented</div>
          <h1 className="serif text-[42px] leading-none tracking-[-0.01em] sm:text-[60px]">
            Run the room,
            <br />
            not a <span className="italic" style={{ color: 'var(--court-deep)' }}>spreadsheet.</span>
          </h1>
          <p className="mt-5 max-w-[24em] text-[16px] leading-relaxed text-ink-2">
            Spin up a mixer, invite by link, and let the live draw do the talking. You&apos;re two taps from a full night.
          </p>
        </div>

        <div className="relative">
          <div className="flex items-center gap-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/design-handoff/dink/coach.png" alt="" width={80} height={80} style={{ width: 80, height: 80, objectFit: 'contain' }} />
            <span className="serif text-[14px] italic text-ink-3">&ldquo;Welcome back — the courts missed you.&rdquo;</span>
          </div>
          <div className="mt-5 flex gap-4 text-[12.5px] text-ink-3">
            <span>© Try to Dink</span>
            <span>Privacy</span>
            <span>Terms</span>
          </div>
        </div>
      </div>

      {/* RIGHT — form panel */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[420px]">
          {sp.ok && (
            <div className="mb-4 rounded-2xl px-3.5 py-2.5 text-sm" style={{ background: 'color-mix(in oklch, var(--court) 20%, white)', color: 'var(--court-deep)' }}>
              {sp.ok}
            </div>
          )}
          <h2 className="serif text-[34px] leading-none sm:text-[38px]">Welcome back.</h2>
          <div className="mb-6 mt-2.5 text-[15px] text-ink-2">Sign in to run and join your events.</div>

          <LoginForm next={sp.next ?? '/'} />

          <div className="mt-5 text-center text-[14px] text-ink-2">
            New here?{' '}
            <Link href={signupHref} className="font-semibold" style={{ color: 'var(--court-deep)' }}>
              Create an account
            </Link>
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 border-t pt-5 text-[14px] text-ink-2" style={{ borderColor: 'var(--line)' }}>
            Just here to play?
            <Link href="/join" className="inline-flex items-center gap-1.5 font-semibold text-ink">
              I have an invite code →
            </Link>
          </div>
          <div className="mt-4 text-center text-[11px] text-ink-3">By continuing you agree to our terms. We don&rsquo;t spam.</div>
        </div>
      </div>
    </div>
  );
}
