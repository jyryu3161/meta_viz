export type Namespace =
  | 'bigg.reaction'
  | 'kegg.reaction'
  | 'seed.reaction'
  | 'metacyc.reaction'
  | 'rhea'

/**
 * Heuristic namespace vote over a sample of reaction ids. BiGG is the default
 * (the platform targets BiGG-based GEMs); the others let us flag a mismatch.
 * Informational only — the EC join always looks up by the (BiGG) reaction id.
 */
export function detectNamespace(ids: string[]): Namespace {
  const votes: Record<Namespace, number> = {
    'bigg.reaction': 0,
    'kegg.reaction': 0,
    'seed.reaction': 0,
    'metacyc.reaction': 0,
    rhea: 0,
  }
  for (const raw of ids.slice(0, 300)) {
    const id = raw.replace(/^R_/, '')
    if (/^R\d{5}$/i.test(id)) votes['kegg.reaction']++
    else if (/^rxn\d+$/i.test(id)) votes['seed.reaction']++
    else if (/(^RXN[-_])|([-_]RXN$)/i.test(id)) votes['metacyc.reaction']++
    else if (/^\d{5,7}$/.test(id)) votes.rhea++ // Rhea ids are 5+ digits; avoids 4-digit BiGG false positives
    else votes['bigg.reaction']++
  }
  let best: Namespace = 'bigg.reaction'
  for (const ns of Object.keys(votes) as Namespace[]) {
    if (votes[ns] > votes[best]) best = ns
  }
  return best
}
