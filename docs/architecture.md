# Architecture

Client-side static SPA (React + TypeScript + Vite) — no backend, deployable as
static files. The only "server" work is an **offline build step** that turns large
reference data (BRENDA SVGs, MetaNetX, KEGG) into compact static assets.

## Data flow

```
upload CSV (reaction_id [BiGG], log2fc, p_value)
   │  io/parse.ts        → validate, alias headers, detect namespace
   ▼
brenda/ecMap.buildEcData → BiGG → EC via bigg2ec.json; aggregate reactions per EC
   │
   ▼
brenda/ecMap.buildPathwaySectors → directional enrichment per BRENDA pathway
   │
   ├─► brenda/PathwayTreemap   category → pathway treemap, colored by enrichment Z
   │       (size = enzymes with flux, faded when enrichment p ≥ α)
   │
   └─ click pathway ─► brenda/BrendaMapView
                         fetch public/brenda/maps/pw_<name>.svg, reveal the detailed
                         enzyme layer, recolor nodeEN boxes by per-enzyme log2FC, d3-zoom
                      + brenda/PathwayPanel
                         per-EC log2FC / p / contributing reactions
```

## Enrichment (overview)

The overview is a real **directional enrichment**, not a raw aggregate. For each
matched enzyme, its p-value becomes a reporter z-score `zᵢ = sign(log2FC)·Φ⁻¹(1−p/2)`
(`src/enrichment/stats.ts`). Per pathway, **Stouffer's method** combines them:
`Z = Σzᵢ/√k`, which is ~N(0,1) under the null of no coordinated change, giving a
two-sided enrichment p-value. The tile **color** encodes `Z` (so a pathway whose
enzymes coordinately and significantly shift one way scores strongly; mixed pathways
cancel toward 0), and tiles fade when the enrichment isn't significant. The **detail**
map instead shows per-enzyme **log2FC** — a different quantity, hence a separate scale.

State lives in one Zustand store (`src/state/store.ts`): the loaded BRENDA index,
the dataset, the derived `ecData` (EC → aggregated flux) and pathway `sectors`, two
diverging scales — `limFc` (95th-pct |log2FC| over enzymes, for the detail map/panel)
and `limZ` (95th-pct |enrichment Z| over pathways, for the overview) — plus `alpha`,
the view, and the selected pathway. `derive()` recomputes ecData + sectors when the
dataset or index changes; `alpha` is a pure render parameter (tile opacity / panel
stars) and triggers no recompute.

## The BRENDA bridge

BRENDA enzyme boxes are keyed by **EC number**; the user's flux is keyed by **BiGG
reaction id**. `scripts/build_brenda_index.py` composes the bridge offline:

```
reac_xref.tsv:  bigg.reaction:X → MNXR…           (forward)
                MNXR…           → kegg.reaction:R  (reverse)
KEGG link:      rn:R            → ec:1.2.3.4
  ⇒  bigg2ec.json: { X: [EC,…] }   (filtered to ECs that appear on a BRENDA map)
```

It also downloads all 193 BRENDA pathway SVGs and parses each for its EC set
(`pathways.json`). Outputs land in `public/brenda/` (gitignored; rebuild with
`npm run data:brenda`).

## Rendering BRENDA SVGs (BrendaMapView)

- The SVG is BRENDA's own (CC BY 4.0); we inject it and **recolor only the enzyme
  (`nodeEN`) boxes** — no MetaboMAPS (GPL-3.0) code is reused, so the app stays
  permissively licensed.
- EC numbers are read from each box's `enzyme.php?ecno=` links.
- BRENDA hides the detailed enzyme layer (`g.all-enz-subst`, `display:none`) and
  shows a simplified `nodeSM` box until you zoom in. Our detail view is the
  zoomed-in reaction view, so we reveal that layer and drop the simplified node.
- BRENDA's declared canvas is huge (~25000×16000) with content in a small cluster,
  so we set the `viewBox` to the content bounding box (`getBBox`, computed after the
  detailed layer is revealed). Pan/zoom via d3-zoom.
- The whole pathway is faded to context, then enzymes with flux get a diverging
  fill (a thin slate outline) so both red (up) and blue (down) stand out.
- **Connected metabolites** of each flux enzyme are also emphasized: BRENDA links
  carry no node refs, so we infer connectivity geometrically — a node's
  `transform="translate(x,y)"` is its center, and a link's `d` endpoints sit at node
  edges, so a link with one endpoint near a flux enzyme has its other endpoint's
  nearest metabolite highlighted (and that link un-faded). Each active reaction then
  reads as a connected enzyme + substrates/products unit.
- Enzyme boxes with **no known EC** (BRENDA renders `?.?.?.?`) are relabeled `N/A`.

## Tests

- `npm test` — pure logic (parse, enrichment, EC mapping) via Vitest.
- `npm run test:e2e` — Playwright money path: load sample → pathway overview →
  glycolysis up → BRENDA map renders flux-colored enzymes → side panel populated.
- `npm run test:visual` — captures overview + drilled maps for each sample into
  `./temp_figures/`, asserting visible + flux-colored enzymes per scenario.
