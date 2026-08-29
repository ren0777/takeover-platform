import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { buildPageTitle, SITE } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: buildPageTitle(),
  description: `${SITE.name} is a competitive marketplace for internet territories.`,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
