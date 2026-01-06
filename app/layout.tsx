/**
 * @fileoverview Root layout for Black Gold mining platform
 */

import type { Metadata } from 'next';
import { Bebas_Neue, Oswald, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bebas',
  display: 'swap',
});

const oswald = Oswald({
  subsets: ['latin'],
  variable: '--font-oswald',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Black Gold | CPU Mining for COAL Token',
  description: 'Mine COAL tokens with your CPU. The first holder-gated Proof-of-Work token on Pump.fun.',
  keywords: ['crypto', 'mining', 'Solana', 'COAL', 'CPU mining', 'Pump.fun'],
  openGraph: {
    title: 'Black Gold | CPU Mining for COAL',
    description: 'Mine COAL tokens with your CPU. Holder-gated PoW on Solana.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${oswald.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
