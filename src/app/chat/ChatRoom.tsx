'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Message } from '@/lib/types';

type ProfileLite = { id: string; display_name: string | null; avatar_url: string | null };

export function ChatRoom({
  meId,
  meName,
  initialMessages,
  profileMap,
}: {
  meId: string;
  meName: string;
  initialMessages: Message[];
  profileMap: Record<string, ProfileLite>;
}) {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [profiles, setProfiles] = useState(profileMap);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('messages:general')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: 'channel=eq.general' },
        async (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => (prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (!profiles[msg.user_id]) {
            const { data } = await supabase
              .from('profiles')
              .select('id, display_name, avatar_url')
              .eq('id', msg.user_id)
              .single();
            if (data) setProfiles((p) => ({ ...p, [data.id]: data as ProfileLite }));
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, profiles]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft('');
    const { error } = await supabase.from('messages').insert({
      content, channel: 'general', user_id: meId,
    });
    setSending(false);
    if (error) {
      setDraft(content);
      alert(error.message);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => {
          const p = profiles[m.user_id];
          const mine = m.user_id === meId;
          const name = p?.display_name ?? (mine ? meName : 'unknown');
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-neutral-700">
                {p?.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                mine ? 'bg-white text-black' : 'bg-neutral-800 text-white'
              }`}>
                <div className={`mb-0.5 text-xs ${mine ? 'text-neutral-500' : 'text-neutral-400'}`}>
                  {name}
                </div>
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500">No messages yet — say hi.</p>
        )}
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-neutral-800 p-3">
        <input
          className="input"
          placeholder="Message #general"
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
