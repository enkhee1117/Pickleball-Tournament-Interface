'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { Profile } from '@/lib/types';
import { TopBar } from '@/components/ui/TopBar';
import { Icons } from '@/components/ui/icons';
import { AvatarUpload } from '@/components/AvatarUpload';
import { emptyFormState, type FormState } from '@/lib/forms';

type SaveAction = (state: FormState, formData: FormData) => Promise<FormState>;

export function ProfileForm({
  profile,
  saveAction,
}: {
  profile: Profile;
  saveAction: SaveAction;
}) {
  const [state, formAction, pending] = useActionState(saveAction, emptyFormState);

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <TopBar
        title="Edit profile"
        left={
          <Link
            href="/profile"
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ color: 'var(--ink)' }}
          >
            {Icons.back}
          </Link>
        }
      />

      <form action={formAction} className="flex-1 overflow-y-auto px-[18px] pb-6">
        <div className="mb-4 flex justify-center">
          <AvatarUpload userId={profile.id} initialUrl={profile.avatar_url} />
        </div>

        {state.error && (
          <div
            className="mb-3 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--berry)', color: 'var(--berry)', background: 'oklch(0.96 0.04 12)' }}
          >
            {state.error}
          </div>
        )}
        {state.ok && (
          <div
            className="mb-3 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--court-deep)', color: 'var(--court-deep)', background: 'oklch(0.96 0.04 140)' }}
          >
            {state.ok}
          </div>
        )}

        <div className="space-y-3">
          <Field label="Display name" name="display_name" defaultValue={profile.display_name ?? ''} required />
          <Field label="Full name" name="full_name" defaultValue={profile.full_name ?? ''} />

          <div>
            <FieldLabel>Gender (for mixed-doubles assignments)</FieldLabel>
            <select
              name="gender"
              defaultValue={profile.gender ?? ''}
              className="w-full rounded-xl bg-white px-3.5 py-3 text-sm text-ink outline-none"
              style={{ border: '1px solid var(--line)' }}
            >
              <option value="">—</option>
              <option value="m">Male</option>
              <option value="f">Female</option>
              <option value="x">Other / prefer not to say</option>
            </select>
          </div>

          <Field label="DUPR ID" name="dupr_id" defaultValue={profile.dupr_id ?? ''} placeholder="e.g. 1234567" />
          <Field
            label="DUPR singles"
            name="dupr_singles"
            type="number"
            step="0.001"
            min="2"
            max="8"
            defaultValue={profile.dupr_singles ?? ''}
          />
          <Field
            label="DUPR doubles"
            name="dupr_doubles"
            type="number"
            step="0.001"
            min="2"
            max="8"
            defaultValue={profile.dupr_doubles ?? ''}
          />

          <div>
            <FieldLabel>Bio</FieldLabel>
            <textarea
              name="bio"
              defaultValue={profile.bio ?? ''}
              maxLength={500}
              className="min-h-24 w-full rounded-xl bg-white px-3.5 py-3 text-sm text-ink outline-none"
              style={{ border: '1px solid var(--line)' }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-5 block w-full rounded-2xl px-5 py-[18px] text-center text-base font-semibold tracking-tight transition active:scale-[0.97] disabled:opacity-70"
          style={{
            background: 'var(--ink)',
            color: 'var(--paper)',
            boxShadow: '0 4px 14px oklch(0.2 0.05 100 / 0.12)',
          }}
        >
          {pending ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[11px] uppercase tracking-[0.06em] text-ink-3">{children}</div>;
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  placeholder,
  required,
  step,
  min,
  max,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  placeholder?: string;
  required?: boolean;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder}
        required={required}
        step={step}
        min={min}
        max={max}
        className="w-full rounded-xl bg-white px-3.5 py-3 text-sm text-ink outline-none"
        style={{ border: '1px solid var(--line)' }}
      />
    </div>
  );
}
