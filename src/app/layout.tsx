import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';
import { getProfile } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'MLP Scoreboard',
  description: 'Pickleball league scoreboard, profiles, chat',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  return (
    <html lang="en">
      <body>
        <Nav profile={profile} />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
