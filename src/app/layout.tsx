import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DATA_IS_MOCK, meta } from '@/lib/data';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Moon Base Fire Readiness',
  description:
    'Which NASA PSI microgravity combustion investigations tell us whether a habitat atmosphere is fire-safe, and how confident can we be?',
};

const NAV = [
  { href: '/lens', label: 'Habitat Lens' },
  { href: '/map', label: 'Gap map' },
  { href: '/investigations', label: 'Investigations' },
  { href: '/simulator', label: 'Smoke simulator' },
  { href: '/earth', label: 'Earth applications' },
  { href: '/about', label: 'About' },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <strong>
            <Link href="/">Moon Base Fire Readiness</Link>
          </strong>
          <nav aria-label="Main">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="muted">
            {meta.n_investigations} investigations, {meta.n_fields_verified} of {meta.n_fields_total} extracted fields
            verified against NASA source
          </span>
        </header>
        {DATA_IS_MOCK && (
          <div className="mock-banner" role="status">
            Development build on mock data. No value shown here comes from NASA sources.
          </div>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
