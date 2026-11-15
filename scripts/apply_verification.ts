// Writes human verification from data/verification.csv back into data/curated/*.json (docs/DATA_SOURCES.md section 5).
//
//   npm run verify:apply                      apply the statuses that are in data/verification.csv
//   npm run verify:apply -- --sign-off K      first mark every row still "todo" as "ok" by verifier K, then apply
//
// What it does, in order:
//   1. Reads data/verification.csv (one row per field that is not api_direct).
//   2. Keeps data/verification_ledger.csv: every decision (ok / fixed / rejected) with the value, quote and source
//      it was made for. scripts/build_seed_data.py rewrites verification.csv with "todo" on every rebuild; rows whose
//      value, quote and source are unchanged get their decision back from the ledger. A row that changed stays
//      "todo": it has to be verified again.
//   3. For "ok" and "fixed" rows sets prov.verified, verified_by and verified_at in the curated JSON. For "fixed"
//      rows it also copies the corrected quote, source URL and note from the CSV into the JSON. The same correction
//      must be made in scripts/build_seed_data.py, or the next rebuild brings the old text back (and the row
//      returns to "todo", because it no longer matches the ledger).
//   4. Recounts data/curated/meta.json.
//
// The JSON is written in the exact format of the Python builder (indent 2, UTF-8, numbers kept as written),
// so the only lines that change are the ones this script means to change.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CSV_PATH = join(ROOT, 'data', 'verification.csv');
const LEDGER_PATH = join(ROOT, 'data', 'verification_ledger.csv');
const CURATED = join(ROOT, 'data', 'curated');
const DECIDED = new Set(['ok', 'fixed', 'rejected']);

// ---------- CSV (RFC 4180, same dialect as Python's csv module) ----------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const csvField = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const toCsv = (rows: string[][]) => rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';

// ---------- JSON that round-trips the Python builder's output byte for byte ----------

/** A number kept as it was written ("5.0" stays "5.0"). */
class RawNumber {
  constructor(public readonly text: string) {}
}
type Json = null | boolean | string | RawNumber | Json[] | { [key: string]: Json };

function parseJson(text: string): Json {
  let i = 0;
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i += 1;
  };
  const value = (): Json => {
    ws();
    const c = text[i];
    if (c === '{') {
      i += 1;
      const obj: { [key: string]: Json } = {};
      ws();
      if (text[i] === '}') {
        i += 1;
        return obj;
      }
      for (;;) {
        ws();
        const key = string();
        ws();
        i += 1; // ':'
        obj[key] = value();
        ws();
        if (text[i] === ',') {
          i += 1;
          continue;
        }
        i += 1; // '}'
        return obj;
      }
    }
    if (c === '[') {
      i += 1;
      const arr: Json[] = [];
      ws();
      if (text[i] === ']') {
        i += 1;
        return arr;
      }
      for (;;) {
        arr.push(value());
        ws();
        if (text[i] === ',') {
          i += 1;
          continue;
        }
        i += 1; // ']'
        return arr;
      }
    }
    if (c === '"') return string();
    if (text.startsWith('true', i)) return (i += 4), true;
    if (text.startsWith('false', i)) return (i += 5), false;
    if (text.startsWith('null', i)) return (i += 4), null;
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 40));
    if (!m) throw new Error(`unexpected character at ${i}: ${text.slice(i, i + 20)}`);
    i += m[0].length;
    return new RawNumber(m[0]);
  };
  const string = (): string => {
    const start = i;
    i += 1;
    while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i += 1;
    return JSON.parse(text.slice(start, i)) as string;
  };
  return value();
}

function pyString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0) as number;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, '0')}`;
    // ensure_ascii=False in the builder: everything else, including non-ASCII, is written as it is.
    else out += ch;
  }
  return `${out}"`;
}

function pyJson(v: Json, indent = 0): string {
  const pad = ' '.repeat(indent + 2);
  const end = ' '.repeat(indent);
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return pyString(v);
  if (v instanceof RawNumber) return v.text;
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return `[\n${v.map((x) => pad + pyJson(x, indent + 2)).join(',\n')}\n${end}]`;
  }
  const keys = Object.keys(v);
  if (keys.length === 0) return '{}';
  return `{\n${keys.map((k) => `${pad}${pyString(k)}: ${pyJson(v[k], indent + 2)}`).join(',\n')}\n${end}}`;
}

interface CuratedFile {
  path: string;
  data: Json;
  /** Ends with a newline in the original file. */
  newline: string;
}

function loadCurated(name: string): CuratedFile {
  const path = join(CURATED, name);
  const text = readFileSync(path, 'utf8');
  const data = parseJson(text);
  const newline = text.endsWith('\n') ? '\n' : '';
  // Guard: if this script cannot reproduce the file exactly, it must not rewrite it.
  if (pyJson(data) + newline !== text.replace(/\r\n/g, '\n')) {
    throw new Error(`${name}: cannot reproduce the file byte for byte; refusing to rewrite it`);
  }
  return { path, data, newline };
}

// ---------- Locating a field ----------

type Obj = { [key: string]: Json };
const isObj = (v: Json | undefined): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof RawNumber);

/** The provenance object a verification row refers to, or null. */
function findProv(psiId: string, fieldPath: string, files: Record<'inv' | 'points' | 'habitats', CuratedFile>): Obj | null {
  const byKey = (list: Json, key: string, id: string) =>
    Array.isArray(list) ? list.find((x): x is Obj => isObj(x) && x[key] === id) : undefined;

  const point = /^flammability_points\[(.+)\]$/.exec(fieldPath);
  if (point) {
    const p = byKey(files.points.data, 'id', point[1]);
    return p && isObj(p.prov) ? p.prov : null;
  }
  const habitat = /^habitats\[(.+)\]$/.exec(fieldPath);
  if (habitat) {
    const h = byKey(files.habitats.data, 'id', habitat[1]);
    return h && isObj(h.prov) ? h.prov : null;
  }
  let node: Json | undefined = byKey(files.inv.data, 'psi_id', psiId);
  for (const part of fieldPath.split('.')) {
    const m = /^([^[]+)((?:\[\d+\])*)$/.exec(part);
    if (!m || !isObj(node)) return null;
    node = node[m[1]];
    for (const idx of m[2].match(/\d+/g) ?? []) {
      if (!Array.isArray(node)) return null;
      node = node[Number(idx)];
    }
  }
  return isObj(node) && isObj(node.prov) ? node.prov : null;
}

/** Inserts or replaces keys right after `after`, keeping the rest of the key order. */
function setAfter(obj: Obj, after: string, entries: [string, Json][]) {
  const names = new Set(entries.map(([k]) => k));
  const old = Object.entries(obj).filter(([k]) => !names.has(k));
  for (const k of Object.keys(obj)) delete obj[k];
  for (const [k, v] of old) {
    obj[k] = v;
    if (k === after) for (const [nk, nv] of entries) obj[nk] = nv;
  }
  if (!(after in obj)) for (const [nk, nv] of entries) obj[nk] = nv;
}

// ---------- Main ----------

function main() {
  const args = process.argv.slice(2);
  const signOffAt = args.indexOf('--sign-off');
  const signOff = signOffAt >= 0 ? args[signOffAt + 1] : null;
  if (signOffAt >= 0 && !signOff) throw new Error('--sign-off needs the verifier initials');
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const rows = parseCsv(readFileSync(CSV_PATH, 'utf8'));
  const header = rows[0];
  const col = Object.fromEntries(header.map((name, i) => [name, i])) as Record<string, number>;
  for (const name of ['psi_id', 'field_path', 'value', 'quote', 'source_url', 'note', 'status', 'verifier', 'comment']) {
    if (!(name in col)) throw new Error(`verification.csv has no column "${name}"`);
  }
  const body = rows.slice(1);
  const keyOf = (r: string[]) => `${r[col.psi_id]}|${r[col.field_path]}`;

  // Ledger: decisions that survive a rebuild of verification.csv.
  const LEDGER_HEADER = ['psi_id', 'field_path', 'value', 'quote', 'source_url', 'status', 'verifier', 'verified_at', 'comment'];
  const ledger = new Map<string, string[]>();
  if (existsSync(LEDGER_PATH)) {
    for (const r of parseCsv(readFileSync(LEDGER_PATH, 'utf8')).slice(1)) ledger.set(`${r[0]}|${r[1]}`, r);
  }

  let restored = 0;
  let signed = 0;
  let stale = 0;
  for (const r of body) {
    const known = ledger.get(keyOf(r));
    const sameContent = known && known[2] === r[col.value] && known[3] === r[col.quote] && known[4] === r[col.source_url];
    if (r[col.status] === 'todo' && known) {
      if (sameContent) {
        r[col.status] = known[5];
        r[col.verifier] = known[6];
        r[col.comment] = known[8];
        restored += 1;
      } else stale += 1;
    }
    if (r[col.status] === 'todo' && signOff) {
      r[col.status] = 'ok';
      r[col.verifier] = signOff;
      signed += 1;
    }
    if (DECIDED.has(r[col.status])) {
      if (!r[col.verifier]) throw new Error(`${keyOf(r)}: status "${r[col.status]}" without a verifier`);
      const verifiedAt = known && sameContent && known[5] === r[col.status] && known[6] === r[col.verifier] ? known[7] : now;
      ledger.set(keyOf(r), [r[col.psi_id], r[col.field_path], r[col.value], r[col.quote], r[col.source_url], r[col.status], r[col.verifier], verifiedAt, r[col.comment]]);
    } else if (r[col.status] !== 'todo') {
      throw new Error(`${keyOf(r)}: unknown status "${r[col.status]}"`);
    }
  }

  const files = {
    inv: loadCurated('investigations.json'),
    points: loadCurated('flammability_points.json'),
    habitats: loadCurated('habitats.json'),
  };

  const counts = { ok: 0, fixed: 0, rejected: 0, todo: 0 };
  const missing: string[] = [];
  let corrected = 0;
  for (const r of body) {
    const status = r[col.status] as keyof typeof counts;
    counts[status] += 1;
    const prov = findProv(r[col.psi_id], r[col.field_path], files);
    if (!prov) {
      missing.push(keyOf(r));
      continue;
    }
    if (status === 'ok' || status === 'fixed') {
      const entry = ledger.get(keyOf(r)) as string[];
      if (status === 'fixed') {
        // The verifier corrected the quote, the source or the note: the CSV row is the corrected version.
        const ref = prov.source_ref;
        if (isObj(ref) && r[col.source_url] && ref.url !== r[col.source_url]) {
          ref.url = r[col.source_url];
          corrected += 1;
        }
        if (r[col.quote] && prov.quote !== r[col.quote]) {
          prov.quote = r[col.quote];
          corrected += 1;
        }
        if (r[col.note] === '' && 'note' in prov) {
          delete prov.note;
          corrected += 1;
        } else if (r[col.note] !== '' && prov.note !== r[col.note]) {
          prov.note = r[col.note];
          corrected += 1;
        }
      }
      prov.verified = true;
      setAfter(prov, 'verified', [
        ['verified_by', entry[6]],
        ['verified_at', entry[7]],
      ]);
    } else {
      // todo or rejected: not verified. A rejected value has to be removed through scripts/build_seed_data.py.
      prov.verified = false;
      delete prov.verified_by;
      delete prov.verified_at;
    }
  }
  if (missing.length > 0) {
    throw new Error(`${missing.length} rows point to a field that is not in the curated data, e.g. ${missing.slice(0, 5).join(', ')}`);
  }

  // meta.json: same counting as scripts/build_seed_data.py (fields of investigations; points counted separately).
  const tally = { total: 0, verified: 0 };
  const walk = (v: Json) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (isObj(v)) {
      if (isObj(v.prov) && 'value' in v) {
        tally.total += 1;
        if (v.prov.verified === true) tally.verified += 1;
        return;
      }
      for (const [k, x] of Object.entries(v)) if (k !== 'prov') walk(x);
    }
  };
  walk(files.inv.data);
  const points = files.points.data as Json[];
  const pointsUnverified = points.filter((p) => isObj(p) && isObj(p.prov) && p.prov.verified !== true).length;

  const meta = loadCurated('meta.json');
  if (!isObj(meta.data)) throw new Error('meta.json is not an object');
  meta.data.n_fields_total = new RawNumber(String(tally.total));
  meta.data.n_fields_verified = new RawNumber(String(tally.verified));
  meta.data.n_points_unverified = new RawNumber(String(pointsUnverified));
  meta.data.note =
    'n_fields_verified counts api_direct fields (copied or computed from PSI) and the llm_extracted and manual fields that a human ' +
    'marked ok or fixed in data/verification.csv (applied by scripts/apply_verification.ts; decisions kept in data/verification_ledger.csv). ' +
    'psi_snapshot_hash is the sha256 of the extracts (flex_tests.txt, bass2_tests.txt) and of the investigation records, not of the whole PSI snapshot.';

  for (const f of [files.inv, files.points, files.habitats, meta]) writeFileSync(f.path, pyJson(f.data) + f.newline);
  writeFileSync(CSV_PATH, toCsv([header, ...body]));
  const ledgerRows = [...ledger.values()].sort((a, b) => `${a[0]}|${a[1]}`.localeCompare(`${b[0]}|${b[1]}`));
  writeFileSync(LEDGER_PATH, toCsv([LEDGER_HEADER, ...ledgerRows]));

  console.log(`verification.csv: ${body.length} rows: ${counts.ok} ok, ${counts.fixed} fixed, ${counts.rejected} rejected, ${counts.todo} todo`);
  if (signed) console.log(`signed off by ${signOff}: ${signed} rows`);
  if (restored) console.log(`restored from the ledger: ${restored} rows`);
  if (stale) console.log(`changed since they were verified, left as todo: ${stale} rows`);
  if (corrected) console.log(`corrections copied into the curated JSON: ${corrected}`);
  console.log(`meta.json: ${tally.verified} of ${tally.total} fields verified, ${pointsUnverified} of ${points.length} test runs unverified`);
}

main();
