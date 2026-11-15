'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ScrollRow } from '@/components/ScrollRow';

const NAV = [
  { href: '/lens', label: 'Habitat Lens' },
  { href: '/map', label: 'Gap map' },
  { href: '/investigations', label: 'Investigations' },
  { href: '/simulator', label: 'Smoke simulator' },
  { href: '/about', label: 'About' },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <ScrollRow className="site-nav" label="Main" watch={pathname}>
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
            {item.label}
          </Link>
        );
      })}
    </ScrollRow>
  );
}
