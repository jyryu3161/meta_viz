import { describe, expect, it } from 'vitest'
import { meanLog2fcMethod } from './meanLog2fc'
import type { ReactionDatum } from '../io/types'

const r = (reactionId: string, log2fc: number, pValue: number): ReactionDatum => ({
  reactionId,
  log2fc,
  pValue,
})

describe('meanLog2fc enrichment', () => {
  it('scores an all-up, highly-significant sector positive, vivid, significant', () => {
    const s = meanLog2fcMethod.scoreSector(
      [r('a', 2.0, 1e-6), r('b', 2.4, 1e-5), r('c', 1.8, 1e-4)],
      0.05,
    )
    expect(s.score).toBeGreaterThan(1.5)
    expect(s.agreement).toBe(1) // all same direction
    expect(s.significance).toBe(1) // all p < 0.05
    expect(s.nUp).toBe(3)
    expect(s.nDown).toBe(0)
  })

  it('scores an all-down sector negative', () => {
    const s = meanLog2fcMethod.scoreSector([r('a', -2.5, 1e-6), r('b', -3.0, 1e-7)], 0.05)
    expect(s.score).toBeLessThan(-2)
    expect(s.agreement).toBe(1)
    expect(s.nDown).toBe(2)
  })

  it('mixed-direction sector -> near-zero score and low agreement', () => {
    const s = meanLog2fcMethod.scoreSector(
      [r('a', 2.0, 1e-6), r('b', -2.0, 1e-6), r('c', 2.1, 1e-6), r('d', -2.1, 1e-6)],
      0.05,
    )
    expect(Math.abs(s.score)).toBeLessThan(0.5)
    expect(s.agreement).toBeLessThanOrEqual(0.6) // no clear consensus
    expect(s.significance).toBe(1)
  })

  it('weights confident reactions more (low p dominates the sign)', () => {
    // one very confident +2 vs one weak -2 -> should lean positive
    const s = meanLog2fcMethod.scoreSector([r('a', 2.0, 1e-8), r('b', -2.0, 0.4)], 0.05)
    expect(s.score).toBeGreaterThan(0)
  })

  it('non-significant sector has low significance fraction', () => {
    const s = meanLog2fcMethod.scoreSector([r('a', 0.3, 0.6), r('b', -0.2, 0.7)], 0.05)
    expect(s.significance).toBe(0)
  })

  it('empty sector is all zeros', () => {
    const s = meanLog2fcMethod.scoreSector([], 0.05)
    expect(s).toMatchObject({ score: 0, significance: 0, agreement: 0, nReactions: 0 })
  })

  it('perfectly balanced set -> exactly zero score and zero agreement (no direction)', () => {
    const s = meanLog2fcMethod.scoreSector([r('a', 1.0, 1e-6), r('b', -1.0, 1e-6)], 0.05)
    expect(s.score).toBe(0)
    expect(s.agreement).toBe(0)
  })
})
