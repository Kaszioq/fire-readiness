import Link from 'next/link';
import { habitats } from '@/lib/data';

export default function HomePage() {
  return (
    <>
      <h1>Is this habitat atmosphere fire-safe?</h1>
      <p>
        Of the NASA PSI microgravity combustion investigations, which ones tell us whether a habitat atmosphere is
        fire-safe, how confident can we be, and what must future experiments still measure?
      </p>
      <h2>Check a habitat</h2>
      <div className="presets">
        {habitats.map((h) => (
          <Link key={h.id} href={`/lens?habitat=${h.id}`}>
            {h.name}
            {h.is_assumption ? ' (scenario)' : ''}
          </Link>
        ))}
      </div>
    </>
  );
}
