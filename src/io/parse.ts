import Papa from 'papaparse'
import { detectNamespace } from './namespace'
import type { ParsedDataset, ReactionDatum, RowError } from './types'

type CanonicalKey = keyof ReactionDatum

const FIELD_ALIASES: Array<{ key: CanonicalKey; aliases: string[] }> = [
  { key: 'reactionId', aliases: ['reaction_id', 'reaction', 'rxn', 'rxn_id', 'id', 'reactionid', 'reactions'] },
  { key: 'log2fc', aliases: ['log2fc', 'log2foldchange', 'log2_fold_change', 'lfc', 'logfc', 'log2_fc', 'log_2_fc'] },
  // NB: no bare 'p' — too easily collides with an unrelated column named "p".
  { key: 'pValue', aliases: ['p_value', 'pvalue', 'padj', 'p_adj', 'qvalue', 'q_value', 'fdr', 'adj_p_value', 'adj_pvalue', 'q'] },
  { key: 'subsystem', aliases: ['subsystem', 'sub_system', 'pathway', 'system'] },
  { key: 'fluxCond1', aliases: ['flux_cond1', 'flux1', 'flux_a', 'v1', 'flux_condition1'] },
  { key: 'fluxCond2', aliases: ['flux_cond2', 'flux2', 'flux_b', 'v2', 'flux_condition2'] },
]

const REQUIRED: CanonicalKey[] = ['reactionId', 'log2fc', 'pValue']

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s\-.]+/g, '_')
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (s === '' || s.toLowerCase() === 'na' || s.toLowerCase() === 'nan') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Parse a CSV/TSV differential table into validated reaction rows. */
export function parseDataset(text: string): ParsedDataset {
  const res = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
  })

  const headers = res.meta.fields ?? []
  // canonical key -> original header
  const columnsFound: Partial<Record<CanonicalKey, string>> = {}
  for (const header of headers) {
    const norm = normalizeHeader(header)
    for (const { key, aliases } of FIELD_ALIASES) {
      if (columnsFound[key]) continue
      if (aliases.includes(norm)) columnsFound[key] = header
    }
  }

  const errors: RowError[] = []
  const missingRequired = REQUIRED.filter((k) => !columnsFound[k])
  if (missingRequired.length > 0) {
    errors.push({
      row: 0,
      message: `Missing required column(s): ${missingRequired.join(', ')}. Found headers: ${headers.join(', ') || '(none)'}`,
    })
    return { rows: [], errors, detectedNamespace: 'unknown', hasSubsystem: false, columnsFound }
  }

  const rows: ReactionDatum[] = []
  const seen = new Set<string>()
  let anySubsystem = false

  res.data.forEach((raw, i) => {
    const line = i + 2 // +1 for header, +1 for 1-based
    const get = (k: CanonicalKey) => (columnsFound[k] ? raw[columnsFound[k]!] : undefined)

    const reactionId = (get('reactionId') ?? '').trim()
    if (!reactionId) {
      errors.push({ row: line, message: 'empty reaction_id' })
      return
    }
    if (seen.has(reactionId)) {
      errors.push({ row: line, message: `duplicate reaction_id "${reactionId}" (kept first)` })
      return
    }

    const log2fc = toNumber(get('log2fc'))
    if (log2fc === null) {
      errors.push({ row: line, message: `non-numeric log2fc for "${reactionId}"` })
      return
    }

    let pValue = toNumber(get('pValue'))
    if (pValue === null) {
      errors.push({ row: line, message: `non-numeric p_value for "${reactionId}"` })
      return
    }
    // clamp into (0, 1] rather than dropping the row: q/p-values can round just
    // above 1.0, and 0 must stay positive so -log10 is finite.
    if (pValue > 1) pValue = 1
    else if (pValue <= 0) pValue = 1e-300

    const datum: ReactionDatum = { reactionId, log2fc, pValue }

    const subsystem = (get('subsystem') ?? '').trim()
    if (subsystem) {
      datum.subsystem = subsystem
      anySubsystem = true
    }
    const f1 = toNumber(get('fluxCond1'))
    const f2 = toNumber(get('fluxCond2'))
    if (f1 !== null) datum.fluxCond1 = f1
    if (f2 !== null) datum.fluxCond2 = f2

    seen.add(reactionId)
    rows.push(datum)
  })

  return {
    rows,
    errors,
    detectedNamespace: detectNamespace(rows.map((r) => r.reactionId)),
    hasSubsystem: anySubsystem,
    columnsFound,
  }
}
