'use client';

import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { setAvatarUrl } from '@/app/profile/actions';
import { PRESET_AVATARS } from '@/lib/avatars';

/* Avatar picker for the profile edit form: a big live preview, a grid of the
   built-in avatar options, and an "upload your own" fallback. Selecting a
   preset or uploading persists immediately via setAvatarUrl (matching the
   revalidate-on-save behaviour the rest of the form relies on). */

export function AvatarChooser({ userId, initialUrl }: { userId: string; initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const supabase = createClient();

  function persist(nextUrl: string) {
    setUrl(nextUrl);
    startTransition(() => setAvatarUrl(nextUrl));
  }

  function pickPreset(src: string) {
    setError(null);
    persist(src);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large (5 MB max)');
      return;
    }
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${userId}/avatar-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setError(upErr.message);
      return;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    persist(data.publicUrl);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="h-[110px] w-[110px] overflow-hidden rounded-full"
        style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Your avatar" className="h-full w-full object-cover" style={{ objectPosition: 'center top' }} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-ink-3">No photo</div>
        )}
      </div>

      <div className="w-full">
        <div className="mb-2 text-center text-[11px] uppercase tracking-[0.06em] text-ink-3">Choose an avatar</div>
        <div
          role="radiogroup"
          aria-label="Choose an avatar"
          className="grid grid-cols-6 gap-2 sm:grid-cols-6"
        >
          {PRESET_AVATARS.map((a) => {
            const selected = url === a.src;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={a.label}
                title={a.label}
                onClick={() => pickPreset(a.src)}
                className="relative aspect-square overflow-hidden rounded-full transition active:scale-95"
                style={{
                  boxShadow: selected
                    ? '0 0 0 2px var(--card), 0 0 0 4px var(--court)'
                    : '0 0 0 1px var(--line)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.src}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{ objectPosition: 'center top' }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <label
        className="cursor-pointer rounded-full px-4 py-2 text-[13px] font-semibold transition active:scale-95"
        style={{ background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)' }}
      >
        {isPending ? 'Saving…' : 'Or upload your own'}
        <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
      </label>

      {error && (
        <p className="text-xs" style={{ color: 'var(--berry)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
