'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { useToast } from '@/components/desktop';
import type { ActionResult } from '../actions';

// SPA-style wrapper for the organizer cockpit's server-action <form>s. The
// actions no longer redirect() (that was a full RSC navigation — the "app
// refreshed when I clicked Start timer" bug from PR #106); they return
// {ok,error} and revalidatePath() the affected surfaces. This component runs
// the action in place, toasts the result (replacing the old ?ok=/?error= query
// params), and disables its controls while the request is in flight. The soft
// refresh from revalidatePath + MixerRealtimeSync brings the page's data up to
// date without a hard navigation. Mirrors the player ballot pattern (#106).

type Props = {
  action: (formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  // Native confirm() gate before firing (replaces the standalone ConfirmForm).
  confirm?: string;
  // Override the success toast; defaults to the action's own result.message.
  // Pass null to stay silent on success (rely on the in-place refresh instead).
  successToast?: string | null;
  // Fires after the toast so callers can reset local UI, close a panel, etc.
  onResult?: (result: ActionResult) => void;
};

export function ActionForm({ action, children, className, style, confirm, successToast, onResult }: Props) {
  const toast = useToast();
  return (
    <form
      className={className}
      style={style}
      // Async so React tracks pending (useFormStatus) and only resets the
      // uncontrolled fields after the mutation + revalidation settle.
      action={async (formData) => {
        if (confirm && !window.confirm(confirm)) return;
        try {
          const result = await action(formData);
          if (result.ok) {
            const message = successToast === undefined ? result.message : successToast;
            if (message) toast({ type: 'success', title: message });
          } else {
            toast({ type: 'error', title: result.error ?? 'Something went wrong' });
          }
          onResult?.(result);
        } catch {
          toast({ type: 'error', title: 'Something went wrong — please try again.' });
        }
      }}
    >
      <PendingFieldset>{children}</PendingFieldset>
    </form>
  );
}

// display:contents keeps the caller's grid/flex layout intact while still
// letting the fieldset's disabled state cascade to every control during a
// submit, so a double-tap can't fire the action twice.
function PendingFieldset({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <fieldset disabled={pending} style={{ display: 'contents' }}>
      {children}
    </fieldset>
  );
}
