// Report pipeline without the LLM: context, citation validator, claim checks. Runs on the real curated data.
import { describe, expect, it } from 'vitest';
import { flammabilityPoints, habitats, investigations } from '@/lib/data';
import type { Conditions, HabitatId } from '@/lib/types';
import { buildReportContext, nearestHabitatId, TOP_N } from './context';
import { SYSTEM_PROMPT } from './generate';
import { checkReport, normalizeTypography, REPORT_HEADINGS, tidyReport, validateCitations } from './validate';

function conditions(id: HabitatId): Conditions {
  const h = habitats.find((x) => x.id === id);
  if (!h) throw new Error(`habitat ${id} missing`);
  return { o2_mole_fraction: h.o2_mole_fraction, pressure_kpa: h.pressure_kpa, flow_cm_s: h.flow_cm_s, material_class: 'thin_fabric', gravity_g: h.gravity_g };
}

/** A report that passes every check; tests change one thing at a time. */
const GOOD = [
  REPORT_HEADINGS[0],
  ...Array.from({ length: 12 }, (_, i) => `- Thin fabric burned in test run group ${i + 1} at about 21% oxygen and one atmosphere in microgravity, with flow between 5 and 20 cm/s [PSI-25].`),
  REPORT_HEADINGS[1],
  '- The flame-temperature margin is a physics estimate, not a test result [PSI-25].',
  '- Almost every solid run was sustained, so no flammability limit can be located [PSI-25].',
  REPORT_HEADINGS[2],
  '- Partial gravity is untested and may be more hazardous than microgravity and Earth gravity (NTRS 20260000646).',
  REPORT_HEADINGS[3],
  '- Flame spread on thin fabric at 30% oxygen and 70 kPa in lunar gravity: not covered by PSI data.',
].join('\n');

describe('validateCitations', () => {
  const allowed = ['PSI-25', 'PSI-69'];

  it('keeps allowed IDs and reports them in order of first use', () => {
    const r = validateCitations('A [PSI-69]. B [PSI-25]. C [PSI-69].', allowed);
    expect(r.markdown).toBe('A [PSI-69]. B [PSI-25]. C [PSI-69].');
    expect(r.citations).toEqual(['PSI-69', 'PSI-25']);
    expect(r.stripped).toEqual([]);
  });

  it('strips IDs that are not in the context and leaves clean text', () => {
    const r = validateCitations('Fabric burned [PSI-999]. Droplets burned [PSI-69].', allowed);
    expect(r.markdown).toBe('Fabric burned. Droplets burned [PSI-69].');
    expect(r.citations).toEqual(['PSI-69']);
    expect(r.stripped).toEqual(['PSI-999']);
  });

  it('handles several IDs in one bracket', () => {
    const r = validateCitations('Both burned [PSI-25, PSI-123; PSI-69].', allowed);
    expect(r.markdown).toBe('Both burned [PSI-25][PSI-69].');
    expect(r.stripped).toEqual(['PSI-123']);
  });

  it('is case-insensitive and leaves non-PSI sources alone', () => {
    const r = validateCitations('Nomex failed (NTRS 20070018178) [psi-25].', allowed);
    expect(r.markdown).toBe('Nomex failed (NTRS 20070018178) [PSI-25].');
    expect(r.citations).toEqual(['PSI-25']);
  });

  it('never returns an ID outside the allowed list', () => {
    const r = validateCitations('[PSI-1] [PSI-2][PSI-25] [PSI-3, PSI-4]', allowed);
    expect(r.citations.every((id) => allowed.includes(id))).toBe(true);
    expect(r.markdown).not.toMatch(/PSI-[1234]\b/);
  });
});

describe('checkReport', () => {
  it('accepts a well-formed report', () => {
    expect(checkReport(GOOD)).toEqual([]);
  });

  it('requires the four sections in order', () => {
    expect(checkReport(GOOD.replace(REPORT_HEADINGS[2], '## Missing data')).join(' ')).toContain('missing section');
    const swapped = GOOD.replace(REPORT_HEADINGS[1], '## X').replace(REPORT_HEADINGS[2], REPORT_HEADINGS[1]).replace('## X', REPORT_HEADINGS[2]);
    expect(checkReport(swapped).join(' ')).toContain('out of order');
  });

  it('rejects the claim that 0 g and 1 g tests bound partial gravity', () => {
    const bad = `${GOOD}\n- Microgravity and Earth-gravity results bound the behaviour in lunar gravity [PSI-25].`;
    expect(checkReport(bad).join(' ')).toContain('bound partial gravity');
    const fine = `${GOOD}\n- Microgravity and Earth-gravity results do not bound lunar gravity (NTRS 20260000646).`;
    expect(checkReport(fine)).toEqual([]);
  });

  it('rejects calling a fire-resistant material safe, and blanket "did not burn"', () => {
    expect(checkReport(`${GOOD}\n- Nomex is safe in this atmosphere [PSI-25].`).join(' ')).toContain('safe');
    expect(checkReport(`${GOOD}\n- Fire-resistant materials did not burn at these oxygen levels [PSI-25].`).join(' ')).toContain('generalises');
    expect(checkReport(`${GOOD}\n- 3 of the 4 Nomex runs kept burning and 1 did not ignite [PSI-25].`)).toEqual([]);
  });

  it('rejects a margin that is not called a physics estimate', () => {
    const bad = GOOD.replace('is a physics estimate, not a test result', 'was measured in the tests');
    expect(checkReport(bad).join(' ')).toContain('physics estimate');
  });

  it('rejects rockets and propellants, a missing citation and a text that is too short', () => {
    expect(checkReport(`${GOOD}\n- Rocket propellants were not considered [PSI-25].`).join(' ')).toContain('rockets');
    expect(checkReport(GOOD.replace(/\[PSI-25\]/g, '')).join(' ')).toContain('no PSI citation');
    expect(checkReport(REPORT_HEADINGS.join('\nShort [PSI-25].\n')).join(' ')).toContain('too short');
  });

  it('rejects "droplets are untested" when droplet runs cover the target', () => {
    const bad = `${GOOD}\n- Extend liquid-fuel droplet runs to this pressure and oxygen level [PSI-69].`;
    expect(checkReport(bad, { dropletsCovered: true }).join(' ')).toContain('droplets');
    expect(checkReport(bad, { dropletsCovered: false })).toEqual([]);
    const fine = `${GOOD}\n- No droplet data exist in partial gravity [PSI-69].`;
    expect(checkReport(fine, { dropletsCovered: true })).toEqual([]);
  });
});

describe('checkReport: facts from the context', () => {
  it('rejects a count of runs of a material that is larger than the data', () => {
    const facts = { fireResistantRuns: { Nomex: 4, silicone: 4 } };
    expect(checkReport(`${GOOD}\n- 3 Nomex runs burned, 5 silicone runs did not [PSI-99].`, facts).join(' ')).toContain('counts 5 silicone runs');
    expect(checkReport(`${GOOD}\n- 3 Nomex runs burned; 4 silicone runs and 1 Nomex run did not [PSI-99].`, facts)).toEqual([]);
  });

  it('rejects a report that leaves out droplet runs that cover the atmosphere', () => {
    expect(checkReport(GOOD, { dropletsCovered: true }).join(' ')).toContain('omits the droplet test runs');
    expect(checkReport(`${GOOD}\n- All 8 nearest droplet runs kept burning [PSI-69].`, { dropletsCovered: true })).toEqual([]);
  });

  it('the context supplies those facts from the data', () => {
    const context = buildReportContext(conditions('moon_base'), 'moon_base');
    const resistant = flammabilityPoints.filter((p) => p.material_class === 'fire_resistant');
    expect(Object.values(context.fireResistantRuns).reduce((a, b) => a + b, 0)).toBe(resistant.length);
    expect(context.text).toContain('Copy these counts exactly');
  });
});

describe('normalizeTypography', () => {
  it('turns non-breaking hyphens and spaces into plain ones', () => {
    expect(normalizeTypography('PSI‑25 at 30 % O2 – “sustained”')).toBe('PSI-25 at 30 % O2 - "sustained"');
  });

  it('turns lenticular citation brackets into square ones, so they are validated', () => {
    const text = normalizeTypography('Fabric burned【PSI-25】【PSI-999】.');
    const r = validateCitations(text, ['PSI-25']);
    expect(r.markdown).toBe('Fabric burned[PSI-25].');
    expect(r.stripped).toEqual(['PSI-999']);
  });
});

describe('tidyReport', () => {
  it('puts NTRS sources in round brackets, once, and spaces PSI citations', () => {
    const messy = '- Nomex failed (NTRS 20070018178)[NTRS 20070018178]  \n- Untested[NTRS 20260000646]\n- Fabric burned[PSI-25][PSI-98] ';
    expect(tidyReport(messy)).toBe(
      '- Nomex failed (NTRS 20070018178)\n- Untested(NTRS 20260000646)\n- Fabric burned [PSI-25][PSI-98]',
    );
  });
});

describe('buildReportContext', () => {
  it.each(habitats.map((h) => h.id))('%s: cites only curated investigations and fits the token budget', (id) => {
    const context = buildReportContext(conditions(id), id);
    const known = new Set(investigations.map((inv) => inv.psi_id));
    expect(context.allowedIds.length).toBeGreaterThanOrEqual(TOP_N);
    expect(context.allowedIds.every((x) => known.has(x))).toBe(true);
    expect(new Set(context.allowedIds).size).toBe(context.allowedIds.length);
    for (const x of context.allowedIds) expect(context.text).toContain(`[${x}]`);
    // About 4 characters per token: context plus system prompt must leave room for 3000 completion tokens under 8000.
    expect((context.text.length + SYSTEM_PROMPT.length) / 4).toBeLessThan(4800);
    // No provenance quotes and no vendor names in what the model sees.
    expect(context.text).not.toMatch(/"quote"|source_ref|verified_by/);
  });

  it('always lists the investigations that supplied solid test runs, so they can be cited', () => {
    const solidSources = new Set(flammabilityPoints.filter((p) => p.material_class !== 'liquid_droplet').map((p) => p.psi_id));
    const context = buildReportContext(conditions('spacesuit'), 'spacesuit');
    for (const id of solidSources) expect(context.allowedIds).toContain(id);
  });

  it('carries the facts the report must state, with numbers computed from the data', () => {
    const text = buildReportContext(conditions('moon_base'), 'moon_base').text;
    const solids = flammabilityPoints.filter((p) => ['thin_fabric', 'thin_solid', 'thick_solid'].includes(p.material_class));
    const sustained = solids.filter((p) => p.outcome === 'sustained').length;
    expect(text).toContain(`${sustained} of the ${solids.length} ordinary solid test runs`);
    expect(text).toContain('cannot locate a flammability limit');
    expect(text).toContain('NOT "safe"');
    expect(text).toContain('Nomex HT90-40 failed NASA-STD-6001 Test 1 at 30% O2 and 70.1 kPa');
    expect(text).toContain('do NOT bound lunar or Martian gravity');
    expect(text).toContain('NO TEST DATA'); // solids at the Moon base
    expect(text).toContain('TEST RUNS EXIST'); // FLEX droplets at the Moon base
  });

  it('knows when droplet runs cover the target', () => {
    expect(buildReportContext(conditions('moon_base'), 'moon_base').dropletsCovered).toBe(true);
    expect(buildReportContext(conditions('spacesuit'), 'spacesuit').dropletsCovered).toBe(false);
  });

  it('is deterministic', () => {
    expect(buildReportContext(conditions('iss'), 'iss')).toEqual(buildReportContext(conditions('iss'), 'iss'));
  });
});

describe('nearestHabitatId', () => {
  it('returns the preset itself for preset conditions and the closest one otherwise', () => {
    expect(nearestHabitatId(conditions('spacesuit'))).toBe('spacesuit');
    expect(nearestHabitatId(conditions('exploration_8_2'))).toBe('exploration_8_2');
    const near = nearestHabitatId({ ...conditions('exploration_10_2'), o2_mole_fraction: 0.27 });
    expect(near).toBe('exploration_10_2');
  });
});

describe('system prompt', () => {
  it('states the rules the app relies on', () => {
    for (const heading of REPORT_HEADINGS) expect(SYSTEM_PROMPT).toContain(heading);
    expect(SYSTEM_PROMPT).toContain('physics estimate');
    expect(SYSTEM_PROMPT).toContain('not covered by PSI data');
    expect(SYSTEM_PROMPT).toMatch(/Never say or imply that microgravity and Earth-gravity results bound/);
    expect(SYSTEM_PROMPT).toMatch(/rockets or propellants/);
  });
});

describe('POST /api/report without an LLM: the cached report', () => {
  const post = async (body: unknown) => {
    // No provider configured: the route must still answer.
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_FALLBACK_BASE_URL;
    delete process.env.LLM_FALLBACK_API_KEY;
    delete process.env.LLM_FALLBACK_MODEL;
    const { POST } = await import('./route');
    return POST(new Request('http://localhost/api/report', { method: 'POST', body: JSON.stringify(body) }));
  };

  it.each(habitats.map((h) => h.id))('%s: a cached report that passes every check and cites only curated investigations', async (id) => {
    const res = await post({ conditions: conditions(id), habitat_id: id });
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.cached).toBe(true);
    const known = new Set(investigations.map((inv) => inv.psi_id));
    expect(report.citations.length).toBeGreaterThan(0);
    expect(report.citations.every((x: string) => known.has(x))).toBe(true);
    const context = buildReportContext(conditions(id), id);
    expect(checkReport(report.markdown, { dropletsCovered: context.dropletsCovered, fireResistantRuns: context.fireResistantRuns })).toEqual([]);
    // Every PSI ID in the text is one the report was allowed to cite.
    for (const cited of report.markdown.match(/PSI-\d+/g) ?? []) expect(known.has(cited)).toBe(true);
    expect(report.markdown).not.toMatch(/MOCK/i);
  });

  it('without a habitat id, serves the report of the nearest preset', async () => {
    const res = await post({ conditions: { ...conditions('moon_base'), o2_mole_fraction: 0.31 } });
    const report = await res.json();
    expect(report.cached).toBe(true);
    expect(report.markdown).toContain('## What the data says');
  });

  it('rejects a malformed request', async () => {
    expect((await post({ conditions: { o2_mole_fraction: 3 } })).status).toBe(400);
  });
});

describe('LLM client: endpoints are tried in order', () => {
  const ENV = ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL', 'LLM_FALLBACK_BASE_URL', 'LLM_FALLBACK_API_KEY', 'LLM_FALLBACK_MODEL', 'LLM_REASONING_EFFORT'];
  const withEnv = async (values: Record<string, string>, run: () => Promise<void>) => {
    const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
    for (const k of ENV) delete process.env[k];
    Object.assign(process.env, values);
    const realFetch = globalThis.fetch;
    try {
      await run();
    } finally {
      globalThis.fetch = realFetch;
      for (const k of ENV) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  };

  it('no variables: no config, so the route serves the cached report', async () => {
    await withEnv({}, async () => {
      const { getLlmConfig } = await import('./llm');
      expect(getLlmConfig()).toBeNull();
    });
  });

  it('a rate-limited model falls through to the next model, then to the fallback provider', async () => {
    await withEnv(
      {
        LLM_BASE_URL: 'https://main.example/v1/',
        LLM_API_KEY: 'main-key',
        LLM_MODEL: 'model-a, model-b',
        LLM_FALLBACK_BASE_URL: 'https://second.example/v1',
        LLM_FALLBACK_API_KEY: 'second-key',
        LLM_FALLBACK_MODEL: 'model-c',
      },
      async () => {
        const { chatCompletion, getLlmConfig } = await import('./llm');
        const cfg = getLlmConfig();
        expect(cfg?.endpoints.map((e) => `${e.baseUrl}|${e.model}`)).toEqual([
          'https://main.example/v1|model-a',
          'https://main.example/v1|model-b',
          'https://second.example/v1|model-c',
        ]);
        const calls: string[] = [];
        globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
          const model = JSON.parse(String(init?.body)).model as string;
          const auth = (init?.headers as Record<string, string>).Authorization;
          calls.push(`${String(url)}|${model}|${auth}`);
          if (model === 'model-a') return new Response('{}', { status: 429, headers: { 'retry-after': '120' } });
          if (model === 'model-b') return new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 });
          return new Response(JSON.stringify({ choices: [{ message: { content: 'report text' } }] }), { status: 200 });
        }) as typeof fetch;
        if (!cfg) throw new Error('config expected');
        const result = await chatCompletion(cfg, [{ role: 'user', content: 'x' }]);
        expect(result).toEqual({ text: 'report text', model: 'model-c' });
        expect(calls).toEqual([
          'https://main.example/v1/chat/completions|model-a|Bearer main-key',
          'https://main.example/v1/chat/completions|model-b|Bearer main-key',
          'https://second.example/v1/chat/completions|model-c|Bearer second-key',
        ]);
      },
    );
  });

  it('when every endpoint fails, the error reaches the caller (which serves the cached report)', async () => {
    await withEnv({ LLM_BASE_URL: 'https://main.example/v1', LLM_API_KEY: 'k', LLM_MODEL: 'model-a' }, async () => {
      const { chatCompletion, getLlmConfig, LlmHttpError } = await import('./llm');
      globalThis.fetch = (async () => new Response('{}', { status: 429, headers: { 'retry-after': '30' } })) as typeof fetch;
      const cfg = getLlmConfig();
      if (!cfg) throw new Error('config expected');
      await expect(chatCompletion(cfg, [{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(LlmHttpError);
    });
  });

  it('sends reasoning_effort "low" to gpt-oss models only, unless overridden', async () => {
    await withEnv({ LLM_BASE_URL: 'https://main.example/v1', LLM_API_KEY: 'k', LLM_MODEL: 'openai/gpt-oss-120b,other-model' }, async () => {
      const { chatCompletion, getLlmConfig } = await import('./llm');
      const bodies: Record<string, unknown>[] = [];
      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        return body.model === 'other-model'
          ? new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })
          : new Response('{}', { status: 500 });
      }) as typeof fetch;
      const cfg = getLlmConfig();
      if (!cfg) throw new Error('config expected');
      await chatCompletion(cfg, [{ role: 'user', content: 'x' }]);
      expect(bodies[0].reasoning_effort).toBe('low');
      expect('reasoning_effort' in bodies[1]).toBe(false);
    });
  });
});
