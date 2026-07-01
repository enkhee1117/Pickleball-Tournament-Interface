import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, JetBrains_Mono, Geist } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { TabBar } from '@/components/TabBar';
import { THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'TourneyPal',
  description: 'Run pickleball mixers and tournaments without spreadsheets.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#F8F6F1',
};

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-jetbrains-mono',
});

const geist = Geist({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-geist',
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = readThemeFromCookie(store.get(THEME_COOKIE)?.value);
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${instrumentSerif.variable} ${jetbrainsMono.variable} ${geist.variable}`}
    >
      <body className="bg-paper text-ink">
        <div className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col">
          <main className="flex flex-1 flex-col">{children}</main>
          <TabBar />
        </div>
      </body>
    </html>
  );
}
