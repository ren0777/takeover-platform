import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/ui/site-header';
import { buildPageTitle, SITE } from '@/lib/site';
import './globals.css';

/** Display face: territory names, headings, rank numerals. */
const display = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

/** Body face for prose and UI. */
const body = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

/** Numeric face so prices, timers, and ranks align across rows and tiles. */
const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: buildPageTitle(),
  description: `${SITE.name} is a competitive marketplace for internet territories.`,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          {/* The single main landmark for every route, so the skip link always
              has a target. Pages must not render their own <main>. */}
          <main id="main-content" className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
