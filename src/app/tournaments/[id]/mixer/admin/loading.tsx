// Cockpit skeleton. data-fullscreen matters: without it the 480px mobile
// shell frames this skeleton during navigation, so the cockpit appeared to
// load "as a phone page" and then jump to desktop.
export default function Loading() {
  return (
    <div data-fullscreen className="min-h-[100dvh]" style={{ background: 'var(--bg, var(--paper))' }}>
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)]">
        <div className="hidden gap-2 p-4 lg:flex lg:flex-col">
          <div className="h-8 w-36 animate-pulse rounded-lg bg-paper-2" />
          <div className="mt-2 h-16 animate-pulse rounded-2xl bg-paper-2" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-xl bg-paper-2" />
          ))}
        </div>
        <div className="min-w-0 px-5 pb-24 pt-6 lg:px-7">
          <div className="h-12 animate-pulse rounded-2xl bg-paper-2" />
          <div className="mt-4 grid gap-[18px] xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="h-64 animate-pulse rounded-[18px] bg-paper-2" />
              <div className="h-56 animate-pulse rounded-[18px] bg-paper-2" />
            </div>
            <div className="space-y-4">
              <div className="h-40 animate-pulse rounded-[18px] bg-paper-2" />
              <div className="h-52 animate-pulse rounded-[18px] bg-paper-2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
