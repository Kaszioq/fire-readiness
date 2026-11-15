"""
Physics layer: adiabatic flame temperature (T_ad) for every test condition and habitat.

Method (see docs/PHYSICS.md):
  - Cantera chemical equilibrium (constant enthalpy and pressure) with the NASA Glenn thermodynamic
    database shipped with Cantera (nasa_gas.yaml).
  - Mixture: gaseous fuel at 298.15 K mixed with the ambient atmosphere at stoichiometric ratio (phi = 1).
    This is the standard "limiting adiabatic flame temperature" construction used in fire safety for
    diffusion flames. Fuel latent heat of vaporisation is neglected (same for all diluents of one fuel).
  - Calibration on NASA FLEX (PSI-69): published limiting oxygen index (LOI) in O2/N2 and O2/N2/CO2
    (Dietrich et al. 2014, doi 10.1007/s12217-014-9372-2) gives the limiting T_ad per fuel.

Output: data/curated/flame_temperature.json (optional file, outside the frozen contract; see docs/PHYSICS.md).
Requires: pip install cantera   (tested with Cantera 3.2.0)
"""
import json, os, datetime
import cantera as ct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUR = os.path.join(ROOT, "data", "curated")
EX = os.path.join(ROOT, "data", "extracts")
MMHG = 0.1333224
FUELS = {"methanol": "CH3OH", "n-heptane": "C7H16,n-heptane"}

ALL = {s.name: s for s in ct.Species.list_from_file("nasa_gas.yaml")}
KEEP = ["CH3OH", "C7H16,n-heptane", "O2", "N2", "CO2", "H2O", "CO", "H2", "OH", "H", "O", "HO2", "NO", "He"]
GAS = ct.Solution(thermo="ideal-gas", species=[ALL[k] for k in KEEP])


def tad(fuel, amb, p_kpa):
    GAS.TP = 298.15, p_kpa * 1000.0
    GAS.set_equivalence_ratio(1.0, FUELS[fuel], amb)
    GAS.equilibrate("HP")
    return round(float(GAS.T), 1)


def amb(o2, co2=0.0, he=0.0):
    a = {"O2": o2}
    if co2:
        a["CO2"] = co2
    if he:
        a["He"] = he
    n2 = 1.0 - o2 - co2 - he
    if n2 > 1e-9:
        a["N2"] = n2
    return a


DIETRICH = "https://doi.org/10.1007/s12217-014-9372-2"
CAL = [
    {"fuel": "methanol", "atmosphere": "O2/N2", "o2": 0.12, "co2": 0.0, "quote": "For oxygen/nitrogen mixtures, the LOI is 0.12 and 0.15 for methanol and heptane, respectively."},
    {"fuel": "methanol", "atmosphere": "O2/N2/CO2", "o2": 0.14, "co2": 0.30, "quote": "The LOI increases to approximately 0.14 (0.14 O2/0.56 N2/0.30 CO2) and 0.17 (0.17 O2/0.63 N2/0.20 CO2) for methanol and heptane, respectively, for ambient environments that simulated dispersing an inert-gas suppressant (carbon dioxide) into a nominally air (1.0 atm) ambient environment."},
    {"fuel": "n-heptane", "atmosphere": "O2/N2", "o2": 0.15, "co2": 0.0, "quote": "For oxygen/nitrogen mixtures, the LOI is 0.12 and 0.15 for methanol and heptane, respectively."},
    {"fuel": "n-heptane", "atmosphere": "O2/N2/CO2", "o2": 0.17, "co2": 0.20, "quote": "The LOI increases to approximately 0.14 (0.14 O2/0.56 N2/0.30 CO2) and 0.17 (0.17 O2/0.63 N2/0.20 CO2) for methanol and heptane, respectively, for ambient environments that simulated dispersing an inert-gas suppressant (carbon dioxide) into a nominally air (1.0 atm) ambient environment."},
]


def main():
    out = {"generated_at": datetime.date.today().isoformat(),
           "method": "Cantera " + ct.__version__ + " equilibrium (HP), NASA Glenn thermo (nasa_gas.yaml), gaseous fuel at 298.15 K, stoichiometric with the ambient atmosphere",
           "units": {"t_ad": "K", "pressure": "kPa", "o2": "mole fraction"},
           "caveats": [
               "Limiting T_ad is fuel-specific (methanol about 1665 K, n-heptane about 1909 K); it is not a universal constant.",
               "Calibrated on droplet flames (FLEX). For solids the same axis is used with n-heptane as a surrogate fuel; solid thresholds come from BASS-II/Saffire data, not from FLEX.",
               "No gravity in this model: it says nothing about partial gravity (see docs/STATUS.md, partial gravity).",
               "Neglects heat losses (radiation, conduction into solids) and flow; those are what the test data calibrate.",
           ]}

    # 1. calibration on published LOI
    cal = []
    for c in CAL:
        t = tad(c["fuel"], amb(c["o2"], c["co2"]), 101.325)
        cal.append({**c, "t_ad_k": t, "source": DIETRICH, "pressure_kpa": 101.325})
    out["calibration"] = cal
    lim = {}
    for f in FUELS:
        ts = [c["t_ad_k"] for c in cal if c["fuel"] == f]
        lim[f] = {"t_limit_k": round(sum(ts) / len(ts), 1), "spread_k": round(max(ts) - min(ts), 1), "n": len(ts)}
    out["limiting_t_ad"] = lim

    # 2. habitats
    habs = json.load(open(os.path.join(CUR, "habitats.json"), encoding="utf-8"))
    hrow = []
    iss = None
    for h in habs:
        a = amb(h["o2_mole_fraction"])
        r = {"habitat_id": h["id"], "o2": h["o2_mole_fraction"], "pressure_kpa": h["pressure_kpa"]}
        for f in FUELS:
            t = tad(f, a, h["pressure_kpa"])
            r[f"t_ad_{f}_k"] = t
            r[f"margin_{f}_k"] = round(t - lim[f]["t_limit_k"], 1)
        hrow.append(r)
        if h["id"] == "iss":
            iss = r
    for r in hrow:
        for f in FUELS:
            r[f"margin_ratio_vs_iss_{f}"] = round(r[f"margin_{f}_k"] / iss[f"margin_{f}_k"], 3)
    out["habitats"] = hrow

    # 3. per FLEX test (all 274 rows incl. CO2 and He), for the suppression chart and the hybrid predictor
    flex = []
    for row in open(os.path.join(EX, "flex_tests.txt")).read().strip().split(";"):
        n, ident, fu, pmm, o2, co2, he, d0, bt, end = row.split(",")
        if float(pmm) <= 0:
            continue
        f = "methanol" if fu == "M" else "n-heptane"
        p = float(pmm) * MMHG
        t = tad(f, amb(float(o2), float(co2), float(he)), p)
        flex.append({"point_id": f"PSI-69:{n}", "fuel": f, "o2": float(o2), "co2": float(co2), "he": float(he), "pressure_kpa": round(p, 2),
                     "t_ad_k": t, "margin_k": round(t - lim[f]["t_limit_k"], 1), "burn_time_s": bt or None,
                     "test_end": {"C": "Completion", "D": "Disruption", "E": "Extinction"}[end]})
    out["flex_tests"] = flex

    # 4. per flammability point (solids use n-heptane as surrogate)
    pts = json.load(open(os.path.join(CUR, "flammability_points.json"), encoding="utf-8"))
    per = {}
    for p in pts:
        if p["material_class"] == "fire_resistant":
            continue  # material-specific limit, no fuel model (see data/curated/mappings.md)
        if p["psi_id"] == "PSI-69":
            f = "methanol" if p["material"].startswith("methanol") else "n-heptane"
            sur = False
        else:
            f, sur = "n-heptane", True
        per[p["id"]] = {"t_ad_k": tad(f, amb(p["o2_mole_fraction"]), p["pressure_kpa"]), "fuel_model": f, "surrogate": sur}
    out["points"] = per

    # 5. grid for client-side interpolation (N2 diluent)
    o2s = [round(0.10 + 0.01 * i, 2) for i in range(91)]
    ps = [20 + 20 * i for i in range(16)]
    out["grid"] = {"o2": o2s, "pressure_kpa": ps,
                   "t_ad_k": {f: [[tad(f, amb(x), p) for p in ps] for x in o2s] for f in FUELS},
                   "note": "t_ad_k[fuel][i_o2][i_p], bilinear interpolation is accurate to a few K inside the grid"}

    with open(os.path.join(CUR, "flame_temperature.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print("calibration:")
    for c in cal:
        print(f"  {c['fuel']:9s} {c['atmosphere']:10s} LOI {c['o2']:.2f}  T_ad {c['t_ad_k']:.0f} K")
    print("limits:", lim)
    for r in hrow:
        print(f"  {r['habitat_id']:18s} heptane margin {r['margin_n-heptane_k']:6.0f} K (x{r['margin_ratio_vs_iss_n-heptane']:.2f} vs ISS)   methanol margin {r['margin_methanol_k']:6.0f} K (x{r['margin_ratio_vs_iss_methanol']:.2f})")


if __name__ == "__main__":
    main()
