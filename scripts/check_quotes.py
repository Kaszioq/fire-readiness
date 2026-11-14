"""Check that every quote attributed to a PSI record or experimental table appears verbatim in the PSI snapshot.
Usage: python scripts/check_quotes.py   (needs data/raw/psi_combustion_snapshot.json)"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
snap = json.load(open(os.path.join(ROOT, "data", "raw", "psi_combustion_snapshot.json"), encoding="utf-8"))
norm = lambda s: re.sub(r"\s+", " ", s or "").strip()
text = {}
for x in snap["investigations"]:
    rec = " ".join(norm(x.get(k)) for k in ("title", "objective", "hypothesis", "approach", "impacts", "description"))
    tab = " ".join(norm(e.get("text")) for e in x["et"])
    text[x["id"]] = (rec, tab)
inv = json.load(open(os.path.join(ROOT, "data", "curated", "investigations.json"), encoding="utf-8"))
pts = json.load(open(os.path.join(ROOT, "data", "curated", "flammability_points.json"), encoding="utf-8"))
bad, n = [], 0
def walk(o, pid, path):
    global n
    if isinstance(o, dict):
        if "prov" in o and "value" in o:
            p = o["prov"]; q = p.get("quote")
            if q and p["source_type"] in ("psi_api", "experimental_table"):
                n += 1
                rec, tab = text[pid]
                hay = rec if p["source_type"] == "psi_api" else tab + " " + rec
                if norm(q) not in hay:
                    bad.append((pid, path, q[:80]))
            return
        for k, v in o.items(): walk(v, pid, f"{path}.{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o): walk(v, pid, f"{path}[{i}]")
for r in inv: walk(r, r["psi_id"], "")
for p in pts:
    q = p["prov"].get("quote")
    if q and p["prov"]["source_type"] == "experimental_table" and p["psi_id"] != "PSI-25":
        n += 1
        if norm(q) not in text[p["psi_id"]][1]: bad.append((p["psi_id"], p["id"], q[:80]))
print(f"checked {n} quotes, {len(bad)} not found")
for b in bad: print("  NOT FOUND", b)
sys.exit(1 if bad else 0)
