// The only place in src/ that imports from data/. Everything else imports from '@/lib/data'.
// Curated data and the pre-generated reports; nothing here reads data/mock/.
import reportEarth from '@data/cached_reports/earth.json';
import reportExploration102 from '@data/cached_reports/exploration_10_2.json';
import reportExploration82 from '@data/cached_reports/exploration_8_2.json';
import reportIss from '@data/cached_reports/iss.json';
import reportMarsHabitat from '@data/cached_reports/mars_habitat.json';
import reportMoonBase from '@data/cached_reports/moon_base.json';
import reportOrion from '@data/cached_reports/orion.json';
import reportPressurizedRover from '@data/cached_reports/pressurized_rover.json';
import reportSpacesuit from '@data/cached_reports/spacesuit.json';
import flameTemperatureRaw from '@data/curated/flame_temperature.json';
import flammabilityPointsRaw from '@data/curated/flammability_points.json';
import habitatsRaw from '@data/curated/habitats.json';
import investigationsRaw from '@data/curated/investigations.json';
import metaRaw from '@data/curated/meta.json';
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
export const DATA_IS_MOCK = false; // curated PSI snapshot of 2026-11-14 (see data/curated/mappings.md)

// Parsing here gives exact types and makes the build fail on malformed data.
export const investigations: Investigation[] = InvestigationSchema.array().parse(investigationsRaw);
export const flammabilityPoints: FlammabilityPoint[] = FlammabilityPointSchema.array().parse(flammabilityPointsRaw);
export const habitats: Habitat[] = HabitatSchema.array().parse(habitatsRaw);
export const meta: Meta = MetaSchema.parse(metaRaw);
/** Physics layer: adiabatic flame temperatures precomputed offline (docs/PHYSICS.md). Used by src/lib/predict. */
export const flameTemperature: FlameTemperature = FlameTemperatureSchema.parse(flameTemperatureRaw);

/**
 * Pre-generated reports, one per habitat preset (data/cached_reports/, written by `npm run reports`).
 * The Record type makes the build fail if a preset has no report.
 */
const cachedReports: Record<HabitatId, ReportResponse> = {
  earth: ReportResponseSchema.parse(reportEarth),
  iss: ReportResponseSchema.parse(reportIss),
  orion: ReportResponseSchema.parse(reportOrion),
  moon_base: ReportResponseSchema.parse(reportMoonBase),
  pressurized_rover: ReportResponseSchema.parse(reportPressurizedRover),
  mars_habitat: ReportResponseSchema.parse(reportMarsHabitat),
  spacesuit: ReportResponseSchema.parse(reportSpacesuit),
  exploration_10_2: ReportResponseSchema.parse(reportExploration102),
  exploration_8_2: ReportResponseSchema.parse(reportExploration82),
};

export function getInvestigation(psiId: string): Investigation | undefined {
  return investigations.find((i) => i.psi_id === psiId);
}

export function getHabitat(id: string | undefined): Habitat | undefined {
  return habitats.find((h) => h.id === id);
}

/** Pre-generated report for a habitat preset: the fallback of POST /api/report and the instant report in the demo. */
export function getCachedReport(habitatId: HabitatId = 'moon_base'): ReportResponse {
  return { ...cachedReports[habitatId], cached: true };
}
