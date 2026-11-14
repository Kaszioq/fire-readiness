// Role B places the component; role C owns <SmokeSim />. See docs/SPEC.md module 6.
import { SmokeSim } from '@/components/smoke-sim/SmokeSim';

export default function SimulatorPage() {
  return (
    <>
      <h1>Smoke detection simulator</h1>
      <SmokeSim />
    </>
  );
}
