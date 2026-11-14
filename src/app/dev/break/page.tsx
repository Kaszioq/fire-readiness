// Role B, development only: stress test for the shared components. Returns 404 in production builds.
// /dev/break?data=demo | worst | empty | one
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConditionStats } from '@/components/ConditionStats';
import { CoverageTeaser } from '@/components/CoverageTeaser';
import { HabitatCard } from '@/components/HabitatCard';
import { PredictionCard } from '@/components/PredictionCard';
import { RankedList } from '@/components/RankedList';
import { flammabilityPoints, getHabitat, getInvestigation, habitats, investigations } from '@/lib/data';
import { predict } from '@/lib/predict';
import { rankInvestigations } from '@/lib/rank';
import type { Conditions, FlammabilityPoint, Habitat, Prediction, RankedInvestigation } from '@/lib/types';
import { onePoint, worstConditions, worstHabitats, worstPoints, worstPredictions, worstRanked } from './fixtures';

export const metadata: Metadata = { title: 'Break UI (dev only)', robots: { index: false } };

const STATES = ['demo', 'worst', 'empty', 'one'] as const;
type State = (typeof STATES)[number];
const LABEL: Record<State, string> = { demo: 'Demo data', worst: 'Worst case', empty: 'Empty', one: 'One' };

interface Dataset {
  habitats: Habitat[];
  conditions: Conditions;
  predictions: Prediction[];
  ranked: RankedInvestigation[];
  points: FlammabilityPoint[];
}

function dataset(state: State): Dataset {
  const moon = getHabitat('moon_base') ?? habitats[0];
  const conditions: Conditions = {
    o2_mole_fraction: moon.o2_mole_fraction,
    pressure_kpa: moon.pressure_kpa,
    flow_cm_s: moon.flow_cm_s,
    material_class: 'thin_fabric',
    gravity_g: moon.gravity_g,
  };
  const demo: Dataset = {
    habitats,
    conditions,
    predictions: [predict(conditions, flammabilityPoints)],
    ranked: rankInvestigations(conditions, investigations),
    points: flammabilityPoints,
  };
  switch (state) {
    case 'worst':
      return {
        habitats: worstHabitats,
        conditions: worstConditions,
        predictions: worstPredictions,
        ranked: worstRanked,
        points: worstPoints,
      };
    case 'empty':
      return { ...demo, habitats: [moon], predictions: [predict(conditions, [])], ranked: [], points: [] };
    case 'one':
      return {
        ...demo,
        habitats: [moon],
        predictions: [worstPredictions[1]],
        ranked: demo.ranked.slice(0, 1),
        points: onePoint,
      };
    default:
      return demo;
  }
}

export default async function BreakPage({ searchParams }: { searchParams: Promise<{ data?: string | string[] }> }) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { data: raw } = await searchParams;
  const param = Array.isArray(raw) ? raw[0] : raw;
  const state: State = STATES.includes(param as State) ? (param as State) : 'demo';
  const d = dataset(state);
  const focus = d.habitats[0];

  return (
    <>
      <header className="page-head">
        <span className="eyebrow">Development only</span>
        <h1>Break UI: {LABEL[state]}</h1>
        <p className="lead">
          Shared components rendered with fixture data. Everything except “Demo data” is fake and exists only to find
          layout and formatting bugs.
        </p>
      </header>

      <section className="section">
        <div className="section-head">
          <h2>Habitat cards</h2>
        </div>
        <div className="grid grid-3">
          {d.habitats.map((h, i) => (
            <HabitatCard key={`${h.id}-${i}`} habitat={h} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Conditions</h2>
        </div>
        <ConditionStats conditions={d.conditions} habitat={focus} />
      </section>

      <div className="split section">
        <section className="card-stack">
          <h2>Predictor</h2>
          {d.predictions.map((p, i) => (
            <PredictionCard key={i} prediction={p} />
          ))}
        </section>
        <section className="card-stack">
          <h2>Ranking</h2>
          <RankedList ranked={d.ranked} lookup={getInvestigation} />
        </section>
      </div>

      <section className="section" style={{ maxWidth: 560, marginBottom: 80 }}>
        <div className="section-head">
          <h2>Coverage chart</h2>
        </div>
        <CoverageTeaser points={d.points} habitats={d.habitats} focus={focus} />
      </section>

      <nav className="dev-toggle" aria-label="Fixture data">
        {STATES.map((s) => (
          <Link key={s} href={`/dev/break?data=${s}`} aria-current={s === state ? 'true' : undefined} scroll={false}>
            {LABEL[s]}
          </Link>
        ))}
      </nav>
    </>
  );
}
