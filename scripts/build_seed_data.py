"""
Build the curated seed dataset from the NASA PSI snapshot taken on 2026-11-14.

Inputs:
  data/extracts/flex_tests.txt   per-test extract of PSI-69 experimental table (FLEX)
  data/extracts/bass2_tests.txt  per-test extract of PSI-25 experimental table (BASS-II)
  (all other values are written inline below, each with provenance)

Outputs:
  data/curated/investigations.json
  data/curated/excluded.json
  data/curated/flammability_points.json
  data/curated/habitats.json
  data/curated/meta.json
  data/verification.csv

Rules: see docs/DATA_SOURCES.md. Every value carries provenance.
  api_direct     = copied or computed deterministically from the PSI record / experimental table
  llm_extracted  = summarised or interpreted by an LLM, with a verbatim quote; needs human check
  manual         = assumption or judgement; needs human check
"""
import csv, json, os, re, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EX = os.path.join(ROOT, "data", "extracts")
CUR = os.path.join(ROOT, "data", "curated")
SNAPSHOT_DATE = "2026-11-14"

ATM = 101.325
BAR = 100.0
MMHG = 0.1333224
PSI = 6.894757


def page(i):
    return f"https://psi.nasa.gov/physci/repo/data/investigations/{i}"


def api_url(i):
    return f"https://psi.nasa.gov/geode-py/ws/repo/investigations/{i}"


def prov(st, i, locator=None, quote=None, method="llm_extracted", file=None, note=None, url=None, verified=None):
    p = {
        "source_type": st,
        "source_ref": {"url": url or page(i)},
        "method": method,
        "verified": (method == "api_direct") if verified is None else verified,
    }
    if file:
        p["source_ref"]["file"] = file
    if locator:
        p["source_ref"]["locator"] = locator
    if quote:
        p["quote"] = quote
    if note:
        p["note"] = note
    return p


def A(v, i, field, unit=None, note=None):
    """Value copied directly from the PSI record (api_direct)."""
    f = {"value": v, "prov": prov("psi_api", i, f"PSI record field: {field}", method="api_direct", note=note)}
    if unit:
        f["unit"] = unit
    return f


def L(v, i, field, quote, unit=None, note=None, st="psi_api", file=None):
    """Value summarised/interpreted from a source, with verbatim quote (needs human check)."""
    loc = f"PSI record field: {field}" if st == "psi_api" else field
    f = {"value": v, "prov": prov(st, i, loc, quote, "llm_extracted", file=file, note=note)}
    if unit:
        f["unit"] = unit
    return f


def T(v, i, file, columns, unit=None, note=None):
    """Value computed deterministically from the experimental table CSV."""
    f = {"value": v, "prov": prov("experimental_table", i, f"columns: {columns}", method="api_direct", file=file,
                                   note=note or "computed by scripts/build_seed_data.py from the experimental table")}
    if unit:
        f["unit"] = unit
    return f


def N(i, note="not reported in the PSI record or experimental table", unit=None):
    f = {"value": None, "prov": prov("psi_api", i, None, None, "manual", note=note, verified=False)}
    if unit:
        f["unit"] = unit
    return f


def R(lo, hi):
    return {"min": lo, "max": hi}


def J(v, i, note):
    """Judgement made by the curator (tier, domains): manual, needs review."""
    return {"value": v, "prov": prov("psi_api", i, None, None, "manual", note=note, verified=False)}


BASS2_TM = "https://ntrs.nasa.gov/citations/20210011385"  # NASA/TM-20210011385, BASS-II Summary Report (also in PSI-25 files)
BASS2_TM_FILE = "PSI-25_Reports_BASS-II Summary Report.pdf"


def P_(v, i, url, quote, locator, st="publication", file=None, unit=None, note=None):
    """Finding or value taken from a publication or a PSI document, with verbatim quote."""
    f = {"value": v, "prov": prov(st, i, locator, quote, "llm_extracted", file=file, url=url, note=note)}
    if unit:
        f["unit"] = unit
    return f


def pubs(lst):
    out = []
    for t, d, a in lst:
        out.append({"title": t, "authors": a, "doi": d or None})
    return out


INV = []


def inv(**k):
    i = k["psi_id"]
    rec = {
        "psi_id": i,
        "acronym": k["acronym"],
        "title": k["title"],
        "doi": k["doi"],
        "psi_url": page(i),
        "project_type": k["project_type"],
        "hardware": k["hardware"],
        "platform": k["platform"],
        "start_date": k.get("start_date") or N(i),
        "end_date": k.get("end_date") or N(i),
        "managing_center": A("Glenn Research Center (GRC)", i, "managingNasaCenter"),
        "license": A("CC0-1.0", i, "licenseName (Creative Commons Zero v1.0 Universal)"),
        "objective_summary": k["objective_summary"],
        "approach_summary": k["approach_summary"],
        "key_findings": k.get("key_findings", []),
        "fuel": k["fuel"],
        "conditions": k["conditions"],
        "variables_varied": k.get("variables_varied") or N(i),
        "variables_constant": k.get("variables_constant") or N(i),
        "measurements": k.get("measurements") or N(i),
        "safety_domains": k["safety_domains"],
        "tier": k["tier"],
        "habitat_relevance_notes": k.get("habitat_relevance_notes", {}),
        "uses_data_from": k.get("uses_data_from") or A([], i, "projectType (Microgravity Investigation)", note="flight investigation: produces data, does not reuse PSI data"),
        "data_availability": {**k["data_availability"],
                              "prov": prov("psi_api", i, "PSI record fields: added[], totalFileSize, experimentalTable[]", method="api_direct")},
        "publications": k.get("publications", []),
    }
    oq = rec["objective_summary"]["prov"].get("quote")
    for key in ("safety_domains", "tier"):
        pv = rec[key]["prov"]
        if not pv.get("quote"):
            pv["quote"] = oq
            pv["source_ref"]["locator"] = "PSI record field: objective (curator judgement based on it)"
    INV.append(rec)


def da(n, b, table, formats):
    return {"n_files": n, "total_bytes": b, "has_experimental_table": table, "formats": formats}


def dates(i, s, e):
    def iso(x):
        if not x:
            return None
        m, d, y = x.split("-")
        return f"{y}-{m}-{d}"
    return (A(iso(s), i, "investigationStartDate") if s else N(i)), (A(iso(e), i, "investigationEndDate") if e else N(i))


def cond(i, o2=None, p=None, flow=None, dil=None, grav="micro", n=None):
    return {
        "o2_mole_fraction": o2 or N(i, unit="mole fraction"),
        "pressure_kpa": p or N(i, unit="kPa"),
        "flow_cm_s": flow or N(i, unit="cm/s"),
        "diluents": dil or N(i),
        "gravity": A(grav, i, "projectType / flightProgram", note="micro = ISS or Cygnus free flight; normal = ground study") if grav else N(i),
        "n_tests": n or N(i),
    }


def fuel(i, phase, materials, geometry=None, size=None):
    return {"phase": phase, "materials": materials, "geometry": geometry or N(i), "size": size or N(i)}


# ---------------------------------------------------------------- tier 1
i = "PSI-26"; s, e = dates(i, "10-01-2009", "06-30-2013"); f = "PSI-26_Experimental table_BASS.csv"
inv(psi_id=i, acronym="BASS", title="Burning and Suppression of Solids", doi="10.60555/58h4-dy80",
    project_type="flight", hardware=A(["Microgravity Science Glovebox"], i, "experimentHardware"),
    platform=A("International Space Station (ISS)", i, "flightProgram"), start_date=s, end_date=e,
    objective_summary=L("Bridge the gap between NASA's normal-gravity material screening test (NASA-STD-6001 Test 1) and real material flammability in microgravity, and assess how well an inert gaseous agent extinguishes flames over different materials and geometries.", i, "objective",
                        "Assess the effectiveness of an inert, gaseous extinguishing agent (similar to that used on ISS) in putting out flames over different materials, geometries, preheating, and flow."),
    approach_summary=L("Fabric and plastic samples burned in a small fan-driven flow duct (76 mm x 76 mm) inside the Microgravity Science Glovebox, with concurrent or opposed airflow up to 40 cm/s; flame size, shape, colour and spread rate recorded.", i, "approach",
                       "Airflow was controlled using a variable speed fan, with airflow speeds reaching as high as 40 cm/s."),
    key_findings=[
        L("NASA material selection (NASA-STD-6001 Test 1) is based on 1-g behaviour without low-gravity effects; BASS data are meant to close that gap.", i, "researchImpacts",
          "Current NASA spacecraft materials selection is based on a standard test method (NASA–STD–6001 Test 1) that segregates material based on 1-g behavior without consideration of low gravity effects."),
        L("Nitrogen was used as the flame suppressant, directly relevant to current and planned extinguishment techniques.", i, "researchImpacts",
          "Using nitrogen as a flame suppressant in microgravity provides a direct link to current and planned extinguishment techniques."),
    ],
    fuel=fuel(i, A(["solid"], i, "approach", note="solid samples only"),
              L(["cotton-fiberglass fabric (SIBAL, 75/25 by mass)", "Nomex fabric", "Ultem", "PMMA"], i, "approach + experimental table",
                "Custom-made fabric samples consisting of 75% cotton and 25% fiberglass (by mass) measuring were used as a fuel source as well as Nomex fabric and Ultem.",
                note="PMMA appears in the experimental table column 'Fuel Sample Material' (e.g. 'PMMA sphere 2 cm')"),
              L("flat fabric strips in a flow duct; also spheres and cylinders", i, "approach", "Other sample shapes were utilized as well including spheres and cylinders."),
              T("1 cm and 2 cm wide fabric samples; 1 cm and 2 cm PMMA spheres", i, f, "Fuel Sample Material")),
    conditions=cond(i, o2=N(i, "O2 not listed in the BASS experimental table; see final report", "mole fraction"),
                    flow=L(R(None, 40), i, "approach", "with airflow speeds reaching as high as 40 cm/s", unit="cm/s"),
                    dil=L(["N2"], i, "researchImpacts", "Using nitrogen as a flame suppressant in microgravity"),
                    n=T(122, i, f, "As Run Test # (row count)")),
    variables_varied=L(["flow speed", "flow direction (concurrent / opposed)", "material", "sample geometry"], i, "approach",
                       "The airflow was directed along the fuel surface in either the opposed or concurrent direction."),
    measurements=L(["flame size", "flame shape", "flame colour", "flame spread rate", "flame quenching", "video (top and edge views)"], i, "approach",
                   "data was collected on flame size, shape, color, spread rate, and potential flame quenching."),
    safety_domains=J(["prevention", "suppression"], i, "objective: material flammability (prevention) and inert-gas extinguishment (suppression)"),
    tier=J(1, i, "direct spacecraft fire safety: solid materials, ISS, suppression"),
    data_availability=da(211, 163551372412, True, ["docx", "mp4", "pdf", "pptx", "xlsx", "zip"]),
    publications=pubs([("The Microgravity Science Glovebox as a Platform for Exploration Research on the International Space Station", "10.2514/6.2006-941", "Spivey Reggie, Luz Paul"),
                       ("Opposed-flow flame spread: A comparison of microgravity and normal gravity experiments to establish the thermal regime", "10.1016/j.firesaf.2015.11.011", "Bhattacharjee Subrata et al."),
                       ("Simplified model for predicting difference between flammability limits of a thin material in normal gravity and microgravity environments", "10.1016/j.proci.2014.07.017", "Takahashi Shuhei et al.")]))

i = "PSI-25"; s, e = dates(i, "01-01-2010", "12-31-2022"); f = "PSI-25_Experimental table_BASS-II.csv"
inv(psi_id=i, acronym="BASS-II", title="Burning and Suppression of Solids - II", doi="10.60555/4qc4-de67",
    project_type="flight", hardware=A(["Microgravity Science Glovebox (MSG)"], i, "experimentHardware"),
    platform=A("International Space Station (ISS)", i, "flightProgram"), start_date=s, end_date=e,
    objective_summary=L("Study ignition, flame growth, flame spread and extinction limits of solid fuels in low-speed forced flows in microgravity, with oxygen lowered by nitrogen addition, to find the fundamental flammability limit of each material.", i, "objective",
                        "Study the ignition, flame growth, flame spread, and extinction limits for solid fuels burning in low-velocity forced flows in microgravity."),
    approach_summary=L("Samples (PMMA films, slabs, rods, spherical sections, SIBAL fabric, Nomex) burned in a small wind tunnel in the MSG with airflow up to 40 cm/s; oxygen was reduced below 21% by adding nitrogen.", i, "approach",
                       "Main variables are airflow speed and oxygen concentration (oxygen varied below 21% by adding nitrogen)."),
    key_findings=[
        L("The hypothesis tested: with adequate ventilation, materials burn as well or better in microgravity than in normal gravity, so the 1-g upward-burning screening test may not be conservative for space.", i, "hypothesis",
          "it may not be conservative for flammability in space."),
        L("The goal was to find the fundamental flammability limit for each material.", i, "hypothesis", "We are interested in finding the fundamental limit for a given material."),
    ],
    fuel=fuel(i, A(["solid"], i, "objective"),
              T(["PMMA films (0.1 to 0.4 mm)", "PMMA slabs (1 to 5 mm)", "PMMA rods (1/4, 3/8, 1/2 inch)", "PMMA spherical sections", "SIBAL cotton-fiberglass fabric", "Nomex III fabric", "wax candle"], i, f, "Fuel Sample Material"),
              L("rods, spherical sections, slabs, films and fabric sheets", i, "objective", "Sample geometry (rods, spherical section, slabs, films, and fabric sheets"),
              T("1 to 2 cm wide films, slabs and fabrics; 1/4 to 1/2 inch rods; 4 cm spherical sections", i, f, "Fuel Sample Material")),
    conditions=cond(i, o2=T(R(0.136, 0.222), i, f, "Calibrated initial O2 % by vol", unit="mole fraction"),
                    flow=P_(R(None, 55), i, BASS2_TM, "With no restrictors, the maximum flow velocity was ~55 cm/s", "NASA/TM-20210011385 p. 4 (pdf p. 12)",
                            st="psi_document", file=BASS2_TM_FILE, unit="cm/s", note="PSI record text says up to 40 cm/s"),
                    dil=L(["N2"], i, "approach", "oxygen varied below 21% by adding nitrogen"),
                    p=P_(R(99.2, 101.3), i, BASS2_TM, "Ambient pressure was 1 atm.", "NASA/TM-20210011385 (pdf p. 102); also 'varied from 99.2 to 99.5 kPa' (pdf p. 46)",
                         st="psi_document", file=BASS2_TM_FILE, unit="kPa"),
                    n=T(129, i, f, "Test # (row count)", note="the summary report states 126 tests; the table has 129 rows because some samples were re-burned (rows a/b)")),
    variables_varied=L(["forced flow velocity (speed and direction)", "ambient oxygen concentration (nitrogen vitiation)", "sample geometry"], i, "objective",
                       "Forced flow velocity (speed and direction)"),
    measurements=T(["O2, CO2 and CO concentration (initial and final)", "radiometer", "video frames", "fan and air flow settings"], i, f,
                   "Calibrated initial O2 % by vol; Initial CO2 % by vol; Initial CO (ppm); Radiometer gain; Total Frames Shot"),
    safety_domains=J(["prevention", "suppression"], i, "extinction limits via N2 vitiation and flow"),
    tier=J(1, i, "direct spacecraft fire safety: solid material flammability limits"),
    habitat_relevance_notes={"moon_base": L("Oxygen was only varied below air (13.6 to 22.2% initial O2), so BASS-II does not cover the 30% O2 Moon base atmosphere.", i, "experimental table, approach",
                                            "oxygen varied below 21% by adding nitrogen")},
    data_availability=da(694, 274631106141, True, ["docx", "jpg", "mp4", "pdf", "pptx", "xlsx", "zip"]),
    publications=pubs([("Microgravity flammability boundary for PMMA rods in axial stagnation flow", "10.1016/j.combustflame.2017.03.001", "Olson Sandra L., Ferkul Paul V. et al."),
                       ("Opposed-flow flame spread: A comparison of microgravity and normal gravity experiments to establish the thermal regime", "10.1016/j.firesaf.2015.11.011", "Bhattacharjee Subrata et al."),
                       ("The critical flow velocity for radiative extinction in opposed-flow flame spread in a microgravity environment", "10.1016/j.combustflame.2015.10.023", "")]))

SAFF_HYP = "proposed to conduct large-scale fire safety experiments in an expendable spacecraft without risk to a crew."
SAFF_IMP = "Results determine microgravity flammability limits for several spacecraft materials, help to validate NASA’s material selection criteria"
SAFF_PUBS = [("The Spacecraft Fire Experiment (Saffire) - Objectives, Development and Status", None, "W Schoren, GA Ruff, DL Urban"),
             ("Flame spread: Effects of microgravity and scale", "10.1016/j.combustflame.2018.10.012", "Urban David L., Ferkul Paul et al.")]

i = "PSI-98"; s, e = dates(i, "03-02-2001", "02-28-2008"); f = "PSI-98_Experimental table_SAFFIRE-1.csv"
inv(psi_id=i, acronym="Saffire-I", title="Spacecraft Fire Safety Experiment-I", doi="10.60555/0t15-1z43",
    project_type="flight", hardware=A(["Saffire 1 enclosure in Cygnus"], i, "experimentHardware"),
    platform=L("Cygnus cargo vehicle, after departing the ISS", i, "approach", "performed on the Orbital Science’s Cygnus resupply vehicle after it deberthed from the ISS",
               note="PSI flightProgram field says 'International Space Station (ISS)'"),
    start_date=A(None, i, "investigationStartDate", note="PSI record lists 03-02-2001, which predates the 2016 flight; treated as a record error, verify"),
    end_date=A(None, i, "investigationEndDate", note="PSI record lists 02-28-2008, which predates the 2016 flight; treated as a record error, verify"),
    objective_summary=L("Determine how fast a large-scale fire grows in low gravity and compare low-g flammability limits with NASA's normal-gravity screening test.", i, "objective",
                        "determine how rapidly a large scale fire grows in low-gravity"),
    approach_summary=L("A 0.94 m x 0.4 m cotton-fiberglass (SIBAL) fabric sample was burned in a large flow duct aboard an uncrewed Cygnus vehicle at 20 cm/s airflow, with cameras, thermocouples, radiometers, O2/CO2/pressure sensors and anemometers.", i, "approach",
                       "Saffire-I was conducted at an air flow velocity of 20 cm/s."),
    key_findings=[L("First large-scale fire experiment in an uncrewed spacecraft, avoiding risk to a crew.", i, "hypothesis", SAFF_HYP),
                  L("Results are used to determine microgravity flammability limits and to help validate NASA material selection criteria.", i, "researchImpacts", SAFF_IMP)],
    fuel=fuel(i, A(["solid"], i, "approach"), T(["SIBAL fabric (75% cotton, 25% fiberglass)"], i, f, "Material"),
              L("large flat fabric sheet in a flow duct", i, "approach", "simulating a large piece of flammable fabric"),
              T("94 cm x 40.6 cm, 0.37 cm thick (as listed)", i, f, "Sample Thickness; Sample Length; Sample Width", note="table lists length 40.6 and width 94; record text says ~0.94 m long and 0.4 m wide")),
    conditions=cond(i, o2=T(R(0.215, 0.217), i, f, "Percent O2", unit="mole fraction"),
                    flow=T(R(20, 20), i, f, "Air Flow (cm/s)", unit="cm/s"),
                    dil=L(["N2 (air)"], i, "experimental table", "Percent O2", st="experimental_table", file=f, note="ambient was cabin air"),
                    n=T(2, i, f, "Sample Number (S1, S2)")),
    variables_varied=T(["flow direction (concurrent / opposed)"], i, f, "Flow Direction"),
    variables_constant=T(["material", "air flow 20 cm/s", "ignition power 182 W"], i, f, "Material; Air Flow; Ignition Power (W)"),
    measurements=L(["2 cameras", "thermocouples (flow, flame, plume)", "2 radiometers", "pressure, CO2 and O2 sensors", "2 anemometers"], i, "approach",
                   "two radiometers recorded flame radiation, solid state sensors were used to measure pressure, CO2 and O2 mole faction, and two anemometer tracked flow velocity"),
    safety_domains=J(["prevention"], i, "large-scale fire growth and flammability limits"),
    tier=J(1, i, "direct spacecraft fire safety at realistic scale"),
    data_availability=da(74, 12250600201, True, ["docx", "pdf", "xlsx", "zip"]),
    publications=pubs(SAFF_PUBS))

i = "PSI-99"; s, e = dates(i, "09-30-2016", "04-01-2017"); f = "PSI-99_Experimental table_SAFFIRE-2.csv"
inv(psi_id=i, acronym="Saffire-II", title="Spacecraft Fire Experiment-II", doi="10.60555/2chp-m469",
    project_type="flight", hardware=A(["Cygnus Pressurized Cargo Module, SAFFIRE"], i, "experimentHardware"),
    platform=A("Cygnus Spacecraft", i, "flightProgram"), start_date=s, end_date=e,
    objective_summary=L("Determine how fast fires grow in low gravity and compare low-g flammability limits of several spacecraft materials with NASA's normal-gravity screening test.", i, "objective",
                        "investigate the low-g flammability limits compared to those obtained in NASA’s normal gravity material flammability screening test."),
    approach_summary=L("Nine 5 cm x 29 cm samples (SIBAL, silicone, PMMA, PMMA with Nomex) burned aboard an uncrewed Cygnus at 20 or 30 cm/s, concurrent or opposed flow.", i, "approach",
                       "Saffire-II has a sample card that contains 9 samples, each 5 cm x 29 cm."),
    key_findings=[
        T("Silicone samples ignited but did not sustain significant burning at about 22% O2 and 20 cm/s (burn time 'Insignificant').", i, f, "Material; Burn Time (s)"),
        T("SIBAL fabric burned the full 29 cm in concurrent flow with spread rates of 2.1 and 2.6 mm/s.", i, f, "?-g Burn Length; ?-g Spread Length (spread rate)",
          note="column header in the CSV is garbled ('?-g'), most likely 'µ-g'; verify"),
        T("In the PMMA plus Nomex sample, the PMMA was fully consumed but the Nomex did not ignite.", i, f, "Note 2"),
        T("Thick PMMA flames stayed anchored at the sample base with very slow regression (0.01 to 0.04 mm/s).", i, f, "Note 4"),
    ],
    fuel=fuel(i, A(["solid"], i, "approach"), T(["silicone", "SIBAL cotton-fiberglass", "PMMA", "Nomex"], i, f, "Material"),
              L("flat 5 cm x 29 cm strips", i, "approach", "each 5 cm x 29 cm"),
              T("0.27 to 1.03 mm silicone; 0.37 mm SIBAL; PMMA up to 1 cm", i, f, "Samle Thickness")),
    conditions=cond(i, o2=T(R(0.215, 0.221), i, f, "Percent O2 (Note 1)", unit="mole fraction",
                            note="Note 1: derived from measured CO2 production and referenced to initial O2 reported by ISS"),
                    flow=T(R(20, 20), i, f, "Air Flow (cm/s)", unit="cm/s", note="record text says 20 or 30 cm/s depending on material; table lists 20 cm/s for all"),
                    dil=L(["N2 (air)"], i, "experimental table", "Percent O2 (Note 1)", st="experimental_table", file=f),
                    n=T(9, i, f, "Sample Number 2-1 to 2-9")),
    variables_varied=T(["material", "thickness", "flow direction"], i, f, "Material; Samle Thickness; Flow Direction"),
    measurements=T(["burn length and spread length in microgravity", "1-g comparison burn length and spread rate", "video"], i, f, "?-g Burn Length; 1-g Spread Rate; Camera 1"),
    safety_domains=J(["prevention"], i, "material flammability at scale"),
    tier=J(1, i, "direct spacecraft fire safety, multiple real materials"),
    data_availability=da(0, 16931016137, True, []),
    publications=pubs(SAFF_PUBS + [("Buoyancy effects on concurrent flame spread over thick PMMA", "10.1016/j.combustflame.2018.10.016", "")]))

i = "PSI-100"; s, e = dates(i, "04-18-2017", None); f = "PSI-100_Experimental table_SAFFIRE-3.csv"
inv(psi_id=i, acronym="Saffire-III", title="Spacecraft Fire Experiment-III", doi="10.60555/040q-4h36",
    project_type="flight", hardware=A(["Saffire III enclosure in Cygnus"], i, "experimentHardware"),
    platform=L("Cygnus cargo vehicle, after departing the ISS", i, "approach", "performed on the Orbital Science’s Cygnus resupply vehicle after it deberthed from the ISS"),
    start_date=s, end_date=e,
    objective_summary=L("Repeat the large-scale SIBAL fabric fire of Saffire-I at a higher flow speed to study fire growth and low-g flammability limits.", i, "approach",
                        "the experiments were conducted at a flow velocity of 30 cm/s compared to 20 cm/s during Saffire I."),
    approach_summary=L("Large SIBAL fabric sheets burned aboard an uncrewed Cygnus at 30 cm/s in concurrent and opposed flow, with the same diagnostics as Saffire-I.", i, "approach",
                       "the Saffire III investigation also used SIBAL as the sample material."),
    key_findings=[L("Results are used to determine microgravity flammability limits and to help validate NASA material selection criteria.", i, "researchImpacts", SAFF_IMP)],
    fuel=fuel(i, A(["solid"], i, "approach"), T(["SIBAL fabric"], i, f, "Material"), N(i), T("94 cm x 40.6 cm, 0.33 cm thick", i, f, "Sample Thickness; Sample Length; Sample Width")),
    conditions=cond(i, flow=T(R(30, 30), i, f, "Air Flow", unit="cm/s"), dil=N(i), n=T(2, i, f, "Sample Number (S1, S2)")),
    variables_varied=T(["flow direction (concurrent / opposed)"], i, f, "Direction"),
    measurements=L(["2 cameras", "thermocouples", "2 radiometers", "pressure, CO2 and O2 sensors", "2 anemometers"], i, "approach",
                   "solid state sensors were used to measure pressure, CO2 and O2 mole faction"),
    safety_domains=J(["prevention"], i, "large-scale fire growth"), tier=J(1, i, "direct spacecraft fire safety at realistic scale"),
    data_availability=da(85, 35210765052, True, ["csv", "docx", "pdf", "xlsx", "zip"]),
    publications=pubs(SAFF_PUBS[:1]))

i = "PSI-69"; s, e = dates(i, "08-01-2007", "07-31-2016"); f = "PSI-69_Experimental table_FLEX.csv"
inv(psi_id=i, acronym="FLEX", title="Flame Extinguishment Experiment", doi="10.60555/mbq8-0451",
    project_type="flight", hardware=A(["Combustion Integrated Rack (CIR)", "Multi-user Droplet Combustion Apparatus (MDCA)"], i, "experimentHardware"),
    platform=A("International Space Station (ISS)", i, "flightProgram"), start_date=s, end_date=e,
    objective_summary=L("Map flammability limits of liquid fuels in microgravity and measure how well gaseous suppressants (CO2, He, SF6) work, to build predictive models of combustion limits.", i, "objective",
                        "aims to map the flammability limits of liquid fuels in microgravity environments, measure the effectiveness of various gaseous fire suppressants such as CO2, He, and SF6"),
    approach_summary=L("Free or tethered fuel droplets (methanol, heptane) ignited in a sealed chamber; droplet size and oxygen level were stepped to find the Limiting Oxygen Index as a function of pressure and suppressant.", i, "approach",
                       "A primary objective of the experiments is to determine the Limiting Oxygen Index (LOI) as a function of ambient pressure and determine how the presence of a suppressant influences the LOI ."),
    key_findings=[
        L("The FLEX procedure defines the flammability limit as the condition where a flame exists only briefly after ignition (radiative extinction).", i, "approach",
          "Continue steps 4 and 5 until flame exists for only a short time after ignition (radiative extinc", note="quote truncated at the end of the snapshot excerpt"),
        T("274 droplet tests span 12% to 34% O2, about 0.69 to 3.1 atm, CO2 up to 70% and He up to 45% of the ambient.", i, f,
          "Ambient pressure; mmHg / O initial ambient composition / CO initial ambient composition / He initial ambient composition"),
    ],
    fuel=fuel(i, A(["liquid"], i, "approach"), T(["methanol", "n-heptane"], i, f, "Fuel"),
              L("spherical droplets, free-floating or fiber-supported", i, "approach", "igniting and observing the burning behavior of relatively large droplets"),
              T("1.1 to 4.67 mm initial diameter", i, f, "Droplet initial diameter; mm")),
    conditions=cond(i, o2=T(R(0.12, 0.34), i, f, "O initial ambient composition; mole fraction", unit="mole fraction"),
                    p=T(R(round(524.4 * MMHG, 1), round(2319.9 * MMHG, 1)), i, f, "Ambient pressure; mmHg", unit="kPa", note="one row (test 114) lists 0 mmHg, excluded as a data entry error"),
                    flow=L(R(0, 0), i, "approach", "relatively large droplets", unit="cm/s", note="quiescent chamber (no imposed flow) assumed for droplet tests; verify"),
                    dil=T(["N2", "CO2", "He"], i, f, "N/CO/He initial ambient composition"),
                    n=T(274, i, f, "FLEX Test # (row count)")),
    variables_varied=T(["fuel", "O2 mole fraction", "pressure", "CO2 fraction", "He fraction", "droplet diameter"], i, f, "all condition columns"),
    measurements=T(["droplet burning rate", "flame extinction diameter", "burn time", "test end mode (completion, disruption, extinction)"], i, f,
                   "Visible flame extinction diameter; Burning rate; Burn time; Test end"),
    safety_domains=J(["prevention", "suppression"], i, "flammability limits and gaseous suppressants"),
    tier=J(1, i, "direct: flammability limits and suppressant effectiveness"),
    habitat_relevance_notes={"moon_base": T("FLEX includes droplet tests at 30% and 34% O2 near 0.7 atm (about 71 kPa), close to the proposed Moon base atmosphere.", i, f,
                                            "O initial ambient composition; Ambient pressure; mmHg")},
    data_availability=da(0, 923832535657, True, []),
    publications=pubs([("Methanol Droplet Combustion in Oxygen-Inert Environments in Microgravity", None, "V Nayagam, DL Dietrich et al."),
                       ("Methanol Droplet Extinction in Oxygen/Carbon-dioxide/Nitrogen Mixtures in Microgravity", None, "V. Nayagam"),
                       ("A Numerical Study On The Extinction Characteristics Of Droplet Combustion Under Microgravity", "10.2514/6.2012-1252", "Farouk Tanvir, Dryer Frederick")]))

i = "PSI-68"; s, e = dates(i, "08-12-2016", "09-30-2019"); f = "PSI-68_Experimental table_Flex2.csv"
inv(psi_id=i, acronym="FLEX-2", title="Flame Extinguishment Experiment - 2", doi="10.60555/byp8-h018",
    project_type="flight", hardware=A(["Combustion Integrated Rack (CIR)", "Multi-user Droplet Combustion Apparatus (MDCA)"], i, "experimentHardware"),
    platform=A("International Space Station (ISS)", i, "flightProgram"), start_date=s, end_date=e,
    objective_summary=L("Extend FLEX to more fuels and conditions, including fuel mixtures, and study flame extinction mechanisms and their boundaries.", i, "objective",
                        "Study flame extinction mechanisms and their boundaries."),
    approach_summary=L("Single droplets and droplet arrays burned in a chamber with pressure 0.5 to 3.0 atm and O2 0.1 to 0.4 mole fraction (N2 or He balance), with low imposed flow.", i, "approach",
                       "varied in pressure between 0.5 atm to 3.0 atm and O2 concentration between 0.1 to 0.4 mole fraction with the diluent gas making up the balance."),
    key_findings=[T("Test matrix covers 17%, 21%, 25% and 30% O2 at 0.5 to 3.0 atm with N2 or He diluent, which includes oxygen levels like the proposed Moon base atmosphere.", i, f,
                    "Oxygen Mole Fraction; Ambient Pressure (atm); Ambient Gas Mixture")],
    fuel=fuel(i, A(["liquid"], i, "approach"),
              T(["iso-octane", "n-octane", "n-heptane", "n-decane", "ethanol", "propanol/glycerol mixtures", "heptane/iso-octane mixture"], i, f, "Sample (Fuel Type)"),
              L("spherical droplets and droplet arrays", i, "objective", "Determine the influence of droplet interactions on the flammability limits and extinction behavior of droplet arrays."),
              T("1.5 to 5 mm initial diameter", i, f, "Initial Droplet Diameter (mm)")),
    conditions=cond(i, o2=T(R(0.17, 0.30), i, f, "Oxygen Mole Fraction", unit="mole fraction", note="record text says 0.1 to 0.4; table matrix lists 0.17 to 0.30"),
                    p=T(R(round(0.5 * ATM, 1), round(3.0 * ATM, 1)), i, f, "Ambient Pressure (atm)", unit="kPa"),
                    flow=T(R(0.1, 5), i, f, "Flow Velocity (cm/s)", unit="cm/s"),
                    dil=T(["N2", "He"], i, f, "Ambient Gas Mixture"),
                    n=N(i, "the PSI table is a test matrix, not a per-test log")),
    variables_constant=T(["ambient temperature 25 C"], i, f, "Ambient Temperature (C)"),
    measurements=L(["burning rate", "flame extinction", "soot volume fraction"], i, "objective", "Analyze the soot formation process, including soot volume fraction soot-shell dynamics."),
    safety_domains=J(["prevention", "fundamental"], i, "extinction boundaries of liquid fuels"),
    tier=J(1, i, "flammability and extinction of liquid fuels at habitat-like O2 and pressure"),
    habitat_relevance_notes={"moon_base": T("Matrix includes 30% O2 at 0.5 and 1.0 atm, bracketing the Moon base pressure (about 0.69 atm).", i, f, "Oxygen Mole Fraction; Ambient Pressure (atm)")},
    data_availability=da(0, 1224752113090, True, []),
    publications=pubs([("Experimental Study of Initial Diameter Effects on Convection-free Droplet Combustion", "10.2514/6.2014-1019", "YC Liu, CT Avedisian et al."),
                       ("Droplet Combustion Experiments Aboard the International Space Station", "10.1007/s12217-014-9372-2", "Dietrich Daniel L., Nayagam Vedha et al.")]))

i = "PSI-102"; s, e = dates(i, "03-02-2001", "02-28-2008"); f = "PSI-102_Experimental table_SAME.csv"
inv(psi_id=i, acronym="SAME", title="Smoke and Aerosol Measurement Experiment", doi="10.60555/gd4k-8h62",
    project_type="flight", hardware=A(["Comparitive Soot Diagnostic Hardware"], i, "experimentHardware"),
    platform=A("International Space Station (ISS)", i, "flightProgram"), start_date=s, end_date=e,
    objective_summary=L("Measure the size of smoke particles produced by overheated spacecraft materials in low gravity and relate it to smoke generation and transport, to evaluate spacecraft smoke detectors.", i, "objective",
                        "quantify the sizes that the liquid smoke particulate achieves in low gravity"),
    approach_summary=L("Materials were heated (not burned) in the Glovebox; smoke was aged in flow, sampled with thermophoretic probes for electron microscopy, and measured by two smoke detectors and particle instruments.", i, "approach",
                       "turned on the igniter for a predefined period of time (15 to 60 seconds), and initiated the thermophoretic soot samplers to sample the smoke."),
    key_findings=[L("SAME provides the reduced-gravity baseline against which future spacecraft smoke detectors are evaluated.", i, "researchImpacts",
                    "The results from SAME are needed to provide the reduced gravity baseline data against which future detection technology developments can be evaluated.")],
    fuel=fuel(i, A(["solid", "liquid"], i, "experimental table"), T(["Teflon", "Kapton", "silicone rubber", "lampwick", "dibutyl phthalate"], i, f, "Sample Material"),
              N(i), N(i)),
    conditions=cond(i, flow=T(R(5, 10), i, f, "Air Flow (cm/s)", unit="cm/s"), dil=N(i), n=T(8, i, f, "Sample # (row count)")),
    variables_varied=T(["material", "air flow", "aging duration"], i, f, "Sample Material; Air Flow (cm/s); Aging Duration (minutes)"),
    measurements=L(["smoke detector response (2 detectors)", "TEM particle size and morphology", "sample mass loss", "video"], i, "approach",
                   "analyzed using a Transmission Electron microscope (TEM) to determine primary and aggregate particle dimensions."),
    safety_domains=J(["detection"], i, "smoke detection"), tier=J(1, i, "direct: spacecraft smoke detection"),
    data_availability=da(104, 657608178, True, ["doc", "mp4", "pdf", "ppt", "pptx", "xls", "xlsx", "xml", "zip"]),
    publications=pubs([("Measurement of Smoke Particle Size under Low-Gravity Conditions", "10.4271/2008-01-2089", "Urban David L., Ruff Gary A. et al."),
                       ("Smoke Particle Sizes in Low-Gravity and Implications for Spacecraft Smoke Detectors", "10.4271/2009-01-2468", "Urban David L., Ruff Gary A. et al.")]))

i = "PSI-101"; s, e = dates(i, "07-01-2010", "09-30-2010"); f = "PSI-101_Experimental table_SAME-R.csv"
inv(psi_id=i, acronym="SAME-R", title="Smoke Aerosol Measurement Experiment-Reflight", doi="10.60555/2np7-jv14",
    project_type="flight", hardware=A(["Comparitive Soot Diagnostic Hardware"], i, "experimentHardware", note="record adds 'Refer to final report'"),
    platform=A("International Space Station (ISS)", i, "flightProgram"), start_date=s, end_date=e,
    objective_summary=L("Repeat SAME with new materials, wider test conditions and improved diagnostics to quantify low-gravity smoke particle sizes.", i, "objective",
                        "the SAME-R investigation employed several modification covering new materials, extended operating conditions, and diagnostic equipments."),
    approach_summary=L("Same hardware as SAME; added Pyrell foam, higher heating temperatures, a no-flow heating condition and a new M-pass instrument; 66 test points flown in July to September 2010.", i, "approach",
                       "SAME-R flight tests were conducted from July 16, to September 9, 2010, successfully completing 66 test points."),
    key_findings=[L("Post-flight ground tests validated the lognormal size-distribution assumption used by the moment method of SAME and SAME-R.", i, "approach",
                    "to validate the lognormal distribution assumption, the key to the moment method employed by SAME and SAME-R.")],
    fuel=fuel(i, A(["solid"], i, "experimental table"), T(["Kapton", "silicone", "lampwick", "Teflon", "Pyrell foam"], i, f, "Sample Type"), N(i), N(i)),
    conditions=cond(i, flow=T(R(0, 8.1), i, f, "Inlet velocity (cm/s)", unit="cm/s"), dil=N(i), n=T(109, i, f, "rows in experimental table", note="record text reports 66 test points")),
    variables_varied=T(["material", "inlet velocity", "aging time"], i, f, "Sample Type; Inlet velocity (cm/s); Primary aging time (sec)"),
    measurements=L(["DustTrak", "ionization detector", "M-pass instrument", "thermophoretic samples"], i, "approach",
                   "a new instrument, M-pass, developed in-house GRC, was used to replace one of the two Commercial Diagnostic Enclosures that includes a DustTrak and an ionization detector used in SAME."),
    safety_domains=J(["detection"], i, "smoke detection"), tier=J(1, i, "direct: spacecraft smoke detection"),
    uses_data_from=A([], i, "projectType (Microgravity Investigation)", note="flight reflight of SAME (PSI-102), not a data reuse"),
    data_availability=da(342, 6308124750, True, ["csv", "doc", "docx", "mp4", "pdf", "ppt", "pptx", "tif", "xls", "xlsx", "zip"]),
    publications=pubs([("Smoke Aerosol Measurement Experiment-2: Comparison of Flight Experiment Results", "10.2514/6.2013-3433", "Meyer Marit E., Urban David L. et al."),
                       ("Particle Morphology and Size Results from the Smoke Aerosol Measurement Experiment-2", "10.2514/6.2012-3536", "Urban David, Ruff Gary et al.")]))

i = "PSI-20"; s, e = dates(i, "01-01-2010", "02-08-2025"); f = "PSI-20_Experimental table_ACME BRE.csv"
BRE_ATM = "NASA - considered atmosphere for human space missions will be examined: 14.7 psia, 21 % oxygen: 10.2 psia, 26.5 %; and 8.2 psia, 34 % oxygen."
inv(psi_id=i, acronym="ACME BRE", title="Advanced Combustion via Microgravity Experiments - Burning Rate Emulator", doi="10.60555/vb93-3y72",
    project_type="flight", hardware=A(["Combustion Integrated Rack (CIR)", "ACME"], i, "experimentHardware"),
    platform=A("International Space Station (ISS)", i, "flightProgram"), start_date=s, end_date=e,
    objective_summary=L("Use gas-fed porous burners to emulate burning of solid and liquid materials in still (quiescent) microgravity air, including the atmospheres NASA considers for crewed exploration.", i, "objective", BRE_ATM),
    approach_summary=L("Ethylene or methane (diluted with N2) flowed through 25 or 50 mm porous burners in chambers set to chosen O2 and pressure; flames observed until extinction or steady state to build a flammability map.", i, "approach",
                       "As the surface temperature of the burner increases, and the flame remains steady, a continuous set of data is produced for the flammability map."),
    key_findings=[
        L("Quasi-steady burning emulating PMMA and Nylon was observed in microgravity without any air flow, especially in elevated-oxygen atmospheres; in 21% O2 such flames self-extinguished quickly. Stopping ventilation is a standard step in fighting spacecraft fires.", i, "researchImpacts",
          "The ongoing combustion without air flow was notably seen in elevated-oxygen atmospheres which are being considered for use in future spacecraft, whereas such flames in a normal atmosphere of 21% oxygen self-extinguished in a short time."),
        L("Results are preliminary; they suggest NASA may want to make more use of its alternative flammability Test 2 (cone calorimeter).", i, "researchImpacts",
          "While BRE’s results are still preliminary, they suggest that NASA may want to increase use of its alternative flammability Test 2"),
    ],
    fuel=fuel(i, A(["gas"], i, "objective", note="gaseous fuel used to emulate condensed-phase (solid/liquid) burning"),
              T(["ethylene (100% and 50% in N2)", "methane"], i, f, "Fuel Bottle"),
              L("flat porous circular burners", i, "objective", "on porous circular burners of 25 and 50 mm diameter"),
              T("25 and 50 mm burner diameter", i, f, "Burner Size (mm)")),
    conditions=cond(i, o2=T(R(0.21, 0.40), i, f, "Oxygen Conc (percent)", unit="mole fraction", note="table lists approximate O2 levels of tests that ignited: 21, 25, 26.5, 34, 40%"),
                    p=P_(R(57.0, 100.0), i, "https://drum.lib.umd.edu/items/b21822b4-9024-46d6-8cef-88f1e01a9d31",
                         "oxygen mole fractions (XO2) ranging from 0.21-0.4, and pressures ranging from 0.57-1 bar.",
                         "Wright, A. E. (2021) MS thesis, University of Maryland, abstract", unit="kPa",
                         note="PSI table does not list pressures; planned atmospheres in the PSI objective were 14.7, 10.2 and 8.2 psia"),
                    flow=L(R(0, 0), i, "objective", "establish the burning conditions in a quiescent microgravity ambient", unit="cm/s"),
                    dil=T(["N2"], i, f, "Notes ('as diluted with nitrogen on a volume basis')"),
                    n=T(18, i, f, "test days (row count); 'Flames Ignited' gives flames per day")),
    variables_varied=T(["fuel", "fuel dilution", "burner size", "O2 concentration", "pressure"], i, f, "Fuel Bottle; Burner Size; Oxygen Conc; Notes"),
    measurements=L(["burner surface temperature", "heat flux", "flame imaging"], i, "approach", "the temperature limit of the heat flux sensor"),
    safety_domains=J(["prevention"], i, "material flammability in still air and exploration atmospheres"),
    tier=J(1, i, "the only PSI data at NASA's candidate exploration atmospheres (10.2 psia / 26.5% and 8.2 psia / 34%)"),
    habitat_relevance_notes={"moon_base": L("BRE explicitly targeted 10.2 psia with 26.5% O2 and 8.2 psia with 34% O2, the atmospheres NASA considers for exploration, which bracket the Moon base assumption of 30% O2 at 10.2 psi.", i, "objective", BRE_ATM)},
    data_availability=da(1, 2035568427496, True, ["csv"]),
    publications=pubs([("Burning on flat wicks at various orientations", "10.1177/0734904113495650", "Zhang Yi, Bustamante Michael J. et al."),
                       ("A Gas Burner to Emulate Condensed-Phase Burning", "10.3850/978-981-07-5936-0_03-01", "Zhang Y., Bustamante M. J. et al.")]))

# ---------------------------------------------------------------- tier 2
i = "PSI-47"; s, e = dates(i, "03-01-2003", "06-01-2009"); f = "PSI-47_Experimental table_DAFT.csv"
inv(psi_id=i, acronym="DAFT / DAFT-2", title="Dust and Aerosol Measurement Feasibility Test / Dust and Aerosol Measurement Feasibility Test-2", doi="10.60555/ztgj-d202",
    project_type="flight", hardware=A(["TSI P-Trak"], i, "experimentHardware"), platform=A("International Space Station (ISS)", i, "flightProgram"), start_date=s, end_date=e,
    objective_summary=L("Show that a particle counter modified for microgravity (TSI P-Trak) works reliably, reducing risk for the SAME smoke experiment.", i, "objective",
                        "DAFT / DAFT-2 tests that a modified P-Trak particulate counter would be accurate in microgravity."),
    approach_summary=L("Arizona road dust was aerosolised with nitrogen in Mylar bags and measured on orbit by the modified P-Trak and a DustTrak reference.", i, "approach",
                       "The ARD was aerosolized with GN2 to create particle samples."),
    key_findings=[L("Detector work is aimed at more reliable and sensitive fire detection for long missions; the same instrument used for smoke was used for dust here.", i, "researchImpacts",
                    "Extended duration space flight missions with larger vessels will require fire detection systems with increased reliability and sensitivity.")],
    fuel=fuel(i, A([], i, "approach", note="no combustion: dust aerosol only"), T(["Arizona Road Dust (fine) in nitrogen"], i, f, "Sample Material"), N(i), N(i)),
    conditions=cond(i, n=T(2, i, f, "Session Name (D1, D2)")),
    measurements=T(["P-Trak particle counts", "DustTrak particle counts"], i, f, "Hardware Description"),
    safety_domains=J(["detection"], i, "instrument validation for smoke detection"), tier=J(2, i, "detection instrument, no fire"),
    data_availability=da(32, 41765333, True, ["doc", "jpg", "pdf", "ppt", "txt", "xls", "zip"]),
    publications=pubs([("A Research Plan for Fire Prevention, Detection and Suppression in Crewed Exploration Systems", "10.2514/6.2005-341", "Ruff Gary, Urban David et al."),
                       ("Detection of Smoke from Microgravity Fires", "10.4271/2005-01-2930", "Urban David, Griffin DeVon et al.")]))

i = "PSI-159"; fN = "PSI-159_Experimental table_CFI-G_Normal Flames.csv"
inv(psi_id=i, acronym="ACME CFI-G", title="Advanced Combustion via Microgravity Experiments / Cool Flames Investigation with Gases", doi="10.60555/cyt1-kh64",
    project_type="flight", hardware=A(["ACME", "Combustion Integrated Rack (CIR)"], i, "experimentHardware"), platform=A("International Space Station (ISS)", i, "flightProgram"),
    objective_summary=L("Find the conditions in which cool diffusion flames occur for propane, n-butane and n-pentane in normal and inverse spherical flames.", i, "objective",
                        "Determine the conditions for which cool diffusion flames occur for propane, n-butane, and n-pentane"),
    approach_summary=L("Spherical porous-burner flames on the ISS with several fuels, dilutions, flow rates and pressures, observed with cameras, radiometers, photomultipliers and thermocouples.", i, "approach",
                       "Perform spherical diffusion flame tests aboard the International Space Station."),
    key_findings=[T("Inverse flames used burner oxidizer up to 85% O2, the highest oxygen in PSI microgravity tests; in those tests the surrounding chamber gas was fuel and nitrogen, not oxygen.", i,
                    "PSI-159_Experimental table_CFI-G_Inverse Flames.csv", "XO2")],
    fuel=fuel(i, A(["gas"], i, "approach"), T(["ethane", "propane", "n-butane", "fuel/N2 mixtures"], i, fN, "Fuel"), L("spherical porous burner", i, "approach", "Perform spherical diffusion flame tests"), N(i)),
    conditions=cond(i, o2=T(R(0.18, 0.40), i, fN, "XO2 before test", unit="mole fraction", note="normal flames (oxygen in the ambient); inverse flames reach 0.85 O2 in the burner gas"),
                    p=T(R(round(0.495 * BAR, 1), round(3.31 * BAR, 1)), i, fN, "approx p (bar) (normal and inverse tables)", unit="kPa"),
                    dil=T(["N2"], i, fN, "Xf"), n=T(333, i, fN, "rows in normal (179) and inverse (154) tables")),
    measurements=L(["cameras", "radiometers", "photomultiplier tubes", "thermocouples"], i, "approach", "Observe the flames with a broad suite of cameras, radiometers, photomultiplier tubes, and thermocouples."),
    safety_domains=J(["fundamental"], i, "cool flame chemistry"), tier=J(2, i, "highest-O2 microgravity flames in PSI; mainly fundamental"),
    data_availability=da(3756, 2085592429259, True, ["csv", "jpg", "log", "mp4", "pdf", "png", "ts", "txt", "xlsx", "zip"]),
    publications=pubs([("Spherical gas-fueled cool diffusion flames", "10.1016/j.proci.2022.07.015", "Kim Minhyeng, Waddell Kendyl A. et al."),
                       ("Cool diffusion flames in a stably stratified stagnation flow", "10.1016/j.combustflame.2023.112852", "Waddell Kendyl A., Lee Han Ju et al.")]))

i = "PSI-22"; s, e = dates(i, "11-18-2016", "11-17-2020"); f = "PSI-22_Experimental table_ACME E-FIELD Flames.csv"
inv(psi_id=i, acronym="ACME E-FIELD Flames", title="Advanced Combustion via Microgravity Experiments Electric-Field Effects on Laminar Diffusion Flames", doi="10.60555/se5a-8c73",
    project_type="flight", hardware=A(["Combustion Integrated Rack (CIR)", "ACME"], i, "experimentHardware"), platform=A("International Space Station (ISS)", i, "flightProgram"), start_date=s, end_date=e,
    objective_summary=L("Study how electric fields act on the ions in gas flames: voltage and ion current, dynamic flame response, soot and near-limit lifted flames.", i, "objective",
                        "better understand the relationship between electric field voltage and chemi-ion current"),
    approach_summary=L("Gas-fueled laminar flames with and without air coflow on the ACME coflow burner, with an electric field applied between burner and a mesh electrode.", i, "approach",
                       "The experiment is conducted with gas-fueled flames, both with and without a coflow of air."),
    key_findings=[L("The investigation states it does not serve space applications directly; it may help future space combustion devices. (The challenge statement notes that the electric field can mimic partial gravity.)", i, "researchImpacts",
                    "The E-FIELD Flames research is not being conducted to serve any space applications")],
    fuel=fuel(i, A(["gas"], i, "approach"), T(["methane", "ethylene", "N2-diluted mixtures"], i, f, "Fuel Bottle; Fuel Conc"), L("coflow burner", i, "approach", "the same coflow burner used by the Coflow Laminar Diffusion (CLD) Flame experiment"), N(i)),
    conditions=cond(i, grav="partial_emulated", dil=T(["N2"], i, f, "Notes"), n=T(21, i, f, "test days")),
    variables_varied=T(["mesh polarity", "fuel", "fuel concentration"], i, f, "Mesh Polarity; Fuel Bottle; Fuel Conc"),
    measurements=L(["ion current", "flame imaging", "soot"], i, "objective", "evaluate soot formation"),
    safety_domains=J(["fundamental"], i, "electric-field flame physics"), tier=J(2, i, "only PSI proxy for partial gravity (per challenge statement)"),
    data_availability=da(0, 950212491107, True, []),
    publications=pubs([("Electric Field Induced Changes of a Diffusion Flame and Heat Transfer near a Grid", "10.3390/en11051235", "Chien Yu-Chien, Dunn-Rankin Derek et al.")]))

i = "PSI-107"; f = "PSI-107_Experimental table_Spice.csv"
inv(psi_id=i, acronym="SPICE", title="Smoke Point In Co-flow Experiment", doi="10.60555/9kbh-e962",
    project_type="flight", hardware=A(["Microgravity Science Glovebox (MSG)"], i, "experimentHardware"), platform=A("International Space Station (ISS)", i, "flightProgram"),
    objective_summary=L("Find the laminar smoke points of non-buoyant jet flames in co-flowing air and how burner size, co-flow speed and fuel affect sooting.", i, "objective",
                        "Identify the laminar smoke-point properties of non-buoyant jet diffusion flames under various co-flow conditions in microgravity."),
    approach_summary=L("Gas jet flames in the MSG flow duct with 0.41, 0.76 and 1.6 mm nozzles and co-flow from 5.4 to 65 cm/s; fuel flow adjusted to reach the smoke point.", i, "approach",
                       "co-flow velocities ranging from 5.4 cm/s to 65 cm/s."),
    key_findings=[L("Results support understanding soot formation for safer spacecraft environments.", i, "researchImpacts", "Will improve our understanding of soot formation mechanisms and help design safer spacecraft environments.")],
    fuel=fuel(i, A(["gas"], i, "approach"), T(["methane", "ethylene", "propane", "propylene", "propylene mixtures"], i, f, "Fuel"),
              L("round jet nozzles in co-flow", i, "approach", "with burner diameters of 0.41 mm, 0.76 mm, and 1.6 mm"), T("0.41, 0.76 and 1.6 mm nozzles", i, f, "Nozzle (mm)")),
    conditions=cond(i, flow=L(R(5.4, 65), i, "approach", "co-flow velocities ranging from 5.4 cm/s to 65 cm/s", unit="cm/s"),
                    dil=N(i), n=T(469, i, f, "rows in experimental table")),
    variables_varied=T(["fuel", "nozzle diameter", "fuel flow rate", "air co-flow velocity"], i, f, "Fuel; Nozzle (mm); Fuel Rate; Air Rate (cm/s)"),
    measurements=T(["ignition and flame-off times", "fuel flow rate", "air flow rate", "DSLR images"], i, f, "GMT ignition; GMT Flame Off; Fuel Rate; Air Rate"),
    safety_domains=J(["detection", "fundamental"], i, "soot / smoke generation"), tier=J(2, i, "smoke and soot from flames"),
    data_availability=da(186, 6946864573, True, ["avi", "doc", "docx", "mp4", "nef", "pdf", "ppt", "pptx", "txt", "xls", "xlsx", "zip"]),
    publications=pubs([("Laminar Smoke Points in Coflow Measured Aboard the International Space Station", "10.2514/6.2010-1105", "Dotson Keenan, Sunderland Peter et al.")]))

i = "PSI-106"; f = "PSI-106_Experimental table_Slice.csv"
inv(psi_id=i, acronym="SLICE", title="Structure and Liftoff In Combustion Experiment", doi="10.60555/pm12-rg61",
    project_type="flight", hardware=A([], i, "experimentHardware", note="empty in PSI record; approach describes the fan-driven flow duct"),
    platform=A("International Space Station (ISS)", i, "flightProgram"),
    objective_summary=L("Understand the structure and stability of laminar gas diffusion flames in microgravity, including liftoff limits and the effect of nitrogen dilution.", i, "objective",
                        "better understand the structure and stability of laminar diffusion flames in microgravity."),
    approach_summary=L("Fan-driven flow duct with exchangeable burner tubes; methane, ethylene and nitrogen-diluted fuels ignited in controlled air coflow.", i, "approach",
                       "The SLICE apparatus consisted of a fan-driven flow duct, exchangeable burner tubes, and integrated sensors to measure flow rates and temperature."),
    fuel=fuel(i, A(["gas"], i, "approach"), T(["methane (20 to 100%)", "ethylene", "ethane", "propane"], i, f, "Fuel Type"), L("burner tubes in coflow", i, "approach", "exchangeable burner tubes"), N(i)),
    conditions=cond(i, dil=T(["N2"], i, f, "Fuel Type ('balance N2')"), n=T(12, i, f, "test days")),
    safety_domains=J(["fundamental"], i, "flame stability"), tier=J(2, i, "flame structure, same MSG flow duct as BASS"),
    data_availability=da(1, 72914598688, True, ["csv"]),
    publications=pubs([("A computational and experimental study of coflow laminar methane/air diffusion flames", "10.1016/j.proci.2014.05.138", "Cao S., Ma B., Bennett B.A.V. et al.")]))

i = "PSI-39"; s, e = dates(i, "10-01-2020", "10-20-2021"); f = "PSI-39_Experimental table_CFI.csv"
inv(psi_id=i, acronym="CFI", title="Cool Flames Investigation", doi="10.60555/m6pj-a914",
    project_type="flight", hardware=A(["Multi-User Droplet Combustion Apparatus (MDCA)", "Combustion Integrated Rack (CIR)"], i, "experimentHardware"),
    platform=A("International Space Station (ISS)", i, "flightProgram"), start_date=s, end_date=e,
    objective_summary=L("Study n-dodecane droplet combustion and cool flames over 0.25 to 5 atm, including helium dilution and the link between droplet size, pressure and extinction.", i, "objective",
                        "Examine the combustion behavior of n-dodecane and mixtures of n-dodecane/iso-dodecane at pressures ranging from 0.25 atm to 5 atm."),
    approach_summary=L("Fuel droplets tethered or suspended in the MDCA and ignited by a hot wire in controlled gas mixtures.", i, "approach",
                       "Droplets of fuel are dispensed and suspended between hypodermic needles or tethered using silicon-carbide fibers."),
    fuel=fuel(i, A(["liquid"], i, "approach"), T(["n-dodecane", "n-dodecane / iso-dodecane mixtures"], i, f, "Fuel"), L("droplets", i, "approach", "Droplets of fuel are dispensed"), N(i)),
    conditions=cond(i, o2=T(R(0.17, 0.21), i, f, "Oxygen", unit="mole fraction"), p=T(R(round(0.5 * ATM, 1), round(5 * ATM, 1)), i, f, "Pressure", unit="kPa", note="objective text says 0.25 to 5 atm"),
                    dil=T(["N2", "He"], i, f, "Nitrogen; Helium"), n=T(87, i, f, "Flex Number (row count)")),
    variables_varied=T(["pressure", "O2", "He fraction", "fiber support", "fuel"], i, f, "Pressure; Oxygen; Helium; Fiber; Fuel"),
    safety_domains=J(["fundamental"], i, "cool flame droplet combustion"), tier=J(2, i, "droplet extinction over a wide pressure range"),
    data_availability=da(2831, 718889568684, True, ["meta", "metadata", "mp4", "pdf", "pptx", "pxp", "rtf", "ts", "txt", "xlsx", "zip"]),
    publications=pubs([("Can cool flames support quasi-steady alkane droplet burning?", "10.1016/j.combustflame.2012.07.012", "V Nayagam, DL Dietrich et al."),
                       ("Cool-flame extinction during n-alkane droplet combustion in microgravity", "10.1016/j.combustflame.2015.01.012", "V Nayagam, DL Dietrich et al.")]))

# ---------------------------------------------------------------- tier 3 (ACME gas flames)
i = "PSI-10"; s, e = dates(i, "01-14-1999", "04-30-2025"); f = "PSI-10_Experimental table_Flame Design_Normal Flame.csv"
inv(psi_id=i, acronym="ACME Flame Design", title="Advanced Combustion via Microgravity Experiments / Flame Design", doi="10.60555/w4zy-bt45",
    project_type="flight", hardware=A(["ACME", "Combustion Integrated Rack (CIR)"], i, "experimentHardware"), platform=A("International Space Station (ISS)", i, "flightProgram"), start_date=s, end_date=e,
    objective_summary=L("Measure soot-inception limits and structure of normal and inverse spherical diffusion flames of ethylene and methane versus flow, dilution and pressure.", i, "objective",
                        "Obtain soot-inception limits of quasi-steady normal and inverse spherical diffusion flames"),
    approach_summary=L("Spherical diffusion flames in drop towers and on the ISS over a range of dilutions, flow rates and pressures.", i, "approach",
                       "Consider a broad range of reactant dilutions, flow rates and pressures for normal and inverse convection directions."),
    fuel=fuel(i, A(["gas"], i, "objective"), T(["ethylene", "propane"], i, f, "Fuel"), L("spherical porous burner", i, "approach", "Perform spherical diffusion flame tests"), N(i)),
    conditions=cond(i, o2=T(R(0.198, 0.40), i, f, "XO2 (init)", unit="mole fraction", note="normal flames"),
                    p=T(R(round(0.426 * ATM, 1), round(3.018 * ATM, 1)), i, f, "pmean (atm) (normal and inverse tables)", unit="kPa"),
                    dil=L(["N2", "CO2"], i, "objective", "amount of inert (N2 or CO2)"), n=T(327, i, f, "rows in normal (207) and inverse (120) tables")),
    safety_domains=J(["fundamental"], i, "soot and flame structure"), tier=J(3, i, "fundamental gas flames"),
    data_availability=da(3807, 2180435304347, True, ["asc", "csv", "jpg", "log", "pdf", "png", "ts", "txt", "xlsx", "zip"]),
    publications=pubs([("On the existence of steady-state gaseous microgravity spherical diffusion flames", "10.1016/j.proci.2022.07.049", "Irace Phillip H., Waddell Kendyl A. et al.")]))
INV[-1]["license"] = {"value": None, "prov": prov("psi_api", "PSI-10", "PSI record field: licenseName", None, "api_direct", note="license field is empty in the PSI record; check before reuse")}

i = "PSI-21"; s, e = dates(i, "10-01-2006", "05-31-2022"); f = "PSI-21_Experimental table_CLD Flame.csv"
inv(psi_id=i, acronym="ACME CLD Flame", title="Advanced Combustion via Microgravity Experiments / Coflow Laminar Diffusion Flame", doi="10.60555/23e1-9950",
    project_type="flight", hardware=A(["Combustion Integrated Rack (CIR)", "ACME"], i, "experimentHardware"), platform=A("International Space Station (ISS)", i, "flightProgram"), start_date=s, end_date=e,
    objective_summary=L("Characterise weak and sooting coflow methane and ethylene flames (shape, liftoff, temperature, extinction limits) to test soot models.", i, "objective",
                        "Characterize the behavior of weak coflow diffusion flames of methane and ethylene, as a function of velocity and fuel dilution"),
    approach_summary=L("Methane and ethylene coflow flames over a wide range of fuel dilution and velocity.", i, "approach", "we plan to study methane and ethylene diffusion flames over a wide range of test conditions."),
    fuel=fuel(i, A(["gas"], i, "objective"), T(["methane (N2-diluted)", "ethylene"], i, f, "Fuel Bottle; Fuel conc. Range"), L("coflow burner", i, "objective", "weak coflow diffusion flames"), N(i)),
    conditions=cond(i, dil=T(["N2"], i, f, "Notes"), n=T(32, i, f, "test days")),
    safety_domains=J(["fundamental"], i, "soot modelling"), tier=J(3, i, "fundamental gas flames"),
    data_availability=da(1, 2005536295241, True, ["csv"]),
    publications=pubs([("Analysis of CH* concentration and flame heat release rate in laminar coflow diffusion flames", "10.1016/j.combustflame.2016.02.012", "D Giassi, S Cao et al.")]))

i = "PSI-23"; s, e = dates(i, "02-05-2015", "11-24-2019"); f = "PSI-23_Experimental table_ACME s-Flame.csv"
inv(psi_id=i, acronym="ACME s-Flame", title="Advanced Combustion via Microgravity Experiments-Structure and Response of Spherical Diffusion Flames", doi="10.60555/k57n-p030",
    project_type="flight", hardware=A(["Combustion Integrated Rack (CIR)", "ACME"], i, "experimentHardware"), platform=A("International Space Station (ISS)", i, "flightProgram"), start_date=s, end_date=e,
    objective_summary=L("Measure the transient structure of spherical diffusion flames of H2/CH4 and C2H4 mixtures to test transport and chemical kinetics models.", i, "objective",
                        "Measure and characterize the transient structure (such as temperature and species distribution) of diffusion flames"),
    approach_summary=L("Gaseous fuel and diluent issued through a spherical porous burner into an oxidizing atmosphere, with synchronised imaging, temperature and radiation measurements.", i, "approach",
                       "issued into an oxidizing environment through a spherical porous burner and ignited"),
    fuel=fuel(i, A(["gas"], i, "objective"), T(["H2", "CH4", "C2H4", "H2/CH4 mixtures"], i, f, "Fuel Bottle"), L("spherical porous burner", i, "approach", "spherical porous burner"), N(i)),
    conditions=cond(i, o2=T(R(0.21, 0.30), i, f, "Atmosphere* ('~21% O2' and '~30% O2')", unit="mole fraction"),
                    p=T(R(ATM, ATM), i, f, "Notes: '*Atmosphere is ~1 atm but pressure increases and O2% drops with vitiation.'", unit="kPa"),
                    dil=T(["N2", "He"], i, f, "Atmosphere*"), n=T(18, i, f, "test days")),
    safety_domains=J(["fundamental"], i, "flame structure"), tier=J(3, i, "fundamental gas flames; includes ~30% O2 atmospheres"),
    data_availability=da(4163, 782172126062, True, ["asc", "csv", "log", "mp4", "pdf", "sfk", "txt", "xlsx", "zip"]),
    publications=pubs([("Opportunities and challenges of combustion in microgravity", "10.1016/0360-1285(94)90006-X", "Law C.K., Faeth G.M.")]))

# ---------------------------------------------------------------- tier 3 (ground studies reusing PSI data)
def ground(i, title, doi, s_, e_, obj, objq, app, appq, uses, usesq, uses_loc, tier_note, n, b, pub, domains=("fundamental",), find=None):
    s, e = dates(i, s_, e_)
    inv(psi_id=i, acronym="", title=title, doi=doi, project_type="ground",
        hardware=A([], i, "experimentHardware", note="ground study"), platform=A("ground", i, "projectType (Ground Investigation)"), start_date=s, end_date=e,
        objective_summary=L(obj, i, "objective", objq), approach_summary=L(app, i, "approach", appq),
        key_findings=find or [],
        fuel=fuel(i, N(i), N(i)), conditions=cond(i, grav="normal"),
        safety_domains=J(list(domains), i, tier_note), tier=J(3, i, tier_note),
        uses_data_from=L(uses, i, uses_loc, usesq),
        data_availability=da(n, b, False, []), publications=pubs(pub))


ground("PSI-117", "Effect of External Thermo-Convective Perturbation on Cool Flame Dynamics: A Multidimensional Multi-Physics CFD Analysis", "10.60555/gz0q-b577", "02-15-2017", "02-14-2022",
       "Use FLEX flight data to quantify how heating and drift-induced convection change the fate of droplet cool flames.", "to use flight data obtained from PSI through NASA’s Flame Extinguishment Experiment (FLEX)",
       "3-D OpenFOAM CFD model of n-alkane droplet cool flames validated against ISS FLEX measurements.", "Model fidelity was established against ISS FLEX measurements",
       ["PSI-69"], "use flight data obtained from PSI through NASA’s Flame Extinguishment Experiment (FLEX)", "objective", "modelling built on FLEX data", 15, 70820870,
       [("Extinction characteristics of isolated n-alkane fuel droplets during low temperature combustion", "10.1016/j.proci.2022.07.094", "Farouk Tanvir I., Dryer Frederick L. et al.")],
       domains=("prevention", "fundamental"),
       find=[L("Potential to improve spacecraft fire-safety modelling of cool-flame and extinction behaviour.", "PSI-117", "researchImpacts", "Potential to improve spacecraft fire-safety modeling by resolving cool-flame/extinction behavior in microgravity")])
ground("PSI-62", "Concurrent Flame Spread Modeling using Flamelet Generated Manifolds in Microgravity with Comparison to BASS Experiments using Two-Color Tomography", "10.60555/e9xp-ex83", "05-01-2019", "04-30-2021",
       "Develop and validate flamelet generated manifold (FGM) models for concurrent flame spread over solids in microgravity.", "develop and validate new flamelet generated manifold (FGM) modeling techniques for concurrent flame spread in microgravity.",
       "Coupled fluid-solid simulations of charring and ablating materials with an unsteady FGM method, compared with BASS imagery processed by two-color tomography.", "the unsteady FGM method was implemented and tested",
       ["PSI-26", "PSI-25"], "Experimental imagery found in PSI from the BASS and BASS-II investigations was post-processed", "PSI search result highlight text (approach / impacts); verify on the record page",
       "flame spread modelling built on BASS data", 1, 9694,
       [("Radiative flamelet generated manifolds for solid fuel flame spread in microgravity", "10.1016/j.combustflame.2023.112939", "Budzinski Kenneth, DesJardin Paul E."),
        ("Theoretical estimates of flammability bounds for thin condensed fuel diffusion flames", "10.1016/j.combustflame.2023.112910", "Budzinski Kenneth, DesJardin Paul E.")],
       domains=("prevention", "fundamental"),
       find=[L("Provides predictive tools for screening the flammability limits of new materials.", "PSI-62", "researchImpacts", "This research provides predictive tools for screening new materials’ flammability limits")])
ground("PSI-60", "Computational and Experimental Analysis of SPICE Data Sets", "10.60555/mzjm-yv57", "06-05-2019", "08-29-2022",
       "Derive soot temperature and volume fraction fields from SPICE images and models to explain 1g versus 0g soot differences.", "to derive temperature distributions and soot volume fractions from the Smoke Point in Coflow Experiment (SPICE) data available in PSI.",
       "Colour-ratio pyrometry on over 1600 raw SPICE DSLR images plus coupled flow, species and soot modelling.", "Raw Nikon NEF images were decoded into three color channels and analyzed using color-ratio pyrometry",
       ["PSI-107"], "from the Smoke Point in Coflow Experiment (SPICE) data available in PSI", "objective", "soot modelling built on SPICE data", 1, 7743,
       [("A Combined Experimental and Computational Study of Soot Formation in Normal and Microgravity", "10.1080/00102202.2022.2041621", "Dobbins Richard R. et al.")])
ground("PSI-142", "Quantitative Studies of Cool Flame Transitions at Radiation / Stretch Extinction Using Counterflow Flames", "10.60555/80qf-vj95", "08-01-2016", "07-31-2021",
       "Use FLEX data with new simulations and ozone-assisted counterflow experiments to map flammability limits of cool flames.", "By using the Flame Extinguishment (FLEX) experimental data from the Physical Sciences Informatics (PSI) system",
       "Three numerical schemes compared oxygen effects on cool-flame extinction limits under FLEX flight conditions.", "Using the experimental conditions of FLEX flight, a comparative studies of the oxygen concentration effects on the extinction limits of cool flames",
       ["PSI-69"], "By using the Flame Extinguishment (FLEX) experimental data from the Physical Sciences Informatics (PSI) system", "objective", "flammability-limit modelling built on FLEX data", 2, 748117,
       [("Dynamics of cool flames", "10.1016/j.pecs.2019.100787", "Ju Yiguang et al.")], domains=("prevention", "fundamental"))
ground("PSI-115", "Utilization of the Smoke Aerosol Measurement Experiment Data for Advanced Modeling and Simulation of Smoke Generation in Micro-Gravity", "10.60555/q0v5-1v28", "01-30-2017", "12-31-2019",
       "Simulate how gravity changes pyrolysis smoke growth, to quantify differences between microgravity and Earth smoke.", "to quantify the differences between microgravity and Earth gravity smoke",
       "Direct numerical simulation of dibutyl-phthalate smoke particle formation in a SAME-like geometry in 1g and 0g.", "The smoke originates from pyrolysis vapor expelled from a heated sample in a geometry similar to that considered in the SAME experiments.",
       ["PSI-102"], "Utilization of the Smoke Aerosol Measurement Experiment Data", "title", "smoke modelling built on SAME data", 47, 264404901, [], domains=("detection",),
       find=[L("Smoke particle models can lead directly to better smoke detection devices.", "PSI-115", "researchImpacts", "This would directly lead to better smoke detection devices")])

EXTRA = {
    "PSI-26": [
        P_("Ultem and Nomex HT90-40 samples did not burn in the ISS atmosphere (21 to 22% O2, flows around 15 cm/s); Nomex-III did burn.",
           "PSI-26", "https://ntrs.nasa.gov/citations/20140011099", "Ultem and Nomex HT90-40 samples did not burn on ISS atmosphere",
           "Ferkul et al., ASGSR 2013 presentation (NTRS 20140011099)"),
        P_("Flame spread rate increased linearly with flow; quenching extinction was observed at about 1 cm/s.",
           "PSI-26", "https://ntrs.nasa.gov/citations/20140011099", "Quenching extinction was observed (around 1 cm/s)",
           "Ferkul et al., ASGSR 2013 presentation (NTRS 20140011099)"),
    ],
    "PSI-25": [
        P_("Flame extinctions in BASS-II indicate that materials can burn at a lower oxygen concentration in microgravity than in normal gravity.",
           "PSI-25", "https://ttu-ir.tdl.org/items/1922ad9f-ef4c-4f52-96a4-980c23debe5e",
           "Flame extinctions occurred under conditions indicating that materials can burn at a lower oxygen concentration in microgravity compared to normal gravity.",
           "Olson et al., ICES-2019 (Flammability Limits from BASS-II Testing in Microgravity Compared to Normal Gravity Limits), abstract"),
        P_("Opposed-flow spread over PMMA rods was sustained at 17% O2 in microgravity versus 18% in normal gravity.",
           "PSI-25", "https://doi.org/10.1038/s41598-017-18398-4",
           "flame spread in microgravity could be faster and sustained at lower oxygen concentration (17%) than in normal gravity (18%).",
           "Scientific Reports (2018), BASS-II opposed flow on PMMA cylinders, abstract"),
        P_("Most BASS-II tests had heat release rates well below 100 W.", "PSI-25", BASS2_TM,
           "The results showed that most of the tests had heat release rates well below 100 W.", "NASA/TM-20210011385 Summary (pdf p. 10)",
           st="psi_document", file=BASS2_TM_FILE),
        P_("For SIBAL fabric the quenching boundary lies between 1 and 5 cm/s, with higher quenching speed at lower O2.", "PSI-25", BASS2_TM,
           "between 1 and 5 cm/s with higher velocity at lower O2 percentage", "NASA/TM-20210011385 (pdf p. 108)", st="psi_document", file=BASS2_TM_FILE),
    ],
    "PSI-98": [
        P_("Concurrent flame spread over the large fabric reached a steady spread rate and a limiting flame length, unlike the accelerating upward spread on Earth; a flame size limit can bound the heat release rate in a vehicle.",
           "PSI-98", "https://doi.org/10.1016/j.combustflame.2018.10.012",
           "a concurrent (downstream) spreading flame over thin fabrics in microgravity reaches a steady spread rate and a limiting length.",
           "Urban et al. (2019) Combustion and Flame 199:168-182, abstract"),
        P_("The flame in the large Saffire duct spread more slowly than in earlier small-tunnel microgravity tests, attributed to flow acceleration in small tunnels: scale matters.",
           "PSI-98", "https://ntrs.nasa.gov/citations/20170008805",
           "Compared to previous microgravity work in smaller tunnels, the flame in the larger tunnel spread more slowly, even for a wider sample.",
           "Ferkul et al., Results of Large-Scale Spacecraft Flammability Tests (NTRS 20170008805), abstract"),
    ],
    "PSI-99": [
        P_("The 1 cm thick PMMA sample approached a non-growing steady state with a limiting pyrolysis length during its 15 min burn.",
           "PSI-99", "https://doi.org/10.1016/j.combustflame.2018.10.012",
           "The flame over the thick PMMA sample approaches a non-growing, steady state in the 15 min burning duration and has a limiting pyrolysis length.",
           "Urban et al. (2019) Combustion and Flame 199:168-182, abstract"),
    ],
    "PSI-69": [
        P_("Limiting oxygen index (LOI) in O2/N2: 0.12 for methanol and 0.15 for heptane droplets.", "PSI-69", "https://doi.org/10.1007/s12217-014-9372-2",
           "For oxygen/nitrogen mixtures, the LOI is 0.12 and 0.15 for methanol and heptane, respectively.",
           "Dietrich et al. (2014) Microgravity Sci. Technol., abstract"),
        P_("With CO2 added to simulate a dispersed suppressant, the LOI rises to about 0.14 (methanol, 30% CO2) and 0.17 (heptane, 20% CO2).", "PSI-69",
           "https://doi.org/10.1007/s12217-014-9372-2", "The LOI increases to approximately 0.14",
           "Dietrich et al. (2014) Microgravity Sci. Technol., abstract", note="full sentence gives compositions 0.14 O2/0.56 N2/0.30 CO2 and 0.17 O2/0.63 N2/0.20 CO2"),
        P_("Methanol LOI is about 12 to 13% O2 in CO2- and He-diluted atmospheres at 0.7 and 1 atm.", "PSI-69", "https://ntrs.nasa.gov/citations/20130014061",
           "the limiting oxygen index for methanol in these diluent gases is around 12% to 13% oxygen by volume.",
           "Nayagam et al. (2013), NTRS 20130014061, abstract"),
    ],
    "PSI-102": [
        P_("Smoke particles produced in low gravity were typically about twice the size of those produced in normal gravity.", "PSI-102",
           "https://bvbvf1.bib-bvb.de/vufind/PrimoRecord/cdi_nasa_ntrs_20140006585",
           "the smoke particles produced in low gravity were typically twice the size of particles produced in normal gravity.",
           "Urban et al., Evaluation of Low-Gravity Smoke Particulate for Spacecraft Fire Detection (NTRS 20140006585), abstract",
           note="conflicts with the later SAME-R analysis (Yang et al. 2018), see PSI-101; show both"),
    ],
    "PSI-101": [
        P_("Later analysis found low-gravity smoke particles were not significantly different from equivalent normal-gravity smoke, and the two spacecraft smoke detectors did not detect every smoke type.",
           "PSI-101", "https://doi.org/10.1016/j.firesaf.2018.04.004",
           "The two spacecraft smoke detectors did not successfully detect every type of smoke",
           "Yang et al. (2018) Fire Safety Journal 98, abstract (NIST)", note="contrasts with Urban et al. (PSI-102): particle size differences are contested"),
        P_("Most average smoke particle sizes were 200 to 400 nm, with some quiescent cases producing substantially larger particles.", "PSI-101",
           "https://ntrs.nasa.gov/citations/20130000422", "the majority of the average smoke particle sizes were found to be in the 200 nm to 400 nm range",
           "NTRS 20130000422 (AIAA 2013), abstract"),
    ],
    "PSI-20": [
        P_("All BRE flames in 21% O2 self-extinguished within 40 s, while steady flames were observed at 26.5%, 34% and 40% O2.", "PSI-20",
           "https://drum.lib.umd.edu/handle/1903/29303", "All flames burning in 21% by volume oxygen self-extinguished within 40 s.",
           "Dehghani, P., PhD dissertation, University of Maryland, abstract"),
        P_("Flames self-extinguished below about 25% O2 but could burn for minutes at the elevated O2 levels considered for future spacecraft.", "PSI-20",
           "https://ntrs.nasa.gov/citations/20210022542", "they were found to self-extinguish in concentrations below ~25% (by volume).",
           "ACME overview, JASMAC-33 (2021), NTRS 20210022542"),
    ],
}

EXCLUDED = [
    {"psi_id": "PSI-181", "title": "Structure and Properties of Pb-Sn and Pb-free Sn-Ag-Cu Solders Produced in Terrestrial vs. Microgravity Environments",
     "reason": "Returned by the PSI 'combustion' search but is a solder materials study (no combustion).", "psi_url": page("PSI-181")},
    {"psi_id": "PSI-108", "title": "Surface Tension Driven Convection Experiment-1 (STDCE-1)",
     "reason": "Returned by the PSI 'combustion' search but is a thermocapillary fluid physics study (no combustion).", "psi_url": page("PSI-108")},
]

# ---------------------------------------------------------------- flammability points
POINTS = []


def pt(pid, test, material, mclass, o2, p, flow, dil, outcome, spread, pv):
    POINTS.append({"id": f"{pid}:{test}", "psi_id": pid, "test_id": test, "material": material, "material_class": mclass,
                   "o2_mole_fraction": o2, "pressure_kpa": p, "flow_cm_s": flow, "diluent": dil, "gravity": "micro",
                   "outcome": outcome, "spread_rate_mm_s": spread, "prov": pv})


FLEX_FILE = "PSI-69_Experimental table_FLEX.csv"
FLEX_LOI = {"M": 0.12, "H": 0.15}  # O2/N2, Dietrich et al. 2014 (doi 10.1007/s12217-014-9372-2)
FLEX_LOI_QUOTE = "For oxygen/nitrogen mixtures, the LOI is 0.12 and 0.15 for methanol and heptane, respectively."
for row in open(os.path.join(EX, "flex_tests.txt")).read().strip().split(";"):
    n, ident, fu, pmm, o2, co2, he, d0, bt, end = row.split(",")
    if float(pmm) <= 0:
        continue  # data entry error (test 114)
    if float(co2) > 0 or float(he) > 0:
        continue  # suppressant tests: the predictor has no diluent dimension; their effect is in key_findings (LOI with CO2)
    loi = FLEX_LOI[fu]
    x = float(o2)
    oc = "sustained" if x > loi + 0.005 else ("marginal" if x >= loi - 0.005 else "extinguished")
    endname = {"C": "Completion", "D": "Disruption", "E": "Extinction"}[end]
    pt("PSI-69", n, "methanol droplet" if fu == "M" else "n-heptane droplet", "liquid_droplet", x, round(float(pmm) * MMHG, 2), 0.0, "N2", oc, None,
       prov("publication", "PSI-69", f"conditions: {FLEX_FILE} row FLEX Test # {n} ({ident}); outcome: published LOI", FLEX_LOI_QUOTE, "manual",
            url="https://doi.org/10.1007/s12217-014-9372-2", verified=False,
            note=f"Conditions from the PSI-69 experimental table. Outcome = position relative to the published LOI ({loi}): above = sustained (quasi-steady burning possible), within 0.005 = marginal, below = extinguished. "
                 f"Observed in this test: burn time {bt or 'n/a'} s, test end {endname}, initial diameter {d0 or 'n/a'} mm. Droplet flames self-extinguishing before burnout is normal droplet physics. "
                 "LOI was reported for O2/N2 without a pressure dependence; tests at about 0.7 atm use the same value (verify). Flow 0 = quiescent chamber (assumed)."))

BASS_FILE = "PSI-25_Experimental table_BASS-II.csv"
for row in open(os.path.join(EX, "bass2_tests.txt")).read().strip().split(";"):
    tid, mat, o2i, o2f, ign, ext, air = row.split("|")
    m = mat.lower()
    if "candle" in m:
        continue
    if "sibal" in m:
        mc, name = "thin_fabric", "SIBAL cotton-fiberglass fabric"
    elif "nomex" in m:
        mc, name = "thin_fabric", "Nomex III fabric"
    elif "micron" in m or "film" in m or re.search(r"0\.\d mm", m):
        mc, name = "thin_solid", "PMMA film"
    else:
        mc, name = "thick_solid", "PMMA (slab, rod or spherical section)"
    oc = "no_ignition" if ign == "N" else "sustained"  # burned at the initial O2 and flow; extinction (if any) happened later at a changed flow
    flow = float(air) if air and float(air) > 0 else None
    pt("PSI-25", tid, f"{name} ({mat.strip()})", mc, round(float(o2i) / 100, 4), 101.3, flow, "N2", oc, None,
       prov("experimental_table", "PSI-25", f"row Test # {tid}", f"Test # {tid}; Fuel Sample Material: {mat.strip()}; Calibrated initial O2 % by vol: {o2i}", "manual", file=BASS_FILE, verified=False,
            note="O2 = 'Calibrated initial O2 % by vol'. Outcome at the INITIAL flow: 'no ign' = no_ignition, otherwise sustained. " + ("The flame was later extinguished during a flow sweep (quenching or blowoff at a changed flow, see fan/air columns). " if ext == "X" else "") +
                 "flow = first number in 'Air display' = air velocity transducer reading in cm/s (BASS-II Summary Report NASA/TM-20210011385, pdf p. 12). "
                 "pressure about 1 atm per the same report ('Ambient pressure was 1 atm.', pdf p. 102; 99.2 to 99.5 kPa, pdf p. 46). Outcome parsing still needs a human check."))

SF1 = "PSI-98_Experimental table_SAFFIRE-1.csv"
SF2 = "PSI-99_Experimental table_SAFFIRE-2.csv"
PNOTE = "pressure 101.3 kPa ASSUMED (Cygnus cabin nominal; table has no pressure column, sensors measured it, see Saffire documents)."
pt("PSI-98", "S1", "SIBAL fabric, 0.37 cm, concurrent flow", "thin_fabric", 0.216, 101.3, 20, "N2", "sustained", None,
   prov("experimental_table", "PSI-98", "row S1", "S1,SIBAL Fabric,0.37,40.6,94,20,21.5 - 21.7,182,8,420,Concurrent", "manual", file=SF1, verified=False, note="burned 420 s. " + PNOTE))
pt("PSI-98", "S2", "SIBAL fabric, 0.37 cm, opposed flow", "thin_fabric", 0.215, 101.3, 20, "N2", "sustained", None,
   prov("experimental_table", "PSI-98", "row S2", "S2,SIBAL Fabric,0.37,40.6,94,20,~ 21.5,182,8,70,Opposed", "manual", file=SF1, verified=False, note="burned 70 s; whether the flame consumed the full sample is not stated in the table. " + PNOTE))
for tid, mat, mc, o2, oc, spread, q in [
    ("2-1", "silicone 0.27 mm", "thin_solid", 0.215, "extinguished", None, "2-1,Silicone,0.27 mm,29 cm,5 cm,20 cm/s,~ 21.5,80 W,9.2 s,Insignificant,Concurrent"),
    ("2-2", "silicone 0.61 mm", "thick_solid", 0.221, "extinguished", None, "2-2,Silicone,0.61 mm,29 cm,5 cm,20 cm/s,~ 22.1,80 W,9.2 s,Insignificant,Concurrent"),
    ("2-3", "silicone 1.03 mm", "thick_solid", 0.221, "extinguished", None, "2-3,Silicone,1.03 mm,29 cm,5 cm,20 cm/s,~ 22.1,80 W,9.2 s,Insignificant,Concurrent"),
    ("2-4", "silicone 0.37 mm, opposed flow", "thin_solid", 0.221, "extinguished", None, "2-4,Silicone,037 mm,29 cm,5 cm,20 cm/s,~ 22.1,80 W,9.2 s,Insignificant,Opposed"),
    ("2-5", "SIBAL 0.37 mm", "thin_fabric", 0.221, "sustained", 2.1, "2-5,Cotton-Fiberglass (SIBAL),037 mm,29 cm,5 cm,20 cm/s,~ 22.1,80 W,9.2 s,145 s,Concurrent,29 cm,2.1 mm/s"),
    ("2-6", "SIBAL 0.37 mm", "thin_fabric", 0.221, "sustained", 2.6, "2-6,,037 mm,29 cm,5 cm,20 cm/s,~ 22.1,80 W,9.2 s,115 s,Concurrent,29 cm,2.6 mm/s"),
    ("2-7a", "PMMA 0.85 mm (PMMA+Nomex sample)", "thick_solid", 0.221, "sustained", None, "2-7,PMMA & Nomex,0.85 and 0.37 mm,5 and 24 cm,5 cm,20 cm/s,~ 22.1,80 W,9.2 s,140 s,Concurrent"),
    ("2-7b", "Nomex 0.37 mm (PMMA+Nomex sample)", "thin_fabric", 0.221, "no_ignition", None, "Note 2 The PMMA portion was completely consumed but the Nomex was not ignited."),
    ("2-8", "PMMA thick (see Fig. 5)", "thick_solid", 0.2205, "sustained", None, "2-8,PMMA,See Fig. 5,29 cm,5 cm,20 cm/s,22.1 to 22.0,97 W,30 s,600 s,Concurrent"),
    ("2-9", "PMMA 1 cm", "thick_solid", 0.2195, "sustained", None, "2-9,,1 cm,29 cm,5 cm,20 cm/s,22.0 to 21.9,97 W,30 s,900 s,Concurrent"),
]:
    pt("PSI-99", tid, mat, mc, o2, 101.3, 20, "N2", oc, spread,
       prov("experimental_table", "PSI-99", f"row {tid[:3]}", q, "manual", file=SF2, verified=False,
            note="'Insignificant' burn time mapped to extinguished (ignited by 80 W igniter, no sustained burning). O2 per Note 1 (derived from CO2 production). " + PNOTE))

# ---------------------------------------------------------------- habitats
CH = "https://www.spaceappschallenge.org/ (challenge statement, saved in docs/challenge.md)"


def hab(id_, name, o2, p, g, assumption, st, quote, note=None, url=None, i="PSI-20", flow=None):
    return {"id": id_, "name": name, "o2_mole_fraction": o2, "pressure_kpa": p, "flow_cm_s": flow, "gravity_g": g, "is_assumption": assumption,
            "prov": prov(st, i, None, quote, "manual", url=url, note=note, verified=False)}


HABITATS = [
    hab("earth", "Earth sea level", 0.21, 101.3, 1.0, False, "challenge_text", "the Earth’s pressure at sea level is 14.7 psi", url=CH),
    hab("iss", "International Space Station", 0.21, 101.3, 0.0, False, "publication",
        "mimicked Earth sea-level conditions (21% oxygen/78% nitrogen/1% trace gases)",
        url="https://ntrs.nasa.gov/api/citations/20240005117/downloads/ICES-2024-128-Final%20Manuscript-No%20Tracked%20Changes.pdf",
        note="NASA ICES-2024-128 (NTRS 20240005117): ECLSS in vehicles kept at 14.7 psia (101.35 kPa) sea-level conditions. Also listed as a NASA-considered atmosphere in the ACME BRE (PSI-20) objective."),
    hab("orion", "Orion / Artemis crew vehicle", 0.21, 101.3, 0.0, True, "publication",
        "mixed atmosphere at either sea level (101.3 kPa or 14.69 psi) or reduced (55.2 to 70.3 kPa or 8.01 to 10.20 psi) pressure.",
        url="https://en.wikipedia.org/wiki/Orion_(spacecraft)",
        note="SECONDARY SOURCE ONLY (Wikipedia, citation not checked). Sea-level option used; no primary NASA source found yet. Keep marked as scenario in the UI."),
    hab("moon_base", "Moon base (planned)", 0.30, round(10.2 * PSI, 1), 0.166, False, "challenge_text",
        "The intermediate oxygen concentration used on the Moon will likely be 30% or greater, with a corresponding pressure of 10.2 psi or less.", url=CH),
    hab("pressurized_rover", "Pressurized lunar rover", 0.30, round(10.2 * PSI, 1), 0.166, False, "challenge_text",
        "it is expected that the Moon Base and pressurized rover(s) will be at a pressure and oxygen concentration between those in a spacesuit and the Earth’s atmosphere.", url=CH),
    hab("mars_habitat", "Mars habitat (scenario)", 0.30, round(10.2 * PSI, 1), 0.38, True, "challenge_text", None, url=CH, note="Scenario: no Mars habitat spec; reuses the lunar intermediate atmosphere."),
    hab("spacesuit", "Spacesuit", 1.00, round(4.3 * PSI, 1), 0.166, False, "challenge_text", "spacesuits are filled with 100% oxygen to only 4.3 psi", url=CH),
    hab("exploration_10_2", "NASA exploration atmosphere 10.2 psia / 26.5% O2", 0.265, round(10.2 * PSI, 1), 0.166, False, "psi_api", BRE_ATM, url=page("PSI-20"),
        note="From the ACME BRE (PSI-20) objective. The Space Shuttle used 10.2 psia / 26.5% O2 before EVAs (Wessel et al. 2018, Aerosp. Med. Hum. Perform. 89(9))."),
    hab("exploration_8_2", "NASA exploration atmosphere 8.2 psia / 34% O2", 0.34, round(8.2 * PSI, 1), 0.166, False, "psi_api", BRE_ATM, url=page("PSI-20"),
        note="From the ACME BRE (PSI-20) objective. Also the proposed exploration atmosphere in NASA-STD-3001 technical brief OCHMO-TB-037 (DCS risk mitigation)."),
]
for h in HABITATS:
    if h["prov"]["source_type"] == "challenge_text":
        h["prov"]["source_ref"] = {"url": CH}
    if not h["prov"].get("quote"):
        h["prov"]["note"] = (h["prov"].get("note") or "") + " (no verbatim quote)"


# ---------------------------------------------------------------- verification + meta
def walk(obj, path, rows, pid):
    if isinstance(obj, dict):
        if "prov" in obj and "value" in obj:
            p = obj["prov"]
            if not p.get("verified"):
                rows.append([pid, path, json.dumps(obj["value"], ensure_ascii=False), p.get("quote", ""), p["source_ref"].get("url", ""),
                             p["source_ref"].get("file", ""), p["source_ref"].get("locator", ""), p["method"], p.get("note", ""), "todo", "", ""])
            return 1, (1 if p.get("verified") else 0)
        t = v = 0
        for k, x in obj.items():
            if k == "prov":
                continue
            a, b = walk(x, f"{path}.{k}" if path else k, rows, pid)
            t += a; v += b
        return t, v
    if isinstance(obj, list):
        t = v = 0
        for n, x in enumerate(obj):
            a, b = walk(x, f"{path}[{n}]", rows, pid)
            t += a; v += b
        return t, v
    return 0, 0


def main():
    os.makedirs(CUR, exist_ok=True)
    for r in INV:
        r["key_findings"].extend(EXTRA.get(r["psi_id"], []))
    # Full publication lists, copied verbatim from the PSI records (publications[]), when the snapshot file is present.
    pub_file = os.path.join(EX, "psi_publications.json")
    if os.path.exists(pub_file):
        full = json.load(open(pub_file, encoding="utf-8"))["publications"]
        for r in INV:
            lst = full.get(r["psi_id"])
            if isinstance(lst, list):
                r["publications"] = [{"title": (x.get("t") or "").strip(), "authors": (x.get("a") or "").strip(),
                                      "doi": (x.get("doi") or "").strip() or None} for x in lst if (x.get("t") or "").strip()]
        print("publications: full lists loaded from", pub_file)
    else:
        print("publications: partial lists (data/extracts/psi_publications.json not found)")
    rows = []
    tot = ver = 0
    for r in INV:
        a, b = walk(r, "", rows, r["psi_id"])
        tot += a; ver += b
    pts_unver = 0
    for p in POINTS:
        if not p["prov"]["verified"]:
            pts_unver += 1
            rows.append([p["psi_id"], f"flammability_points[{p['id']}]", json.dumps({k: p[k] for k in ("material", "o2_mole_fraction", "pressure_kpa", "flow_cm_s", "outcome")}),
                         p["prov"].get("quote", ""), p["prov"]["source_ref"]["url"], p["prov"]["source_ref"].get("file", ""), p["prov"]["source_ref"].get("locator", ""),
                         p["prov"]["method"], p["prov"].get("note", ""), "todo", "", ""])
    for h in HABITATS:
        rows.append(["habitat", f"habitats[{h['id']}]", json.dumps({"o2": h["o2_mole_fraction"], "p_kpa": h["pressure_kpa"]}), h["prov"].get("quote", ""),
                     h["prov"]["source_ref"]["url"], "", "", "manual", h["prov"].get("note", ""), "todo", "", ""])
    tier_order = {r["psi_id"]: r["tier"]["value"] for r in INV}

    def priority(r):
        pid, path, value = r[0], r[1], r[2]
        if value == "null":
            return "P4"  # "not reported": only confirm nothing was missed
        if path.startswith("flammability_points[PSI-69"):
            return "P3"  # rule-derived from the published LOI: check the rule once, not every row
        if "key_findings" in path or pid == "habitat" or path.startswith("flammability_points"):
            return "P1"  # shown in the demo or used by the predictor
        if path in ("tier", "safety_domains"):
            return "P2"
        return "P3" if tier_order.get(pid, 9) > 1 else "P2"

    rows = [[priority(r)] + r for r in rows]
    rows.sort(key=lambda x: (x[0], tier_order.get(x[1], 9), x[1], x[2]))

    def dump(name, obj):
        with open(os.path.join(CUR, name), "w", encoding="utf-8") as fh:
            json.dump(obj, fh, ensure_ascii=False, indent=2)

    dump("investigations.json", INV)
    dump("excluded.json", EXCLUDED)
    dump("flammability_points.json", POINTS)
    dump("habitats.json", HABITATS)
    import hashlib
    h = hashlib.sha256()
    for fn in ("flex_tests.txt", "bass2_tests.txt"):
        h.update(open(os.path.join(EX, fn), "rb").read())
    h.update(json.dumps(INV, sort_keys=True).encode())
    dump("meta.json", {"fetched_at": SNAPSHOT_DATE, "psi_snapshot_hash": "sha256:" + h.hexdigest(),
                       "psi_search": "https://psi.nasa.gov/geode-py/ws/repo/search?term=combustion&source=psi&type=investigation (26 hits, 2 excluded)",
                       "n_investigations": len(INV), "n_fields_total": tot, "n_fields_verified": ver,
                       "n_flammability_points": len(POINTS), "n_points_unverified": pts_unver,
                       "note": "n_fields_verified counts api_direct fields (copied or computed from PSI) as verified; all llm_extracted and manual fields await human review in data/verification.csv"})
    with open(os.path.join(ROOT, "data", "verification.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["priority", "psi_id", "field_path", "value", "quote", "source_url", "file", "locator", "method", "note", "status", "verifier", "comment"])
        w.writerows(rows)
    print(f"investigations={len(INV)} fields={tot} verified={ver} points={len(POINTS)} verification_rows={len(rows)}")


if __name__ == "__main__":
    main()
