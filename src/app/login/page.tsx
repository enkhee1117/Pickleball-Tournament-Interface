import Link from 'next/link';
import { BallMark } from '@/components/desktop';
import { LoginForm } from './LoginForm';

// Sign in (handoff auth.html): the fixed dark-galaxy onboarding surface — a
// full-bleed galaxy scene with a frosted glass form card, the DINK wordmark,
// and the Liberty 250 chrome. This is one of the intentional always-dark
// surfaces (per DESIGN.md screen 1), independent of the user's theme.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const signupHref = `/signup${sp.next && sp.next !== '/' ? `?next=${encodeURIComponent(sp.next)}` : ''}`;
  return (
    <div data-fullscreen className="relative min-h-[100dvh] overflow-x-hidden" style={{ background: 'oklch(0.14 0.07 275)', color: '#fff' }}>
      {/* ── galaxy scene ── */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <div
          className="absolute"
          style={{
            inset: '-4%',
            background: "url('/design-handoff/scenes/galaxy-bg.png') center/cover no-repeat",
            transform: 'scale(1.06)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(105deg, oklch(0.11 0.06 270 / .93) 0%, oklch(0.13 0.07 274 / .78) 34%, oklch(0.14 0.08 278 / .32) 60%, transparent 82%), linear-gradient(0deg, oklch(0.1 0.05 270 / .72), transparent 40%)',
          }}
        />
        <div className="ttd-stars absolute inset-0" />
      </div>

      {/* Liberty 250 top rule */}
      <div
        className="fixed inset-x-0 top-0 z-[3] h-[3px]"
        style={{ background: 'linear-gradient(90deg, oklch(0.55 0.2 25) 0 40%, #fff 40% 60%, oklch(0.42 0.14 258) 60%)' }}
      />

      {/* ── stage ── */}
      <div className="relative z-[2] grid min-h-[100dvh] items-center gap-10 px-7 py-12 lg:grid-cols-[1.02fr_0.98fr] lg:px-[clamp(28px,5vw,84px)]">
        {/* BRAND — hidden on small screens (form stands alone) */}
        <div className="ttd-brand hidden max-w-[520px] lg:block">
          <span
            className="mono inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-[0.08em]"
            style={{ background: 'linear-gradient(90deg, oklch(0.55 0.2 25 / .85), oklch(0.42 0.14 258 / .85))', border: '1px solid rgba(255,255,255,.28)' }}
          >
            <b style={{ color: 'oklch(0.86 0.14 90)' }}>★ 250</b> · Celebrating America&rsquo;s 250th
          </span>

          <div className="mt-[22px] leading-[.82]">
            <span className="disp block text-[clamp(22px,3vw,36px)] font-extrabold tracking-[0.03em]" style={{ textShadow: '0 2px 0 rgba(0,0,0,.25)' }}>
              WELCOME BACK TO
            </span>
            <span className="ttd-dink disp inline-block text-[clamp(60px,8vw,104px)] font-black tracking-[-0.01em]">DINK</span>
          </div>

          <p className="mt-4 max-w-[24em] text-[clamp(15px,1.6vw,18px)] leading-[1.55]" style={{ color: 'rgba(255,255,255,.82)' }}>
            The pickleball galaxy is warmed up and waiting. Vote for partners, lock the ballot, and watch the draw drop live.
          </p>

          <div className="mt-[30px] flex items-center gap-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/design-handoff/characters/hype.png" alt="" width={74} height={74} style={{ width: 74, filter: 'drop-shadow(0 12px 20px rgba(0,0,0,.5))' }} />
            <span className="serif text-[16px] italic" style={{ color: 'rgba(255,255,255,.75)' }}>&ldquo;The courts missed you.&rdquo;</span>
          </div>
        </div>

        {/* FORM — glass card */}
        <div className="flex justify-center">
          <div
            className="ttd-card w-full max-w-[426px] rounded-[26px] p-[36px_34px]"
            style={{
              background: 'oklch(0.17 0.05 272 / .62)',
              backdropFilter: 'blur(18px) saturate(1.1)',
              WebkitBackdropFilter: 'blur(18px) saturate(1.1)',
              border: '1px solid rgba(255,255,255,.14)',
              boxShadow: '0 40px 90px -34px #000, inset 0 1px 0 rgba(255,255,255,.06)',
            }}
          >
            <div className="mb-[22px] flex items-center gap-2.5">
              <BallMark size={30} />
              <span className="serif text-[20px]">Try to Dink</span>
            </div>

            <h1 className="serif text-[36px] leading-none">Welcome back.</h1>
            <div className="mb-6 mt-2.5 text-[14.5px]" style={{ color: 'rgba(255,255,255,.7)' }}>
              Sign in to run and join your events.
            </div>


            <LoginForm next={sp.next ?? '/'} />

            <div className="mt-[18px] text-center text-[14px]" style={{ color: 'rgba(255,255,255,.7)' }}>
              New here?{' '}
              <Link href={signupHref} className="font-semibold text-white hover:text-[oklch(0.82_0.17_140)]">
                Create an account
              </Link>
            </div>
            <div
              className="mt-5 flex items-center justify-center gap-2 border-t pt-[18px] text-[14px]"
              style={{ borderColor: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.7)' }}
            >
              Just here to play?
              <Link href="/join" className="inline-flex items-center gap-1.5 font-semibold text-white">
                I have an invite code
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 12h13M12 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <footer className="fixed inset-x-0 bottom-4 z-[2] flex justify-center gap-[18px] text-[12px]" style={{ color: 'rgba(255,255,255,.45)' }}>
        <span>© Try to Dink</span>
        <Link href="#" className="hover:text-white">Privacy</Link>
        <Link href="#" className="hover:text-white">Terms</Link>
      </footer>

      <style>{`
        .ttd-stars {
          opacity: .8;
          background-image:
            radial-gradient(1.4px 1.4px at 18% 24%, #fff, transparent),
            radial-gradient(1.4px 1.4px at 66% 16%, #fff, transparent),
            radial-gradient(1px 1px at 40% 58%, rgba(255,255,255,.8), transparent),
            radial-gradient(1.8px 1.8px at 12% 72%, #fff, transparent),
            radial-gradient(1px 1px at 30% 40%, rgba(255,255,255,.7), transparent);
          animation: ttdTwinkle 6s ease-in-out infinite;
        }
        @keyframes ttdTwinkle { 0%,100%{opacity:.55} 50%{opacity:.95} }
        .ttd-dink {
          background: linear-gradient(180deg,#eaffa8 0%, oklch(0.82 0.17 140) 44%, oklch(0.62 0.2 150) 100%);
          -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 6px 0 oklch(0.32 0.12 150)) drop-shadow(0 14px 24px rgba(0,0,0,.5));
        }
        .ttd-brand > *, .ttd-card { animation: ttdRise .7s cubic-bezier(.2,.7,.3,1) both; }
        .ttd-brand > *:nth-child(2){ animation-delay:.08s } .ttd-brand > *:nth-child(3){ animation-delay:.16s } .ttd-brand > *:nth-child(4){ animation-delay:.24s }
        .ttd-card { animation-delay:.1s; }
        @keyframes ttdRise { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:none} }
        @media (prefers-reduced-motion: reduce) { .ttd-stars, .ttd-brand > *, .ttd-card { animation: none; } }
      `}</style>
    </div>
  );
}
