'use client';

import type { FormHTMLAttributes, ReactNode } from 'react';

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
  confirm: string;
  children: ReactNode;
};

// Wraps a server-action <form> so the user has to confirm before it submits.
// Cancelling clears any pending state without firing the action.
export function ConfirmForm({ confirm, children, ...rest }: Props) {
  return (
    <form
      {...rest}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {children}
    </form>
  );
}
