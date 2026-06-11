#!/usr/bin/env python3
"""Generate demo two-condition differential datasets for meta_viz.

Outputs CSVs (reaction_id, log2fc, p_value, subsystem, flux_cond1, flux_cond2) into
public/data/samples/ for several models and biological scenarios. Deterministic
(seeded) so the demos + tests are reproducible.

Scenarios:
  e_coli_core_aerobic_vs_anaerobic  glycolysis/fermentation up, respiration down
  e_coli_core_glucose_vs_acetate    gluconeogenic/glyoxylate up, glycolysis down
  e_coli_core_edge_cases            sign-flips, blocked, off-map ids, missing subsystem
  iJO1366_nutrient_shift            genome-scale shift (2583 rxns, 39 subsystems)
"""
import csv
import json
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "..", "public", "data", "samples")
MODELS = {
    "e_coli_core": os.path.join(HERE, "_e_coli_core.model.json"),
    "iJO1366": os.path.join(HERE, "_iJO1366.model.json"),
}


def load_reactions(model_id):
    model = json.load(open(MODELS[model_id]))
    return [(r["id"], r.get("subsystem") or "Unassigned") for r in model["reactions"]]


def reaction_row(rng, rxn_id, sub, mean, sig):
    """One reaction's differential, given a subsystem mean log2fc + significance."""
    lfc = mean + rng.gauss(0, 0.55)
    strength = sig * min(1.0, abs(lfc) / 2.0)
    p = 10 ** (-(0.2 + strength * 6.0)) * (0.5 + rng.random())
    p = min(0.99, max(1e-9, p))
    f1 = abs(rng.gauss(5, 3)) + 0.1
    f2 = f1 * (2 ** lfc)
    return {
        "reaction_id": rxn_id,
        "log2fc": round(lfc, 4),
        "p_value": float(f"{p:.3g}"),
        "subsystem": sub,
        "flux_cond1": round(f1, 4),
        "flux_cond2": round(f2, 4),
    }


def by_substring(table, default=(0.0, 0.1)):
    """Return a fn subsystem -> (mean, sig) by case-insensitive substring match."""
    items = list(table.items())

    def fn(sub):
        s = sub.lower()
        for key, val in items:
            if key.lower() in s:
                return val
        return default

    return fn


AEROBIC_ANAEROBIC = by_substring({
    "Glycolysis": (2.0, 0.95), "Pyruvate": (2.6, 0.95), "Citric Acid": (-2.4, 0.95),
    "Oxidative Phosphorylation": (-3.0, 0.97), "Pentose Phosphate": (0.6, 0.45),
    "Glutamate": (-0.4, 0.30), "Anaplerotic": (0.9, 0.55), "Transport": (0.3, 0.20),
    "Extracellular": (0.5, 0.25), "Inorganic": (0.0, 0.10), "Biomass": (-0.5, 0.40),
})

GLUCOSE_ACETATE = by_substring({
    "Glycolysis": (-1.9, 0.92), "Citric Acid": (1.7, 0.92), "Anaplerotic": (2.0, 0.92),
    "Pyruvate": (-0.9, 0.55), "Oxidative Phosphorylation": (0.9, 0.70),
    "Pentose Phosphate": (-0.6, 0.45), "Glutamate": (0.2, 0.20), "Transport": (-0.2, 0.20),
    "Extracellular": (0.3, 0.20), "Inorganic": (0.0, 0.10), "Biomass": (-0.3, 0.30),
})

IJO_NUTRIENT_SHIFT = by_substring({
    "Glycolysis": (1.8, 0.90), "Pentose Phosphate": (0.8, 0.50), "Pyruvate": (1.5, 0.85),
    "Fermentation": (2.2, 0.90), "Glyoxylate": (1.2, 0.70), "Anaplerotic": (1.0, 0.60),
    "Citric Acid": (-1.9, 0.90), "Oxidative Phosphorylation": (-2.4, 0.92),
    "Tricarboxylic": (-1.9, 0.90), "Electron Transport": (-1.6, 0.85),
    "Nucleotide": (-0.6, 0.40), "Amino Acid": (0.4, 0.30), "Membrane Lipid": (0.5, 0.35),
    "Cell Envelope": (-0.4, 0.30), "Transport": (0.3, 0.25), "Cofactor": (0.2, 0.20),
})


def write_csv(name, rows):
    os.makedirs(OUTDIR, exist_ok=True)
    path = os.path.join(OUTDIR, name)
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["reaction_id", "log2fc", "p_value", "subsystem", "flux_cond1", "flux_cond2"])
        w.writeheader()
        w.writerows(rows)
    print(f"  {name}: {len(rows)} reactions")


def scenario(model_id, trend_fn, seed):
    rng = random.Random(seed)
    return [reaction_row(rng, rid, sub, *trend_fn(sub)) for rid, sub in load_reactions(model_id)]


def edge_cases():
    """Hand-built robustness dataset on the e_coli_core base + synthetic rows."""
    rng = random.Random(7)
    rows = []
    base = load_reactions("e_coli_core")[:30]
    for i, (rid, sub) in enumerate(base):
        if i % 6 == 0:
            # missing subsystem -> should land in "Unassigned"
            sub_out = ""
        else:
            sub_out = sub
        if i % 7 == 0:
            # blocked in both conditions: ~0 flux, no signal
            rows.append({"reaction_id": rid, "log2fc": 0.0, "p_value": 0.98,
                         "subsystem": sub_out, "flux_cond1": 0.0, "flux_cond2": 0.0})
        elif i % 5 == 0:
            # reversible sign flip: same magnitude, opposite direction
            f = round(abs(rng.gauss(6, 2)) + 1, 3)
            rows.append({"reaction_id": rid, "log2fc": round(rng.gauss(0, 0.2), 4), "p_value": 0.002,
                         "subsystem": sub_out, "flux_cond1": f, "flux_cond2": -f})
        else:
            lfc = rng.choice([8.5, -8.5, 1.2, -1.4, 3.0])  # incl. extremes for color clipping
            rows.append({"reaction_id": rid, "log2fc": round(lfc + rng.gauss(0, 0.2), 4),
                         "p_value": float(f"{10 ** -(1 + 4 * rng.random()):.3g}"),
                         "subsystem": sub_out, "flux_cond1": 5.0, "flux_cond2": round(5 * 2 ** lfc, 3)})
    # off-map synthetic reactions (ids not present on any Escher map)
    for i in range(3):
        rows.append({"reaction_id": f"DEMO_OFFMAP_{i + 1}", "log2fc": round(rng.gauss(2, 1), 3),
                     "p_value": 0.01, "subsystem": "Synthetic pathway", "flux_cond1": 3.0, "flux_cond2": 9.0})
    return rows


def main():
    print("generating sample datasets:")
    write_csv("e_coli_core_aerobic_vs_anaerobic.csv", scenario("e_coli_core", AEROBIC_ANAEROBIC, 42))
    write_csv("e_coli_core_glucose_vs_acetate.csv", scenario("e_coli_core", GLUCOSE_ACETATE, 11))
    write_csv("e_coli_core_edge_cases.csv", edge_cases())
    write_csv("iJO1366_nutrient_shift.csv", scenario("iJO1366", IJO_NUTRIENT_SHIFT, 23))


if __name__ == "__main__":
    main()
