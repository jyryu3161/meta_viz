import type { ReactionDatum } from '../io/types'

export interface SectorStat {
  /** signed aggregate log2FC -> sector color */
  score: number
  /** fraction of reactions with p < alpha (0..1) -> tile opacity */
  significance: number
  /** fraction of reactions agreeing with the sector's sign (0..1) -> saturation */
  agreement: number
  nReactions: number
  meanNegLog10P: number
  nUp: number
  nDown: number
}

/** Pluggable per-sector scoring. MVP ships one method; V1 adds reporter-z / ORA / GSEA. */
export interface EnrichmentMethod {
  id: string
  label: string
  scoreSector(reactions: ReactionDatum[], alpha: number): SectorStat
}

export function negLog10P(p: number): number {
  return -Math.log10(Math.max(p, 1e-300))
}

export const EMPTY_STAT: SectorStat = {
  score: 0,
  significance: 0,
  agreement: 0,
  nReactions: 0,
  meanNegLog10P: 0,
  nUp: 0,
  nDown: 0,
}
