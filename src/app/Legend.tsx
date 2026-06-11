import { divergingColor } from '../overview/color'

interface Props {
  lim: number
}

const STEPS = 24

export function Legend({ lim }: Props) {
  const gradient = Array.from({ length: STEPS }, (_, i) => {
    const v = -lim + (2 * lim * i) / (STEPS - 1)
    return divergingColor(v, lim)
  })
  return (
    <section className="legend">
      <h3>Enrichment</h3>
      <div className="legend-bar-label">directional enrichment Z</div>
      <div className="legend-bar">
        {gradient.map((c, i) => (
          <span key={i} style={{ background: c }} />
        ))}
      </div>
      <div className="legend-bar-ticks">
        <span>↓ {(-lim).toFixed(0)}</span>
        <span>0</span>
        <span>↑ {lim.toFixed(0)}</span>
      </div>
      <ul className="legend-notes">
        <li><b>color</b> = Stouffer Z over each enzyme's reporter z (p + direction)</li>
        <li><b>size</b> = enzymes (EC) with flux</li>
        <li><b>faded</b> = not significant (enrichment p ≥ α)</li>
      </ul>
      <p className="legend-foot">Click a pathway → per-enzyme log2FC on the BRENDA map.</p>
    </section>
  )
}
