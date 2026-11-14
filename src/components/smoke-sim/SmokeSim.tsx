'use client';

// Role C. Placeholder for the smoke detection simulator (docs/SPEC.md module 6, P2).
// Self-contained: role B only places <SmokeSim /> on a page.
import type { SmokeSimProps } from '@/lib/types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SmokeSim({ onResult }: SmokeSimProps) {
  return (
    <div className="placeholder" role="img" aria-label="Smoke simulator placeholder">
      Smoke detection simulator: not built yet. Illustrative model, not a validated one.
    </div>
  );
}
