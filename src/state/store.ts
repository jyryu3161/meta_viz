import { create } from 'zustand'
import type { ParsedDataset } from '../io/types'
import { buildEcData, buildPathwaySectors } from '../brenda/ecMap'
import type { BrendaIndex } from '../brenda/registry'
import type { EcDatum, PathwaySector } from '../brenda/types'

function quantileAbs(values: number[], q: number): number {
  const xs = values.map((v) => Math.abs(v)).sort((a, b) => a - b)
  if (xs.length === 0) return 1
  if (xs.length === 1) return xs[0]
  // linear-interpolated quantile (type-7), so the clip limit isn't biased low for small n
  const pos = q * (xs.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return lo === hi ? xs[lo] : xs[lo] + (pos - lo) * (xs[hi] - xs[lo])
}

interface Derived {
  ecData: Map<string, EcDatum>
  sectors: PathwaySector[]
  limFc: number // 95th-pct |log2FC| over enzymes — detail map + panel scale
  limZ: number // 95th-pct |enrichment Z| over pathways — overview scale
}

const EMPTY: Derived = { ecData: new Map(), sectors: [], limFc: 1, limZ: 2 }

function derive(ds: ParsedDataset | null, index: BrendaIndex | null): Derived {
  if (!ds || !index) return EMPTY
  const ecData = buildEcData(ds.rows, index.bigg2ec)
  const sectors = buildPathwaySectors(index.pathways, ecData)
  const limFc = Math.max(1, quantileAbs([...ecData.values()].map((d) => d.log2fc), 0.95))
  const limZ = Math.max(2, quantileAbs(sectors.map((s) => s.enrichZ), 0.95))
  return { ecData, sectors, limFc, limZ }
}

export type View = 'overview' | 'detail'

interface AppState {
  index: BrendaIndex | null
  indexError: string | null
  dataset: ParsedDataset | null
  sampleId: string | null
  ecData: Map<string, EcDatum>
  sectors: PathwaySector[]
  limFc: number
  limZ: number
  alpha: number // significance threshold — a pure render parameter (opacity / panel stars)
  view: View
  selectedPathway: string | null

  setIndex(index: BrendaIndex): void
  setIndexError(msg: string): void
  loadDataset(ds: ParsedDataset): void
  setAlpha(alpha: number): void
  selectPathway(name: string): void
  back(): void
  setSampleId(id: string | null): void
}

export const useStore = create<AppState>((set, get) => ({
  index: null,
  indexError: null,
  dataset: null,
  sampleId: null,
  ecData: new Map(),
  sectors: [],
  limFc: 1,
  limZ: 2,
  alpha: 0.05,
  view: 'overview',
  selectedPathway: null,

  setIndex(index) {
    set({ index, ...derive(get().dataset, index) })
  },

  setIndexError(msg) {
    set({ indexError: msg })
  },

  loadDataset(ds) {
    set({ dataset: ds, view: 'overview', selectedPathway: null, ...derive(ds, get().index) })
  },

  // alpha only affects rendering (tile opacity, panel significance stars) — no recompute
  setAlpha(alpha) {
    set({ alpha })
  },

  selectPathway(name) {
    set({ selectedPathway: name, view: 'detail' })
  },

  back() {
    set({ view: 'overview' })
  },

  setSampleId(id) {
    set({ sampleId: id })
  },
}))
