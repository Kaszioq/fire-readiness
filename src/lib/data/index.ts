// The only place in src/ that imports from data/. Everything else imports from '@/lib/data'.
// Role A: when real data lands, switch the five imports below from data/mock/*.mock.json to
// data/curated/*.json (and data/cached_reports/), then set DATA_IS_MOCK to false. Nothing else changes.
import flameTemperatureRaw from '@data/curated/flame_temperature.json';
import flammabilityPointsRaw from '@data/curated/flammability_points.json';
import habitatsRaw from '@data/curated/habitats.json';
import investigationsRaw from '@data/curated/investigations.json';
import metaRaw from '@data/curated/meta.json';
// Report stays on the mock until role C generates data/cached_reports/<habitat_id>.json.
import reportRaw from '@data/mock/report.mock.json';
import {
  FlameTemperatureSchema,
  FlammabilityPointSchema,
  HabitatSchema,
  InvestigationSchema,
  MetaSchema,
  ReportResponseSchema,
} from '@/lib/schemas';
import type {
  FlameTemperature,
  FlammabilityPoint,
  Habitat,
  HabitatId,
  Investigation,
  Meta,
  ReportResponse,
} from '@/lib/types';

/** True while the app runs on fake development data. The layout shows a banner when set. */
export const DATA_IS_MOCK = false; // curated PSI snapshot of 2026-11-14 (see data/curated/mappings.md); the report is still a mock

// Parsing here gives exact types and makes the build fail on malformed data.
export const investigations: Investigation[] = InvestigationSchema.array().parse(investigationsRaw);
export const flammabilityPoints: FlammabilityPoint[] = FlammabilityPointSchema.array().parse(flammabilityPointsRaw);
export const habitats: Habitat[] = HabitatSchema.array().parse(habitatsRaw);
export const meta: Meta = MetaSchema.parse(metaRaw);
/** Physics layer: adiabatic flame temperatures precomputed offline (docs/PHYSICS.md). Used by src/lib/predict. */
export const flameTemperature: FlameTemperature = FlameTemperatureSchema.parse(flameTemperatureRaw);

const mockReport: ReportResponse = ReportResponseSchema.parse(reportRaw);

export function getInvestigation(psiId: string): Investigation | undefined {
  return investigations.find((i) => i.psi_id === psiId);
}

export function getHabitat(id: string | undefined): Habitat | undefined {
  return habitats.find((h) => h.id === id);
}

/** Pre-generated report used as fallback and for the instant demo. One mock report for every habitat for now. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getCachedReport(habitatId?: HabitatId): ReportResponse {
  return { ...mockReport, cached: true };
}
