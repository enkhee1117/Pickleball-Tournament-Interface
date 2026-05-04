'use client';

import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/ui/TopBar';
import { IconBtn } from '@/components/ui/IconBtn';
import { Icons } from '@/components/ui/icons';

export function InviteTopBar({ tournamentId, isNew }: { tournamentId: string; isNew: boolean }) {
  const router = useRouter();
  return (
    <TopBar
      title={isNew ? 'Invite players' : 'Roster'}
      left={
        <IconBtn aria-label="Back" onClick={() => router.push(`/tournaments/${tournamentId}`)}>
          {Icons.back}
        </IconBtn>
      }
      right={
        <IconBtn aria-label="Close" onClick={() => router.push(`/tournaments/${tournamentId}`)}>
          {Icons.close}
        </IconBtn>
      }
    />
  );
}
