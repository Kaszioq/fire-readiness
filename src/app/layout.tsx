import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavLinks } from '@/components/NavLinks';
import { ScrollFx } from '@/components/ScrollFx';
import { DATA_IS_MOCK, meta } from '@/lib/data';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Moon Base Fire Readiness',
  description:
    'Which NASA PSI microgravity combustion investigations tell us whether a habitat atmosphere is fire-safe, and how confident can we be?',
};

// viewport-fit=cover lets the page paint under the notch; the CSS pads content back with env(safe-area-inset-*).
// Zoom is never disabled.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#090c11',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ScrollFx />
        <header className="site-header">
          <Link href="/" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-logo" src="/brand/logo-mark.png" alt="" aria-hidden="true" width={28} height={28} />
            Moon Base Fire Readiness
          </Link>
          <NavLinks />
          <span className="header-stat">
            <strong>{meta.n_investigations}</strong> investigations, <strong>{meta.n_fields_verified}</strong> of{' '}
            {meta.n_fields_total} extracted fields verified against NASA source
          </span>
        </header>
        {DATA_IS_MOCK && (
          <div className="mock-banner" role="status">
            Development build on mock data. No value shown here comes from NASA sources.
          </div>
        )}
        <main>{children}</main>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <span>Not an official NASA tool. Rockets and propellants are out of scope. Logo: AI-generated.</span>
            <span>
              Data: NASA PSI snapshot of {meta.fetched_at}. Open source, Apache 2.0. <Link href="/about">About</Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
