'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

/* Toasts — the app-wide replacement for ?ok=/?error= URL params.
   Ported from the handoff chrome.js TTD.toast contract: bottom-right,
   auto-dismissing, progress bar, success/error/info variants, optional
   inline action. Mounted once globally in the root layout. */

export type ToastType = 'success' | 'error' | 'info';

export interface ToastOptions {
  type?: ToastType;
  title: string;
  desc?: string;
  action?: string;
  onAction?: () => void;
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  leaving?: boolean;
}

const ToastContext = createContext<(opts: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4 10-11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 7v6M12 16h.01" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="1.6" />
    </svg>
  ),
  info: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 8v5M12 16h.01" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="1.6" />
    </svg>
  ),
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => remove(id), 200);
    },
    [remove],
  );

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = ++idRef.current;
      const duration = opts.duration ?? 4000;
      setToasts((list) => [...list, { ...opts, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    },
    [dismiss],
  );

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-[22px] right-[22px] z-[130] flex w-[380px] max-w-[calc(100vw-44px)] flex-col gap-3"
      >
        {toasts.map((t) => {
          const type = t.type ?? 'info';
          const iconBg =
            type === 'success' ? 'var(--court)' : type === 'error' ? 'var(--berry)' : 'var(--ink)';
          const iconColor = type === 'success' ? 'var(--accent-ink)' : '#fff';
          const progColor = type === 'error' ? 'var(--berry)' : 'var(--court)';
          return (
            <div
              key={t.id}
              role="status"
              className="relative flex items-center gap-3 overflow-hidden rounded-[14px] border p-[13px_16px]"
              style={{
                borderColor: 'var(--line)',
                background: 'var(--surface-card)',
                boxShadow: '0 20px 40px -18px rgba(0,0,0,.4)',
                animation: t.leaving ? undefined : 'slideUp .2s ease both',
                opacity: t.leaving ? 0 : 1,
                transform: t.leaving ? 'translateY(6px)' : undefined,
                transition: 'opacity .2s, transform .2s',
              }}
            >
              <span
                className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[10px]"
                style={{ background: iconBg, color: iconColor }}
              >
                {ICONS[type]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
                  {t.title}
                </div>
                {t.desc ? (
                  <div className="mt-px text-[12.5px]" style={{ color: 'var(--text3)' }}>
                    {t.desc}
                  </div>
                ) : null}
              </div>
              {t.action ? (
                <button
                  type="button"
                  className="cursor-pointer text-[13px] font-semibold"
                  style={{ color: 'var(--court-deep)' }}
                  onClick={() => {
                    t.onAction?.();
                    dismiss(t.id);
                  }}
                >
                  {t.action}
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Dismiss"
                className="cursor-pointer border-none bg-transparent text-[15px]"
                style={{ color: 'var(--text3)' }}
                onClick={() => dismiss(t.id)}
              >
                ✕
              </button>
              <span
                className="absolute bottom-0 left-0 h-[3px]"
                style={{
                  background: progColor,
                  animation: `toastProgress ${t.duration ?? 4000}ms linear forwards`,
                }}
              />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
