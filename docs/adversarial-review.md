# Adversarial review — outcome

A multi-agent adversarial review covered every feature across 6 dimensions
(scientific/data correctness, BRENDA SVG rendering, React/state, data pipeline,
input parsing, code quality). Each of the 40 raised findings was then handed to an
independent skeptic that tried to **refute** it against the actual source.

Verdicts: **23 confirmed, 8 partial, 9 refuted.**

## Fixed

| area | finding | fix |
|---|---|---|
| rendering | flux colors never visually applied — BRENDA's inline `style="fill:"` overrode the `fill` attribute | write `element.style.fill` (already done earlier); review re-confirmed |
| rendering | SVG re-fetched + zoom reset on every α change (effect dep was the `ecData` Map) | split `BrendaMapView` into fetch-effect (`[file]`) + recolor-effect (`[ecData,lim]`); verified 0 extra fetches + viewBox preserved on α change |
| rendering | hover listeners re-added per pathway; per-node listeners | one **delegated** hover listener for the component lifetime, reads current data via ref |
| rendering | loose EC regex `/ecno=([0-9.\-]+)/` accepted malformed ECs | strict `/ecno=([0-9]+\.[0-9]+\.[0-9]+\.[0-9-]+)/` + Set dedup |
| rendering | viewBox could be unset if all fits failed; highlight could touch a missing rect | last-resort `viewBox` default; guard `!rect` |
| parsing | `p_value > 1` rows silently **dropped** | clamp into (0,1] and keep the row (+ test) |
| parsing | bare `p` alias collides with unrelated columns | removed `p` (kept `pvalue`/`padj`/`q`/…) |
| state | open pathway orphaned when α change drops it from sectors | `setAlpha` falls back to overview if the selection disappears |
| overview | array-index React key on category `<g>` | stable `cat-${category}` key |
| overview | empty state was generic | shows reaction count, namespace, index status, likely cause |
| data build | `derive_category` sent glycolysis/gluconeogenesis/pentose to "Other" | added a CENTRAL keyword set → "Central / energy metabolism" |
| data build | silent tolerance of 0-byte SVG downloads | size check + 3× retry; enzyme-less pathways dropped from the index |
| tests | probes checked an attribute, not the rendered color (false confidence) | assert the **computed** fill is an actual diverging color (`data-flux` + getComputedStyle) |
| science (clarity) | EC `pValue = min`, `Math.sign(0)` agreement | documented intent + added a balanced-set test |

## Also fixed (initially deferred as low-value, then completed)

| finding | fix |
|---|---|
| redundant `R_X`/`X` dual keys in bigg2ec | strip `R_` in the build → keys halved (4990 → 2495, 133 KB → 64 KB), no coverage loss |
| `quantileAbs` floored the percentile | linear-interpolated (type-7) quantile so the clip limit isn't biased low for small n |
| numeric BiGG id mis-voted as Rhea | tightened Rhea pattern to 5–7 digits; also documented that detection is informational only |
| `innerHTML` of the BRENDA SVG | strip any `<script>` / `on*` handlers after injection (defense-in-depth; the SVGs are our own static files) |
| non-unique clipPath ids | `useId()`-prefixed ids in `PathwayTreemap` |
| missing-columns parse default | report `detectedNamespace: 'unknown'` instead of `bigg.reaction` |

## Genuinely not actioned (no real defect)

- `science-3` (validate bigg2ec key format at load): the lookup already degrades gracefully — a malformed/empty index yields the diagnostic empty state.
- `react-state-4` (rename `pValue` → `minPValue`): documented intent in a comment instead of churning the type + display.

## Verification after fixes

`tsc` ✓ · 16 unit tests ✓ · build ✓ · money-path E2E ✓ (8 real-colored enzymes) ·
visual QA across 4 samples ✓ (0 page errors) · α-change-in-detail: 0 re-fetch, zoom preserved.
