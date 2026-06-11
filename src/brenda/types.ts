/** One BRENDA pathway map, from public/brenda/pathways.json. */
export interface PathwayDef {
  name: string
  file: string
  category: string
  ecs: string[]
  nBoxes: number
}

/** Flux aggregated to a single EC number (enzyme). */
export interface EcDatum {
  ec: string
  log2fc: number
  pValue: number
  nReactions: number
  reactions: string[]
}

/** A pathway scored against the uploaded flux (overview tile). */
export interface PathwaySector {
  name: string
  category: string
  file: string
  matchedEcs: string[]
  totalEcs: number
  /** signed directional enrichment z (Stouffer over reporter z-scores) — drives tile color */
  enrichZ: number
  /** enrichment p-value derived from enrichZ */
  enrichP: number
  /** descriptive mean log2FC of the matched enzymes (tooltip only) */
  meanLog2fc: number
}
