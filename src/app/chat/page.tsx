import { requireProfile } from '@/lib/auth';
import { ChatRoom } from './ChatRoom';
import { createClient } from '@/lib/supabase/server';

export default async function ChatPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('channel', 'general')
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url');

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

  return (
    <div className="card h-[70vh] p-0">
      <ChatRoom
        meId={me.id}
        meName={me.display_name ?? 'me'}
        initialMessages={(messages ?? []).reverse()}
        profileMap={profileMap}
      />
    </div>
  );
}
