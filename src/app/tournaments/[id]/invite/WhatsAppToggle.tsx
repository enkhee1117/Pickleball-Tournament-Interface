'use client';

import { useState, useTransition } from 'react';
import { Icons } from '@/components/ui/icons';

type Props = {
  tournamentId: string;
  initialUrl: string | null;
  updateAction: (formData: FormData) => Promise<void>;
};

export function WhatsAppToggle({ tournamentId, initialUrl, updateAction }: Props) {
  const [linked, setLinked] = useState(!!initialUrl);
  const [showInput, setShowInput] = useState(false);
  const [url, setUrl] = useState(initialUrl ?? '');
  const [isPending, startTransition] = useTransition();

  const onTap = () => {
    if (linked) {
      // tap to edit
      setShowInput(true);
    } else {
      setShowInput((s) => !s);
    }
  };

  const onSave = () => {
    const fd = new FormData();
    fd.append('tournament_id', tournamentId);
    fd.append('whatsapp_group_url', url);
    startTransition(async () => {
      await updateAction(fd);
      setLinked(!!url);
      setShowInput(false);
    });
  };

  const onClear = () => {
    const fd = new FormData();
    fd.append('tournament_id', tournamentId);
    fd.append('whatsapp_group_url', '');
    startTransition(async () => {
      await updateAction(fd);
      setLinked(false);
      setUrl('');
      setShowInput(false);
    });
  };

  return (
    <div className="mb-[18px]">
      <button
        type="button"
        onClick={onTap}
        className="flex w-full items-center gap-3.5 rounded-[18px] bg-white p-4 text-left transition active:scale-[0.99]"
        style={{ border: '1px solid var(--line)' }}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-[14px] text-white"
          style={{ background: '#25D366' }}
        >
          {Icons.whatsapp}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">
            {linked ? 'WhatsApp group linked' : 'Link a WhatsApp group'}
          </div>
          <div className="mt-0.5 text-xs text-ink-3">
            {linked ? 'Auto-post results to chat' : 'Push live scores into your group chat'}
          </div>
        </div>
        <div
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
          style={{ background: linked ? 'var(--court)' : 'var(--paper-2)' }}
        >
          <div
            className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow"
            style={{ left: linked ? 23 : 3, transition: 'left .2s' }}
          />
        </div>
      </button>

      {showInput && (
        <div
          className="mt-2 rounded-[18px] bg-white p-3"
          style={{ border: '1px solid var(--line)' }}
        >
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://chat.whatsapp.com/..."
            className="w-full rounded-xl px-3 py-2.5 text-sm text-ink outline-none"
            style={{ border: '1px solid var(--line)' }}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={isPending}
              className="flex-1 rounded-xl px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
              style={{ background: 'var(--ink)', color: 'var(--paper)' }}
            >
              {isPending ? 'Saving…' : 'Save link'}
            </button>
            {linked && (
              <button
                type="button"
                onClick={onClear}
                disabled={isPending}
                className="rounded-xl px-4 py-2 text-[13px] font-semibold"
                style={{ border: '1px solid var(--line)', color: 'var(--berry)' }}
              >
                Unlink
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
