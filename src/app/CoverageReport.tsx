import { useStore } from '../state/store'

export function CoverageReport() {
  const dataset = useStore((s) => s.dataset)
  const ecData = useStore((s) => s.ecData)
  const sectors = useStore((s) => s.sectors)
  const index = useStore((s) => s.index)

  if (!dataset) return null

  const b2e = index?.bigg2ec ?? {}
  const mapped = dataset.rows.filter((r) => b2e[r.reactionId.replace(/^R_/, '')] || b2e[r.reactionId]).length

  return (
    <section className="coverage">
      <h3>Coverage</h3>
      <dl>
        <div><dt>Reactions</dt><dd>{dataset.rows.length}</dd></div>
        <div><dt>Mapped to EC</dt><dd>{mapped}</dd></div>
        <div><dt>Distinct enzymes</dt><dd>{ecData.size}</dd></div>
        <div><dt>BRENDA pathways lit</dt><dd>{sectors.length}</dd></div>
        <div><dt>Namespace</dt><dd>{dataset.detectedNamespace}</dd></div>
      </dl>
      {dataset.errors.length > 0 && (
        <div className="errors muted">{dataset.errors.length} rows skipped on load</div>
      )}
    </section>
  )
}
