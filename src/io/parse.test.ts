import { describe, expect, it } from 'vitest'
import { parseDataset } from './parse'

describe('parseDataset', () => {
  it('parses a well-formed CSV with header aliases', () => {
    const csv = [
      'reaction_id,log2FoldChange,padj,subsystem',
      'PYK,2.1,1e-6,Glycolysis/Gluconeogenesis',
      'SUCDi,-1.8,0.002,Citric Acid Cycle',
    ].join('\n')
    const ds = parseDataset(csv)
    expect(ds.rows).toHaveLength(2)
    expect(ds.errors).toHaveLength(0)
    expect(ds.hasSubsystem).toBe(true)
    expect(ds.rows[0]).toMatchObject({ reactionId: 'PYK', log2fc: 2.1, subsystem: 'Glycolysis/Gluconeogenesis' })
    expect(ds.detectedNamespace).toBe('bigg.reaction')
  })

  it('auto-detects a TSV delimiter and optional flux columns', () => {
    const tsv = 'rxn\tlfc\tpvalue\tflux1\tflux2\nPGI\t1.2\t0.01\t5\t11'
    const ds = parseDataset(tsv)
    expect(ds.rows).toHaveLength(1)
    expect(ds.rows[0]).toMatchObject({ reactionId: 'PGI', log2fc: 1.2, fluxCond1: 5, fluxCond2: 11 })
  })

  it('reports missing required columns instead of throwing', () => {
    const ds = parseDataset('reaction_id,foo\nPYK,1')
    expect(ds.rows).toHaveLength(0)
    expect(ds.errors[0].message).toMatch(/Missing required column/)
  })

  it('skips invalid rows and records errors', () => {
    const csv = [
      'reaction_id,log2fc,p_value',
      'PYK,notanumber,0.01',
      'PGI,1.2,0.01',
      'DUP,1,0.5',
      'DUP,2,0.5',
      ',3,0.5',
    ].join('\n')
    const ds = parseDataset(csv)
    expect(ds.rows.map((r) => r.reactionId)).toEqual(['PGI', 'DUP'])
    expect(ds.errors.length).toBe(3) // non-numeric, duplicate, empty id
  })

  it('clamps p_value of 0 to a tiny positive value', () => {
    const ds = parseDataset('reaction_id,log2fc,p_value\nPYK,2,0')
    expect(ds.rows[0].pValue).toBeGreaterThan(0)
    expect(ds.rows[0].pValue).toBeLessThan(1e-100)
  })

  it('clamps p_value just above 1 to 1 instead of dropping the row', () => {
    const ds = parseDataset('reaction_id,log2fc,padj\nPYK,2,1.0000003')
    expect(ds.rows).toHaveLength(1)
    expect(ds.rows[0].pValue).toBe(1)
  })
})
