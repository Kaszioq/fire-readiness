// Role B. Skeleton list. Replace with the searchable, filterable list from docs/SPEC.md module 1.
import Link from 'next/link';
import { investigations } from '@/lib/data';

export default function InvestigationsPage() {
  return (
    <>
      <h1>Investigations</h1>
      <ul className="row-list">
        {investigations.map((inv) => (
          <li key={inv.psi_id}>
            <Link href={`/investigations/${inv.psi_id}`}>
              {inv.acronym} ({inv.psi_id})
            </Link>
            <div className="muted">
              {inv.title}, {inv.project_type}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
