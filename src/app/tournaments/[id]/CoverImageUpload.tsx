'use client';

import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { setTournamentCoverImage } from './settings-actions';

type Props = {
  tournamentId: string;
  initialUrl: string | null;
};

// Manager-only cover image picker. Uploads to the tournament-covers
// bucket under {tournament_id}/cover-{timestamp}.{ext} so RLS can verify
// the caller is a manager of THAT tournament. Public read on the bucket
// keeps the SSR'd scoreboard / public invite page able to render the
// banner without signing.
export function CoverImageUpload({ tournamentId, initialUrl }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const supabase = createClient();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > 8 * 1024 * 1024) {
      setError('Image too large (8 MB max).');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('That file isn’t an image.');
      return;
    }
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const path = `${tournamentId}/cover-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('tournament-covers')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setError(upErr.message);
      return;
    }

    const { data } = supabase.storage.from('tournament-covers').getPublicUrl(path);
    const publicUrl = data.publicUrl;
    setUrl(publicUrl);
    startTransition(async () => {
      const res = await setTournamentCoverImage(tournamentId, publicUrl);
      if (!res.ok) setError(res.error ?? 'Could not save cover image.');
    });
  }

  async function onRemove() {
    setError(null);
    setUrl(null);
    startTransition(async () => {
      const res = await setTournamentCoverImage(tournamentId, null);
      if (!res.ok) setError(res.error ?? 'Could not remove cover image.');
    });
  }

  return (
    <div className="grid gap-2">
      <div
        className="relative h-36 w-full overflow-hidden rounded-2xl"
        style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Tournament cover" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-ink-3">
            No cover image yet
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <label
          className="flex-1 cursor-pointer rounded-xl px-3 py-2 text-center text-[13px] font-semibold transition active:scale-95"
          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
        >
          {isPending ? 'Saving…' : url ? 'Replace' : 'Upload cover'}
          <input type="file" accept="image/*" className="hidden" onChange={onPick} />
        </label>
        {url && (
          <button
            type="button"
            onClick={onRemove}
            disabled={isPending}
            className="rounded-xl px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
            style={{ color: 'var(--ink-3)', border: '1px solid var(--line)', background: '#fff' }}
          >
            Remove
          </button>
        )}
      </div>
      {error && (
        <div className="text-[11px]" style={{ color: 'var(--berry)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
