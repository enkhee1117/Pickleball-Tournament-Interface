import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, JetBrains_Mono, Geist } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { TabBar } from '@/components/TabBar';
import { THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://trytodink.com';
const IS_PRODUCTION = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
  || process.env.VERCEL_ENV === 'production'
  || !process.env.VERCEL_ENV;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Try to Dink',
  description: 'Run pickleball mixers and tournaments without spreadsheets.',
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: 'Try to Dink',
    description: 'Run pickleball mixers and tournaments without spreadsheets.',
    url: SITE_URL,
    siteName: 'Try to Dink',
    type: 'website',
  },
  // Non-production deploys (preview / branch URLs) stay out of Google so the
  // canonical stays clean.
  robots: IS_PRODUCTION ? undefined : { index: false, follow: false },
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
