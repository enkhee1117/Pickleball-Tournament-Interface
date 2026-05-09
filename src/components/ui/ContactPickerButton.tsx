'use client';

import { useEffect, useState } from 'react';
import { Icons } from './icons';

// Web Contact Picker API. Available on Chrome / Edge for Android over HTTPS;
// on every other platform the button stays hidden so we don't tease a flow
// the browser can't fulfil. Spec:
// https://developer.mozilla.org/en-US/docs/Web/API/Contact_Picker_API
type ContactInfo = { name?: string[]; tel?: string[] };
type ContactsManager = {
  select: (props: string[], opts?: { multiple?: boolean }) => Promise<ContactInfo[]>;
};

function getContacts(): ContactsManager | null {
  if (typeof navigator === 'undefined') return null;
  const c = (navigator as Navigator & { contacts?: ContactsManager }).contacts;
  if (!c || typeof c.select !== 'function') return null;
  return c;
}

export function ContactPickerButton({
  onPick,
  className,
  label = 'Contacts',
}: {
  onPick: (info: { name: string; phone: string }) => void;
  className?: string;
  label?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(getContacts() !== null);
  }, []);

  if (!supported) return null;

  const onClick = async () => {
    const c = getContacts();
    if (!c) return;
    setBusy(true);
    try {
      const results = await c.select(['name', 'tel'], { multiple: false });
      const first = results[0];
      if (!first) return;
      const name = (first.name?.[0] ?? '').trim();
      const phone = (first.tel?.[0] ?? '').trim();
      if (!name && !phone) return;
      onPick({ name, phone });
    } catch {
      // User cancelled the picker, or the browser denied access. Either way
      // there's nothing actionable to surface — silently no-op.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={className}
      aria-label="Pick from contacts"
      title="Pick from contacts"
    >
      <span className="inline-flex items-center gap-1">
        {Icons.contacts}
        <span>{busy ? '…' : label}</span>
      </span>
    </button>
  );
}
