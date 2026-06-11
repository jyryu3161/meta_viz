# meta_viz — BRENDA pathway-map review

The visualization now uses **real BRENDA pathway maps** (downloaded from
brenda-enzymes.org, CC BY 4.0) instead of Escher geometry. Flux is joined to the
maps' enzyme boxes by EC number: GEM BiGG reaction → MNXR (reac_xref) →
kegg.reaction → EC (KEGG) → BRENDA `nodeEN` box.

Figures captured by `scripts/visual_qa.mjs` against the live preview (Playwright,
deviceScaleFactor 2). All are in this folder.

## Scenarios reviewed

| figure prefix | sample | pathways lit | result |
|---|---|---|---|
| `core_aerobic_anaerobic__*` | E. coli core, aerobic→anaerobic | 36 | ✅ glycolysis ▲2.02, citric acid cycle/OxPhos blue |
| `core_glucose_acetate__*` | E. coli core, glucose→acetate | 36 | ✅ glycolysis ▼-2.0 (inverted), gluconeogenesis ▲ |
| `core_edge_cases__*` | E. coli core, edge cases | 25 | ✅ renders, no crash |
| `ijo_nutrient_shift__*` | iJO1366 genome-scale | 105 | ✅ 543/2583 reactions → EC, rich overview |

Each scenario captured the pathway-category overview plus the most-up and
most-down pathway maps. The harness asserts: pathways lit ≥ threshold, named
pathway sign (glycolysis up aerobic / down glucose-acetate), visible enzyme boxes
on the BRENDA map, ≥1 flux-colored enzyme, and ≥1 side-panel row. Final run:
**Visual QA PASSED**, 0 uncaught page errors.

## What the views show

- **Overview** (`*__overview.png`): a two-level treemap — BRENDA pathway category
  (Metabolism, Central/energy, Fermentation, Degradation, Biosynthesis, Other) →
  pathway, colored by significance-weighted mean log2FC of the pathway's enzymes,
  sized by number of enzymes with flux. Aerobic→anaerobic reads correctly:
  glycolysis & fermentation red (up), TCA / OxPhos / NAD blue (down).
- **Detail** (`*__<pathway>.png`): the real BRENDA SVG pathway map. Enzyme boxes
  with flux are filled by diverging color (red up / blue down); enzymes without
  flux are greyed; metabolites/substrates keep BRENDA's native styling. The side
  panel lists each matched EC with log2FC / p / contributing reaction count.

## Findings & fixes during review

1. **Map rendered tiny / only the title showed (FIXED).** BRENDA's declared SVG
   canvas is huge (~25000×16000) with content in a small cluster; fitting to
   width/height shrank it. → fit the `viewBox` to the content bounding box.
2. **Enzyme network invisible (FIXED, root cause).** The EC-bearing `nodeEN`
   boxes live inside `g.all-enz-subst` which BRENDA sets `display:none` (a
   simplified `nodeSM` box is shown until you zoom in). Our detail view *is* the
   zoomed-in reaction view → reveal `.all-enz-subst`/`.all-cofactors`, hide the
   simplified `nodeSM`. This also corrected the bounding-box fit (getBBox ignores
   hidden elements).
3. **Oversized watermark text overlapped the network (FIXED).** Hid BRENDA's
   ≥50px title/watermark text.
4. **Down-regulated enzymes blended with BRENDA's default blue (FIXED).** Greyed
   no-flux enzyme boxes so both red (up) and blue (down) flux colors stand out.
5. **Missing nodes / orphaned arrows in detail maps (FIXED).** I had hidden
   `g.node.nodeSM`, assuming they were simplified title boxes — but they are the
   pathway's *boundary metabolites* (e.g. gluconeogenesis: oxaloacetate, pyruvate,
   (S)-malate; glycolysis: glucose, pyruvate). Hiding them orphaned the arrows
   pointing to them. → stopped hiding `nodeSM`; the watermark is already removed by
   the ≥50px text rule.
6. **Overview pathway labels were hard-truncated mid-word (FIXED).** Long names
   like "glutamate and glutamine metabolism" were cut at the tile edge. → added
   greedy word-wrapping in `PathwayTreemap` (up to 3 lines sized to the tile,
   ellipsis only when there is genuinely no room).
7. **Flux colors were never actually applied (FIXED, important).** BRENDA's rects
   set their fill via an inline `style="fill:…"`, which overrides the `fill`
   *attribute* — so `setAttribute('fill', …)` did nothing and "colored" enzymes
   stayed BRENDA-blue (only the test probe, which read attributes, was fooled). →
   write `element.style.fill` / `.stroke` instead. The probe now tags flux enzymes
   with a `data-flux` attribute.
8. **Key enzymes weren't emphasized (FIXED).** Per request, the whole pathway is
   now faded to context (links, metabolites, non-flux enzymes greyed at ~0.5
   opacity) and only the enzymes with flux are highlighted — clean diverging fill,
   full opacity, bold dark outline. A single flux enzyme (e.g. carnitine 4.2.1.149)
   now stands out clearly.
9. **New academic color palette (DONE).** Replaced d3 RdBu with a clean 5-stop
   coolwarm diverging ramp (deep blue → off-white → deep red) in `overview/color.ts`,
   used consistently across the overview, maps, panel, and legend.

## Verdict

The platform now visualizes differential flux on authentic BRENDA pathway maps,
across central-metabolism (E. coli core) and genome-scale (iJO1366) datasets, with
a working category overview and EC-level side panel. No outstanding defects.
