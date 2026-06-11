import type { ReactionDatum } from '../io/types'
import { EMPTY_STAT, negLog10P, type EnrichmentMethod, type SectorStat } from './base'

/**
 * Default enrichment: significance-weighted mean signed log2FC.
 * Each reaction is weighted by -log10(p) so confident changes dominate the
 * sector color. We also report `agreement` (sign consensus) so mixed pathways
 * can be desaturated, and `significance` (fraction with p<alpha) for opacity.
 */
function scoreSector(reactions: ReactionDatum[], alpha: number): SectorStat {
  const n = reactions.length
  if (n === 0) return { ...EMPTY_STAT }

  let wSum = 0
  let wLfc = 0
  let nlSum = 0
  let nSig = 0
  let nUp = 0
  let nDown = 0

  for (const r of reactions) {
    const nl = negLog10P(r.pValue)
    const w = Math.max(nl, 1e-6)
    wSum += w
    wLfc += w * r.log2fc
    nlSum += nl
    if (r.pValue < alpha) nSig++
    if (r.log2fc > 0) nUp++
    else if (r.log2fc < 0) nDown++
  }

  const score = wSum > 0 ? wLfc / wSum : 0
  const sign = Math.sign(score) // 0 when the score is exactly 0 (a perfectly balanced set)

  let agree = 0
  let considered = 0
  for (const r of reactions) {
    if (r.log2fc === 0) continue
    considered++
    // When sign === 0 no non-zero reaction matches, so agreement → 0. That is intended:
    // a perfectly balanced (equal up/down) set has no direction and renders fully desaturated.
    if (Math.sign(r.log2fc) === sign) agree++
  }

  return {
    score,
    significance: nSig / n,
    agreement: considered > 0 ? agree / considered : 0,
    nReactions: n,
    meanNegLog10P: nlSum / n,
    nUp,
    nDown,
  }
}

export const meanLog2fcMethod: EnrichmentMethod = {
  id: 'mean-log2fc',
  label: 'Significance-weighted mean log2FC',
  scoreSector,
}
