"use client";

// Role B. Searchable, filterable investigation list (docs/SPEC.md module 1).
// Filters: within a group any selected value matches (OR); groups combine (AND).
// The state lives in the URL (?q=…&type=flight&tier=1,2…), so a filtered view can be shared and survives reload.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DOMAIN_LABEL, FUEL_LABEL, plural } from "@/components/format";
import type { FuelPhase, ProjectType, SafetyDomain, Tier } from "@/lib/types";

export interface InvestigationItem {
  psi_id: string;
  name: string;
  hasAcronym: boolean;
  title: string;
  project_type: ProjectType;
  tier: Tier | null;
  phases: FuelPhase[];
  domains: SafetyDomain[];
  /** Normalized hardware keys (see hardwareKey in the page). */
  hardware: string[];
  hasTable: boolean;
  /** Lower-case text the search box matches against. */
  searchText: string;
}

type GroupId = "type" | "tier" | "fuel" | "domain";
type Selection = Record<GroupId, string[]>;

const EMPTY: Selection = { type: [], tier: [], fuel: [], domain: [] };

const GROUPS: {
  id: GroupId;
  label: string;
  options: { value: string; label: string }[];
}[] = [
  {
    id: "type",
    label: "Type",
    options: [
      { value: "flight", label: "Flight" },
      { value: "ground", label: "Ground" },
    ],
  },
  {
    id: "tier",
    label: "Tier",
    options: [
      { value: "1", label: "Tier 1" },
      { value: "2", label: "Tier 2" },
      { value: "3", label: "Tier 3" },
    ],
  },
  {
    id: "fuel",
    label: "Fuel",
    options: (Object.keys(FUEL_LABEL) as FuelPhase[]).map((v) => ({
      value: v,
      label: FUEL_LABEL[v],
    })),
  },
  {
    id: "domain",
    label: "Safety domain",
    options: (Object.keys(DOMAIN_LABEL) as SafetyDomain[]).map((v) => ({
      value: v,
      label: DOMAIN_LABEL[v],
    })),
  },
];

function valuesOf(item: InvestigationItem, group: GroupId): string[] {
  switch (group) {
    case "type":
      return [item.project_type];
    case "tier":
      return item.tier === null ? [] : [String(item.tier)];
    case "fuel":
      return item.phases;
    case "domain":
      return item.domains;
  }
}

function readUrl(): { q: string; sel: Selection; hw: string } {
  const p = new URLSearchParams(window.location.search);
  const sel: Selection = { type: [], tier: [], fuel: [], domain: [] };
  for (const g of GROUPS) {
    const allowed = new Set(g.options.map((o) => o.value));
    sel[g.id] = (p.get(g.id) ?? "").split(",").filter((v) => allowed.has(v));
  }
  return { q: (p.get("q") ?? "").slice(0, 100), sel, hw: p.get("hw") ?? "" };
}

function writeUrl(q: string, sel: Selection, hw: string) {
  const p = new URLSearchParams();
  if (q.trim()) p.set("q", q.trim());
  for (const g of GROUPS)
    if (sel[g.id].length) p.set(g.id, sel[g.id].join(","));
  if (hw) p.set("hw", hw);
  const qs = p.toString();
  window.history.replaceState(
    null,
    "",
    qs ? `?${qs}` : window.location.pathname,
  );
}

export function InvestigationBrowser({
  items,
  hardwareOptions,
}: {
  items: InvestigationItem[];
  hardwareOptions: { key: string; label: string }[];
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Selection>(EMPTY);
  const [hw, setHw] = useState("");
  const [ready, setReady] = useState(false);
  // Phones only: the filter groups are folded away under the search box until asked for.
  const [open, setOpen] = useState(false);

  // Restore the filter from the URL once, after hydration (the page itself is static).
  useEffect(() => {
    const fromUrl = readUrl();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL, an external store
    setQ(fromUrl.q);
    setSel(fromUrl.sel);
    setHw(hardwareOptions.some((o) => o.key === fromUrl.hw) ? fromUrl.hw : "");
    setReady(true);
  }, [hardwareOptions]);

  useEffect(() => {
    if (ready) writeUrl(q, sel, hw);
  }, [ready, q, sel, hw]);

  const visible = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      if (!words.every((w) => item.searchText.includes(w))) return false;
      if (hw && !item.hardware.includes(hw)) return false;
      return GROUPS.every((g) => {
        const chosen = sel[g.id];
        if (chosen.length === 0) return true;
        const have = valuesOf(item, g.id);
        return chosen.some((v) => have.includes(v));
      });
    });
  }, [items, q, sel, hw]);

  const activeCount =
    (hw ? 1 : 0) + GROUPS.reduce((n, g) => n + sel[g.id].length, 0);
  const active = q.trim() !== "" || activeCount > 0;

  function toggle(group: GroupId, value: string) {
    setSel((prev) => {
      const has = prev[group].includes(value);
      return {
        ...prev,
        [group]: has
          ? prev[group].filter((v) => v !== value)
          : [...prev[group], value],
      };
    });
  }

  function clear() {
    setQ("");
    setSel(EMPTY);
    setHw("");
  }

  return (
    <>
      <div className="filters card">
        <div className="filter-search">
          <label htmlFor="inv-search" className="filter-label">
            Search
          </label>
          <input
            id="inv-search"
            type="search"
            className="input"
            placeholder="Acronym, PSI ID, material, hardware…"
            value={q}
            maxLength={100}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
        </div>

        <button
          type="button"
          className="btn filter-toggle"
          aria-expanded={open}
          aria-controls="inv-filters"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide filters" : "Filters"}
          {activeCount > 0 && (
            <span className="tag tag-accent">{activeCount}</span>
          )}
        </button>

        <div id="inv-filters" className="filter-groups" data-open={open}>
          {GROUPS.map((g) => (
            <div
              key={g.id}
              className="filter-group"
              role="group"
              aria-label={g.label}
            >
              <span className="filter-label">{g.label}</span>
              <div className="filter-options">
                {g.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className="chip"
                    aria-pressed={sel[g.id].includes(o.value)}
                    onClick={() => toggle(g.id, o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="filter-group">
            <label htmlFor="inv-hw" className="filter-label">
              Hardware
            </label>
            <select
              id="inv-hw"
              className="input"
              value={hw}
              onChange={(e) => setHw(e.target.value)}
            >
              <option value="">Any hardware</option>
              {hardwareOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="result-bar">
        <span aria-live="polite">
          {active
            ? `${visible.length} of ${plural(items.length, "investigation")}`
            : plural(items.length, "investigation")}
        </span>
        {active && (
          <button type="button" className="link-btn" onClick={clear}>
            Clear filters
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="placeholder">
          {items.length === 0
            ? "No investigations in the dataset."
            : "No investigation matches these filters."}
          {active && (
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={clear}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      ) : (
        <ul className="row-list">
          {visible.map((inv) => (
            <li key={inv.psi_id}>
              <div className="row-title">
                <Link href={`/investigations/${inv.psi_id}`}>{inv.name}</Link>
                {inv.hasAcronym && (
                  <span className="num muted">{inv.psi_id}</span>
                )}
              </div>
              <div className="row-sub">{inv.title}</div>
              <div className="tags" style={{ marginTop: 8 }}>
                <span className="tag">{inv.project_type}</span>
                {inv.tier !== null && (
                  <span className="tag">tier {inv.tier}</span>
                )}
                {inv.phases.map((p) => (
                  <span key={p} className="tag">
                    {FUEL_LABEL[p] ?? p}
                  </span>
                ))}
                {inv.domains.map((d) => (
                  <span key={d} className="tag">
                    {DOMAIN_LABEL[d] ?? d}
                  </span>
                ))}
                {inv.hasTable && (
                  <span className="tag tag-ok">experimental table</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
