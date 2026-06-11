import { useMemo } from 'react'
import type { EcDatum, PathwaySector } from './types'
import { divergingColor, textColor } from '../overview/color'

interface Props {
  sector: PathwaySector
  ecData: Map<string, EcDatum>
  lim: number
  alpha: number
}

export function PathwayPanel({ sector, ecData, lim, alpha }: Props) {
  const rows = useMemo(
    () =>
      sector.matchedEcs
        .map((ec) => ecData.get(ec))
        .filter((d): d is EcDatum => Boolean(d))
        .sort((a, b) => Math.abs(b.log2fc) - Math.abs(a.log2fc)),
    [sector, ecData],
  )

  const fmtP = (p: number) => (p < 1e-3 ? p.toExponential(1) : p.toFixed(3))

  return (
    <aside className="sector-panel">
      <h2>{sector.name}</h2>
      <p className="muted">
        {sector.category} · {sector.matchedEcs.length}/{sector.totalEcs} enzymes with flux
      </p>
      <table className="rxn-table">
        <thead>
          <tr>
            <th>EC</th>
            <th>log2FC</th>
            <th>p</th>
            <th>rxns</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const bg = divergingColor(d.log2fc, lim)
            return (
              <tr key={d.ec} className={d.pValue < alpha ? 'sig' : ''}>
                <td className="rxn-id">{d.ec}</td>
                <td className="lfc" style={{ background: bg, color: textColor(bg) }}>
                  {d.log2fc.toFixed(2)}
                </td>
                <td className="pval">{fmtP(d.pValue)}</td>
                <td className="muted" title={d.reactions.join(', ')}>
                  {d.nReactions}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </aside>
  )
}
