import type { ReactionDatum } from '../io/types'
import { meanLog2fcMethod } from '../enrichment/meanLog2fc'
import { normInv, twoSidedP } from '../enrichment/stats'
import type { EcDatum, PathwayDef, PathwaySector } from './types'

/** Strip the SBML `R_` prefix so a BiGG id matches the bigg2ec keys. */
function biggKey(id: string): string {
  return id.replace(/^R_/, '')
}

/**
 * Aggregate uploaded reaction flux to EC numbers (enzymes). A BiGG reaction may
 * map to several ECs; several reactions may share an EC. Reactions sharing an EC
 * are combined with the same significance-weighted scoring used for sectors.
 */
export function buildEcData(rows: ReactionDatum[], bigg2ec: Record<string, string[]>): Map<string, EcDatum> {
  const byEc = new Map<string, ReactionDatum[]>()
  for (const r of rows) {
    const ecs = bigg2ec[biggKey(r.reactionId)] ?? bigg2ec[r.reactionId]
    if (!ecs) continue
    for (const ec of ecs) {
      const arr = byEc.get(ec)
      if (arr) arr.push(r)
      else byEc.set(ec, [r])
    }
  }

  const out = new Map<string, EcDatum>()
  for (const [ec, rs] of byEc) {
    const stat = meanLog2fcMethod.scoreSector(rs, 0.05) // alpha unused: we only take the score
    out.set(ec, {
      ec,
      log2fc: stat.score,
      // most-significant contributing reaction's p — a conservative confidence for
      // this enzyme, used for the side-panel display and as the reporter p below.
      pValue: Math.min(...rs.map((r) => r.pValue)),
      nReactions: rs.length,
      reactions: rs.map((r) => r.reactionId),
    })
  }
  return out
}

const Z_CLAMP = 8

/** Signed reporter z for one enzyme: magnitude from the two-sided p, sign from log2FC. */
function reporterZ(d: EcDatum): number {
  const sign = d.log2fc > 0 ? 1 : d.log2fc < 0 ? -1 : 0
  const p = Math.min(0.999999, Math.max(1e-300, d.pValue))
  const z = normInv(1 - p / 2)
  return sign * Math.max(-Z_CLAMP, Math.min(Z_CLAMP, z))
}

/**
 * Directional pathway enrichment by Stouffer's method over reporter z-scores:
 * each matched enzyme's p-value becomes a z (signed by its log2FC direction), and
 * the pathway statistic is Z = Σ zᵢ / √k, which is ~N(0,1) under the null of no
 * coordinated change → a two-sided enrichment p-value. The tile color encodes Z,
 * so a pathway whose enzymes coordinately and significantly shift one way scores
 * strongly; mixed pathways cancel toward 0. Pathways with no matched EC are dropped.
 */
export function buildPathwaySectors(pathways: PathwayDef[], ecData: Map<string, EcDatum>): PathwaySector[] {
  const z = new Map<string, number>()
  for (const [ec, d] of ecData) z.set(ec, reporterZ(d))

  const sectors: PathwaySector[] = []
  for (const p of pathways) {
    const matched = p.ecs.filter((ec) => ecData.has(ec))
    if (matched.length === 0) continue
    const k = matched.length
    const sumZ = matched.reduce((acc, ec) => acc + (z.get(ec) ?? 0), 0)
    const enrichZ = sumZ / Math.sqrt(k)
    const meanLog2fc = matched.reduce((acc, ec) => acc + ecData.get(ec)!.log2fc, 0) / k
    sectors.push({
      name: p.name,
      category: p.category,
      file: p.file,
      matchedEcs: matched,
      totalEcs: p.ecs.length,
      enrichZ,
      enrichP: twoSidedP(enrichZ),
      meanLog2fc,
    })
  }
  return sectors.sort((a, b) => Math.abs(b.enrichZ) - Math.abs(a.enrichZ))
}
