import { describe, expect, it } from 'vitest'
import { buildEcData, buildPathwaySectors } from './ecMap'
import type { ReactionDatum } from '../io/types'
import type { PathwayDef } from './types'

const r = (reactionId: string, log2fc: number, pValue: number): ReactionDatum => ({ reactionId, log2fc, pValue })

describe('buildEcData', () => {
  const b2e = { PGI: ['5.3.1.9'], G6PI: ['5.3.1.9'], PFK: ['2.7.1.11'] }

  it('aggregates reactions sharing an EC and resolves R_ prefixes', () => {
    const ec = buildEcData([r('PGI', 2.0, 1e-6), r('G6PI', 2.4, 1e-5), r('R_PFK', -1.5, 1e-4)], b2e)
    expect(ec.size).toBe(2)
    const merged = ec.get('5.3.1.9')!
    expect(merged.nReactions).toBe(2)
    expect(merged.log2fc).toBeGreaterThan(1.5)
    expect(merged.reactions.sort()).toEqual(['G6PI', 'PGI'])
    expect(ec.get('2.7.1.11')!.log2fc).toBeLessThan(0) // matched R_PFK via prefix strip
  })

  it('ignores reactions with no EC mapping', () => {
    const ec = buildEcData([r('EX_glc_e', 1, 0.01)], b2e)
    expect(ec.size).toBe(0)
  })
})

describe('buildPathwaySectors (Stouffer enrichment)', () => {
  it('keeps only pathways with matched ECs; coordinated up enzymes -> positive, significant Z', () => {
    const ec = buildEcData([r('PGI', 2.0, 1e-6), r('PFK', 1.8, 1e-5)], { PGI: ['5.3.1.9'], PFK: ['2.7.1.11'] })
    const pathways: PathwayDef[] = [
      { name: 'glycolysis', file: 'pw_glycolysis.svg', category: 'Central / energy metabolism', ecs: ['5.3.1.9', '2.7.1.11', '9.9.9.9'], nBoxes: 3 },
      { name: 'unrelated', file: 'pw_unrelated.svg', category: 'Other pathways', ecs: ['1.1.1.1'], nBoxes: 1 },
    ]
    const sectors = buildPathwaySectors(pathways, ec)
    expect(sectors).toHaveLength(1)
    expect(sectors[0].name).toBe('glycolysis')
    expect(sectors[0].matchedEcs.sort()).toEqual(['2.7.1.11', '5.3.1.9'])
    expect(sectors[0].totalEcs).toBe(3)
    expect(sectors[0].enrichZ).toBeGreaterThan(0)
    expect(sectors[0].enrichP).toBeLessThan(0.05)
    expect(sectors[0].meanLog2fc).toBeGreaterThan(1.5)
  })

  it('a balanced (up + down) pathway cancels toward Z ~ 0 (not enriched)', () => {
    const ec = buildEcData([r('A', 2.0, 1e-6), r('B', -2.0, 1e-6)], { A: ['1.1.1.1'], B: ['2.2.2.2'] })
    const sectors = buildPathwaySectors(
      [{ name: 'mixed', file: 'x', category: 'Metabolism', ecs: ['1.1.1.1', '2.2.2.2'], nBoxes: 2 }],
      ec,
    )
    expect(Math.abs(sectors[0].enrichZ)).toBeLessThan(0.5)
  })
})
