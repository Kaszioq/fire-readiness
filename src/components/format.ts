// Role B. Display-only helpers: unit conversion happens here, at the edge (docs/CONTRACTS.md section 0).
import type {
  FlammabilityPoint,
  FuelPhase,
  Habitat,
  Investigation,
  MaterialClass,
  SafetyDomain,
  SourceType,
  Zone,
} from '@/lib/types';

const KPA_PER_PSI = 6.894757;

/** 0.265 -> "26.5%", 0.3 -> "30%" */
export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return 'n/a';
  return `${Number((fraction * 100).toFixed(1))}%`;
}

export function formatKpa(kpa: number): string {
  if (!Number.isFinite(kpa)) return 'n/a';
  return `${Number(kpa.toFixed(1))} kPa`;
}

export function formatPsi(kpa: number): string {
  if (!Number.isFinite(kpa)) return 'n/a';
  return `${(kpa / KPA_PER_PSI).toFixed(1)} psi`;
}

/** Fixed decimals, or "n/a" for a missing or non-finite number. */
export function formatNumber(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

/** Clamp to 0..1 for bars; a non-finite value draws as empty. */
export function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** plural(1, 'test run') -> "1 test run", plural(8, 'test run') -> "8 test runs" */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Some curated URLs carry a note after the address ("https://… (challenge statement)"). Keep only a safe http(s) URL. */
export function sourceHref(url: string | undefined): string | undefined {
  const first = url?.trim().split(/\s+/)[0];
  return first && /^https?:\/\//i.test(first) ? first : undefined;
}

/** Ground investigations have no acronym in PSI: fall back to the PSI ID. */
export function investigationName(inv: Pick<Investigation, 'acronym' | 'psi_id'> | undefined, psiId?: string): string {
  return inv?.acronym || inv?.psi_id || psiId || 'unknown';
}

export const HABITAT_SHORT: Record<Habitat['id'], string> = {
  earth: 'Earth',
  iss: 'ISS',
  orion: 'Orion',
  moon_base: 'Moon base',
  pressurized_rover: 'Lunar rover',
  mars_habitat: 'Mars habitat',
  spacesuit: 'Spacesuit',
  exploration_10_2: 'Exploration 10.2 psia',
  exploration_8_2: 'Exploration 8.2 psia',
};

export const MATERIAL_LABEL: Record<MaterialClass, string> = {
  thin_fabric: 'Thin fabric',
  thin_solid: 'Thin solid film',
  thick_solid: 'Thick solid',
  liquid_droplet: 'Liquid droplet',
  gas_jet: 'Gas jet',
  fire_resistant: 'Fire-resistant material (silicone, Nomex)',
};

// fire_resistant (silicone, Nomex) are solid test runs too; the predictor treats them separately.
export const SOLID_CLASSES: MaterialClass[] = ['thin_fabric', 'thin_solid', 'thick_solid', 'fire_resistant'];

/** The ordinary solid classes the predictor estimates (fire_resistant has its own, material-specific limit). */
export const ORDINARY_SOLID_CLASSES: MaterialClass[] = ['thin_fabric', 'thin_solid', 'thick_solid'];

/** Limitation of the solid data, with the counts taken from the test runs (docs/STATUS.md point 13). */
export function solidDataLimitation(points: FlammabilityPoint[]): string {
  const solids = points.filter((p) => ORDINARY_SOLID_CLASSES.includes(p.material_class));
  const sustained = solids.filter((p) => p.outcome === 'sustained').length;
  return `${sustained} of ${solids.length} solid-material runs in the PSI data sustained burning, so the data say little about where solids stop burning.`;
}

export const ZONE_LABEL: Record<Zone, string> = {
  sustained: 'Sustained burning',
  marginal: 'Marginal',
  extinguishes: 'Extinguishes',
  no_evidence: 'No evidence',
};

export const SOURCE_LABEL: Record<SourceType, string> = {
  psi_api: 'NASA PSI record',
  experimental_table: 'PSI experimental table',
  psi_document: 'PSI document',
  publication: 'Publication',
  challenge_text: 'Challenge statement',
  nasa_web: 'NASA web page',
};

export const FUEL_LABEL: Record<FuelPhase, string> = {
  solid: 'Solid fuel',
  liquid: 'Liquid fuel',
  gas: 'Gas fuel',
};

export const DOMAIN_LABEL: Record<SafetyDomain, string> = {
  prevention: 'Prevention',
  detection: 'Detection',
  suppression: 'Suppression',
  fundamental: 'Fundamental',
};
