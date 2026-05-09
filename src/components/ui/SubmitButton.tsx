'use client';

import { useFormStatus } from 'react-dom';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  // Inline mode (default): replaces children with pendingLabel and renders an
  // inline spinner. Best for tight buttons like "Save".
  pendingLabel?: string;
  // Overlay mode: keeps the children intact and floats a spinner in the top
  // right corner. Use this for multi-line / block-style buttons (e.g. the
  // danger-zone "Delete tournament" button) where replacing the contents
  // would collapse the layout.
  overlay?: boolean;
};

export function SubmitButton({
  children,
  pendingLabel,
  overlay = false,
  className,
  disabled,
  ...rest
}: Props) {
  const { pending } = useFormStatus();

  if (overlay) {
    return (
      <button
        {...rest}
        type="submit"
        disabled={pending || disabled}
        aria-busy={pending}
        className={`relative ${pending ? 'cursor-wait opacity-70' : ''} ${className ?? ''}`}
      >
        {children}
        {pending && (
          <span
            className="pointer-events-none absolute right-3 top-3 inline-flex h-4 w-4 items-center justify-center"
            aria-hidden
          >
            <Spinner />
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      {...rest}
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={`relative inline-flex items-center justify-center gap-2 ${
        pending ? 'cursor-wait opacity-80' : ''
      } ${className ?? ''}`}
    >
      {pending && <Spinner />}
      <span>{pending ? pendingLabel ?? 'Working...' : children}</span>
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
