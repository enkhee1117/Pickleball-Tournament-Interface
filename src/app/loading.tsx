// Global fallback for routes that render inside the 480px mobile shell and
// don't ship their own loading.tsx — the auth/join flows (login, signup,
// forgot/reset-password, join). Home and every desktop surface now provide
// their own data-fullscreen fallback (see (home)/loading.tsx and the section
// loading files), so this stays deliberately mobile-shaped and neutral: a
// desktop fallback here would flash those phone-width pages the other way.
export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-paper px-5 pt-10">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="h-7 w-40 animate-pulse rounded-md bg-paper-2" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded bg-paper-2" />
        <div className="mt-7 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-white" style={{ border: '1px solid var(--line)' }} />
          ))}
          <div className="mt-2 h-12 animate-pulse rounded-xl bg-paper-2" />
        </div>
      </div>
    </div>
  );
}
