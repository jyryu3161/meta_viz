#!/usr/bin/env python3
"""Build the BRENDA pathway-map index for meta_viz.

Outputs (all static, shipped to the browser):
  public/brenda/maps/pw_*.svg   downloaded BRENDA pathway SVG maps (CC BY 4.0, BRENDA)
  public/brenda/pathways.json   [{name, file, category, ecs:[...], nBoxes}]
  public/brenda/bigg2ec.json    { biggReactionId: [EC,...] }, filtered to ECs present on BRENDA maps

Bridge: GEM BiGG reaction -> MNXR (reac_xref) -> kegg.reaction (reac_xref) -> EC (KEGG link).

Inputs:
  reac_xref.tsv                          MetaNetX MNXref (BiGG<->MNXR<->kegg.reaction)
  scripts/_brenda_build/kegg_rn_ec.tsv   KEGG reaction->EC  (rest.kegg.jp/link/ec/rn)
  scripts/_brenda_build/pathway_list.xml BRENDA pathway_search.php?pathway= response
"""
import json
import os
import re
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
BUILD = os.path.join(HERE, "_brenda_build")
MAPS = os.path.join(ROOT, "public", "brenda", "maps")
OUT = os.path.join(ROOT, "public", "brenda")
SVG_BASE = "https://www.brenda-enzymes.org/pathways/single_svgs/"

EC_LINK = re.compile(r"ecno=([0-9]+\.[0-9]+\.[0-9]+\.[0-9-]+)")


def svg_filename(name):
    return "pw_" + re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-") + ".svg"


CENTRAL = (
    "glycolysis", "gluconeogenesis", "pentose phosphate", "entner", "glyoxylate",
    "pyruvate", "citric acid", "tca", "cycle", "respiration", "oxidative",
    "electron transport", "carbon fixation", "photosynthesis",
)


def derive_category(name):
    n = name.lower()
    if "fermentation" in n:
        return "Fermentation"
    if "biosynthesis" in n or "anabolism" in n:
        return "Biosynthesis"
    if "degradation" in n or "catabolism" in n:
        return "Degradation"
    if any(k in n for k in CENTRAL):
        return "Central / energy metabolism"
    if "metabolism" in n:
        return "Metabolism"
    return "Other pathways"


def load_kegg_rn_ec():
    rn_ec = {}
    for line in open(os.path.join(BUILD, "kegg_rn_ec.tsv")):
        parts = line.strip().split("\t")
        if len(parts) != 2:
            continue
        rn = parts[0].split(":", 1)[1]
        ec = parts[1].split(":", 1)[1]
        rn_ec.setdefault(rn, set()).add(ec)
    return rn_ec


def load_reac_xref():
    """Return (bigg->set(MNXR), MNXR->set(kegg.reaction))."""
    bigg_mnxr, mnxr_kegg = {}, {}
    for line in open(os.path.join(ROOT, "reac_xref.tsv")):
        if line.startswith("#"):
            continue
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 2 or parts[1] == "EMPTY":
            continue
        src, mnxr = parts[0], parts[1]
        if src.startswith("bigg.reaction:"):
            bid = src.split(":", 1)[1]
            if bid.startswith("R_"):  # SBML artifact: R_PYK and PYK are the same reaction
                bid = bid[2:]
            bigg_mnxr.setdefault(bid, set()).add(mnxr)
        elif src.startswith("kegg.reaction:"):
            mnxr_kegg.setdefault(mnxr, set()).add(src.split(":", 1)[1])
    return bigg_mnxr, mnxr_kegg


def download_and_parse_pathways():
    names = re.findall(
        r'LSRow_Pathway">([^<]+)</div>',
        open(os.path.join(BUILD, "pathway_list.xml"), encoding="utf-8").read(),
    )
    os.makedirs(MAPS, exist_ok=True)
    pathways = []
    for i, name in enumerate(names):
        fn = svg_filename(name)
        path = os.path.join(MAPS, fn)
        # (re)download if absent or suspiciously small (failed/0-byte), with retries
        if not os.path.exists(path) or os.path.getsize(path) < 200:
            url = SVG_BASE + urllib.parse.quote(fn)
            data = b""
            for attempt in range(3):
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                    data = urllib.request.urlopen(req, timeout=45).read()
                    if len(data) >= 200:
                        break
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(0.4 * (attempt + 1))
            if len(data) < 200:
                print(f"  WARN download failed/empty, skipping: {fn}")
                continue
            open(path, "wb").write(data)
            time.sleep(0.05)
        svg = open(path, encoding="utf-8", errors="replace").read()
        ecs = sorted(set(EC_LINK.findall(svg)))
        if not ecs:
            continue  # no enzyme boxes → this pathway can never light up; drop it
        pathways.append({
            "name": name,
            "file": fn,
            "category": derive_category(name),
            "ecs": ecs,
            "nBoxes": svg.count("nodeEN"),
        })
        if i % 25 == 0:
            print(f"  {i}/{len(names)} {name} ({len(ecs)} ECs)")
    return pathways


def ensure_inputs():
    """Download the reference inputs (reac_xref, KEGG, BRENDA list) if missing."""
    os.makedirs(BUILD, exist_ok=True)

    # MetaNetX MNXref reac_xref (~77 MB) — gitignored, fetched on demand
    reac = os.path.join(ROOT, "reac_xref.tsv")
    if not os.path.exists(reac) or os.path.getsize(reac) < 1_000_000:
        print("fetching reac_xref.tsv (MetaNetX MNXref v4.5, ~77 MB) ...")
        req = urllib.request.Request("https://www.metanetx.org/ftp/4.5/reac_xref.tsv", headers={"User-Agent": "Mozilla/5.0"})
        open(reac, "wb").write(urllib.request.urlopen(req, timeout=600).read())

    targets = {
        "kegg_rn_ec.tsv": "https://rest.kegg.jp/link/ec/rn",
        "pathway_list.xml": "https://www.brenda-enzymes.org/pathways/php/pathway_search.php?pathway=",
    }
    for fn, url in targets.items():
        path = os.path.join(BUILD, fn)
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            print(f"fetching {fn} ...")
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            open(path, "wb").write(urllib.request.urlopen(req, timeout=60).read())


def main():
    ensure_inputs()
    print("loading KEGG reaction->EC ...")
    rn_ec = load_kegg_rn_ec()
    print("loading reac_xref (BiGG<->MNXR<->KEGG) ...")
    bigg_mnxr, mnxr_kegg = load_reac_xref()

    print("composing BiGG -> EC ...")
    bigg2ec = {}
    for bid, mnxrs in bigg_mnxr.items():
        ecs = set()
        for m in mnxrs:
            for rn in mnxr_kegg.get(m, ()):
                ecs |= rn_ec.get(rn, set())
        if ecs:
            bigg2ec[bid] = ecs

    print("downloading + parsing BRENDA pathway SVGs ...")
    pathways = download_and_parse_pathways()

    # filter BiGG->EC to ECs that actually appear on a BRENDA map (shrinks the asset)
    brenda_ecs = set()
    for p in pathways:
        brenda_ecs.update(p["ecs"])
    bigg2ec = {b: sorted(ecs & brenda_ecs) for b, ecs in bigg2ec.items()}
    bigg2ec = {b: v for b, v in bigg2ec.items() if v}

    os.makedirs(OUT, exist_ok=True)
    json.dump(pathways, open(os.path.join(OUT, "pathways.json"), "w"))
    json.dump(bigg2ec, open(os.path.join(OUT, "bigg2ec.json"), "w"))
    nz = sum(1 for p in pathways if p["ecs"])
    print(f"\npathways: {len(pathways)} ({nz} with ECs) | BRENDA EC universe: {len(brenda_ecs)}")
    print(f"bigg2ec: {len(bigg2ec)} BiGG ids -> ECs on BRENDA maps")


if __name__ == "__main__":
    main()
