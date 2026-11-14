// Role B. Skeleton detail card. Replace with the full card (every field with its source, unverified fields marked).
import { notFound } from 'next/navigation';
import { getInvestigation, investigations } from '@/lib/data';

export function generateStaticParams() {
  return investigations.map((inv) => ({ psiId: inv.psi_id }));
}

export default async function InvestigationPage({ params }: { params: Promise<{ psiId: string }> }) {
  const { psiId } = await params;
  const inv = getInvestigation(psiId);
  if (!inv) notFound();

  return (
    <>
      <h1>
        {inv.acronym} <span className="muted">{inv.psi_id}</span>
      </h1>
      <p>{inv.title}</p>
      <p>{inv.objective_summary.value ?? 'not reported'}</p>
      <p>
        <a href={inv.psi_url} target="_blank" rel="noreferrer">
          Open in the NASA PSI repository
        </a>
      </p>
    </>
  );
}
