import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, JetBrains_Mono, Geist } from 'next/font/google';
import './globals.css';
import { TabBar } from '@/components/TabBar';

export const metadata: Metadata = {
  title: 'TourneyPal',
  description: 'Run a tournament in 90 seconds.',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
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
