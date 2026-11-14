// The only place in src/ that imports from data/. Everything else imports from '@/lib/data'.
// Role A: when real data lands, switch the five imports below from data/mock/*.mock.json to
// data/curated/*.json (and data/cached_reports/), then set DATA_IS_MOCK to false. Nothing else changes.
import flammabilityPointsRaw from '@data/mock/flammability_points.mock.json';
import habitatsRaw from '@data/mock/habitats.mock.json';
import investigationsRaw from '@data/mock/investigations.mock.json';
import metaRaw from '@data/mock/meta.mock.json';
import reportRaw from '@data/mock/report.mock.json';
import {
  FlammabilityPointSchema,
  HabitatSchema,
  InvestigationSchema,
  MetaSchema,
  ReportResponseSchema,
} from '@/lib/schemas';
import type { FlammabilityPoint, Habitat, HabitatId, Investigation, Meta, ReportResponse } from '@/lib/types';

/** True while the app runs on fake development data. The layout shows a banner when set. */
export const DATA_IS_MOCK = true;

// Parsing here gives exact types and makes the build fail on malformed data.
export const investigations: Investigation[] = InvestigationSchema.array().parse(investigationsRaw);
export const flammabilityPoints: FlammabilityPoint[] = FlammabilityPointSchema.array().parse(flammabilityPointsRaw);
export const habitats: Habitat[] = HabitatSchema.array().parse(habitatsRaw);
export const meta: Meta = MetaSchema.parse(metaRaw);

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
