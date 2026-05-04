'use client';

import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { setAvatarUrl } from '@/app/profile/actions';

export function AvatarUpload({ userId, initialUrl }: { userId: string; initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const supabase = createClient();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
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
    setUrl(data.publicUrl);
    startTransition(() => setAvatarUrl(data.publicUrl));
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="h-[110px] w-[110px] overflow-hidden rounded-full"
        style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Avatar" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-ink-3">
            No photo
          </div>
        )}
      </div>
      <label
        className="cursor-pointer rounded-full px-4 py-2 text-[13px] font-semibold transition active:scale-95"
        style={{ background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
      >
        {isPending ? 'Saving…' : 'Upload photo'}
        <input type="file" accept="image/*" className="hidden" onChange={onPick} />
      </label>
      {error && (
        <p className="text-xs" style={{ color: 'var(--berry)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
