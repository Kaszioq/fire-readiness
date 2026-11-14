// zod schemas for everything in src/lib/types.ts. Used by `npm run validate:data`, the data loader and the report route.
// The block at the bottom fails to compile if a schema and its type drift apart.
import { z } from 'zod';
import type * as T from './types';

// ---------- Provenance ----------

export const SourceTypeSchema = z.enum([
  'psi_api',
  'experimental_table',
  'psi_document',
  'publication',
  'challenge_text',
  'nasa_web',
]);

export const ExtractionMethodSchema = z.enum(['api_direct', 'llm_extracted', 'manual']);

export const SourceRefSchema = z.object({
  url: z.string().min(1),
  file: z.string().optional(),
  locator: z.string().optional(),
});

export const ProvenanceSchema = z.object({
  source_type: SourceTypeSchema,
  source_ref: SourceRefSchema,
  quote: z.string().optional(),
  method: ExtractionMethodSchema,
  verified: z.boolean(),
  verified_by: z.string().optional(),
  verified_at: z.string().optional(),
  note: z.string().optional(),
});

const QUOTE_REQUIRED = 'quote is required for llm_extracted and manual values';

/** Field<T>. A non-null value extracted by an LLM or by hand must carry a supporting quote. */
export function field<S extends z.ZodType>(value: S) {
  return z
    .object({
      value: value.nullable(),
      unit: z.string().optional(),
      prov: ProvenanceSchema,
    })
    .refine(
      (raw) => {
        const f = raw as unknown as { value: unknown; prov: T.Provenance };
        return f.value === null || f.prov.method === 'api_direct' || Boolean(f.prov.quote);
      },
      { message: QUOTE_REQUIRED, path: ['prov', 'quote'] },
    );
}

export const RangeSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
});

// ---------- Investigation ----------

export const ProjectTypeSchema = z.enum(['flight', 'ground']);
export const FuelPhaseSchema = z.enum(['solid', 'liquid', 'gas']);
export const SafetyDomainSchema = z.enum(['prevention', 'detection', 'suppression', 'fundamental']);
export const TierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const GravityLevelSchema = z.enum(['micro', 'normal', 'partial_emulated', 'mixed']);
export const HabitatIdSchema = z.enum([
  'iss',
  'orion',
  'moon_base',
  'pressurized_rover',
  'mars_habitat',
  'spacesuit',
  'earth',
]);

const PsiIdSchema = z.string().regex(/^PSI-\d+$/, 'expected a PSI ID like "PSI-26"');
const mole = z.number().min(0).max(1);

export const InvestigationSchema = z.object({
  psi_id: PsiIdSchema,
  acronym: z.string(),
  title: z.string(),
  doi: z.string().nullable(),
  psi_url: z.string().min(1),
  project_type: ProjectTypeSchema,

  hardware: field(z.array(z.string())),
  platform: field(z.string()),
  start_date: field(z.string()),
  end_date: field(z.string()),
  managing_center: field(z.string()),
  license: field(z.string()),

  objective_summary: field(z.string()),
  approach_summary: field(z.string()),
  key_findings: z.array(field(z.string())),

  fuel: z.object({
    phase: field(z.array(FuelPhaseSchema)),
    materials: field(z.array(z.string())),
    geometry: field(z.string()),
    size: field(z.string()),
  }),

  conditions: z.object({
    o2_mole_fraction: field(RangeSchema),
    pressure_kpa: field(RangeSchema),
    flow_cm_s: field(RangeSchema),
    diluents: field(z.array(z.string())),
    gravity: field(GravityLevelSchema),
    n_tests: field(z.number()),
  }),

  variables_varied: field(z.array(z.string())),
  variables_constant: field(z.array(z.string())),
  measurements: field(z.array(z.string())),

  safety_domains: field(z.array(SafetyDomainSchema)),
  tier: field(TierSchema),
  habitat_relevance_notes: z.partialRecord(HabitatIdSchema, field(z.string())),

  uses_data_from: field(z.array(PsiIdSchema)),

  data_availability: z.object({
    n_files: z.number().int().min(0),
    total_bytes: z.number().min(0),
    has_experimental_table: z.boolean(),
    formats: z.array(z.string()),
    prov: ProvenanceSchema,
  }),

  publications: z.array(
    z.object({
      title: z.string(),
      authors: z.string(),
      doi: z.string().nullable(),
    }),
  ),
});

// ---------- Flammability points ----------

export const MaterialClassSchema = z.enum(['thin_fabric', 'thick_solid', 'liquid_droplet', 'gas_jet']);
export const OutcomeSchema = z.enum(['sustained', 'marginal', 'extinguished', 'no_ignition']);

export const FlammabilityPointSchema = z
  .object({
    id: z.string(),
    psi_id: PsiIdSchema,
    test_id: z.string().min(1),
    material: z.string(),
    material_class: MaterialClassSchema,
    o2_mole_fraction: mole,
    pressure_kpa: z.number().positive(),
    flow_cm_s: z.number().nullable(),
    diluent: z.string().nullable(),
    gravity: GravityLevelSchema,
    outcome: OutcomeSchema,
    spread_rate_mm_s: z.number().nullable(),
    prov: ProvenanceSchema,
  })
  .refine((p) => p.id === `${p.psi_id}:${p.test_id}`, {
    message: 'id must equal `${psi_id}:${test_id}`',
    path: ['id'],
  })
  .refine((p) => p.prov.method === 'api_direct' || Boolean(p.prov.quote), {
    message: QUOTE_REQUIRED,
    path: ['prov', 'quote'],
  });

// ---------- Habitats ----------

export const HabitatSchema = z.object({
  id: HabitatIdSchema,
  name: z.string(),
  o2_mole_fraction: mole,
  pressure_kpa: z.number().positive(),
  flow_cm_s: z.number().nullable(),
  gravity_g: z.number().min(0),
  is_assumption: z.boolean(),
  prov: ProvenanceSchema,
});

// ---------- Predictor / ranking / report ----------

export const ConditionsSchema = z.object({
  o2_mole_fraction: mole,
  pressure_kpa: z.number().positive(),
  flow_cm_s: z.number().nullable(),
  material_class: MaterialClassSchema,
  gravity_g: z.number().min(0),
});

export const ReportRequestSchema = z.object({
  conditions: ConditionsSchema,
  habitat_id: HabitatIdSchema.optional(),
  language: z.literal('en').optional(),
});

export const ReportResponseSchema = z.object({
  markdown: z.string(),
  citations: z.array(z.string()),
  stripped_citations: z.array(z.string()),
  model: z.string(),
  generated_at: z.string(),
  cached: z.boolean(),
});

// ---------- Data files ----------

export const MetaSchema = z.object({
  fetched_at: z.string(),
  psi_snapshot_hash: z.string(),
  n_investigations: z.number().int().min(0),
  n_fields_total: z.number().int().min(0),
  n_fields_verified: z.number().int().min(0),
});

// ---------- Compile-time check: schemas and types.ts must agree in both directions ----------

type Same<A extends B, B extends C, C = A> = true;

export type SchemaTypeChecks = [
  Same<z.infer<typeof InvestigationSchema>, T.Investigation>,
  Same<z.infer<typeof FlammabilityPointSchema>, T.FlammabilityPoint>,
  Same<z.infer<typeof HabitatSchema>, T.Habitat>,
  Same<z.infer<typeof ConditionsSchema>, T.Conditions>,
  Same<z.infer<typeof ReportRequestSchema>, T.ReportRequest>,
  Same<z.infer<typeof ReportResponseSchema>, T.ReportResponse>,
  Same<z.infer<typeof MetaSchema>, T.Meta>,
];
