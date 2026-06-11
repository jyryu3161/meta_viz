import { useId, useMemo } from 'react'
import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from 'd3-hierarchy'
import type { PathwaySector } from './types'
import { desaturate, divergingColor, textColor } from '../overview/color'

interface CatDatum {
  category: string
  children: PathwaySector[]
}
type Datum = { children: CatDatum[] } | CatDatum | PathwaySector

function isSector(d: Datum): d is PathwaySector {
  return (d as PathwaySector).matchedEcs !== undefined
}

/** Greedy word-wrap a label into at most `maxLines` lines of ~`maxChars`, ellipsizing overflow. */
function wrapLabel(name: string, maxChars: number, maxLines: number): string[] {
  if (maxChars < 3) return [name.slice(0, Math.max(1, maxChars))]
  const words = name.split(/\s+/)
  const lines: string[] = []
  let i = 0
  let cur = ''
  while (i < words.length && lines.length < maxLines) {
    const word = words[i]
    const cand = cur ? `${cur} ${word}` : word
    if (cand.length <= maxChars) {
      cur = cand
      i++
    } else if (!cur) {
      lines.push(word.slice(0, maxChars - 1) + '…') // single word longer than a line
      i++
    } else {
      lines.push(cur)
      cur = ''
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur)
  if (i < words.length && lines.length > 0) {
    const last = lines[lines.length - 1]
    if (!last.endsWith('…')) lines[lines.length - 1] = (last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last) + '…'
  }
  return lines
}

const W = 1000
const H = 660

interface Props {
  sectors: PathwaySector[]
  lim: number // enrichment-Z color scale
  alpha: number // significance threshold for highlighting
  onSelect(name: string): void
}

/** Two-level treemap: BRENDA pathway category → pathway, colored by enrichment Z. */
export function PathwayTreemap({ sectors, lim, alpha, onSelect }: Props) {
  const uid = useId().replace(/:/g, '') // unique clipPath id prefix (safe if multiple instances mount)
  const root = useMemo(() => {
    const byCat = new Map<string, PathwaySector[]>()
    for (const s of sectors) {
      const arr = byCat.get(s.category)
      if (arr) arr.push(s)
      else byCat.set(s.category, [s])
    }
    const cats: CatDatum[] = [...byCat.entries()].map(([category, children]) => ({ category, children }))
    const h = hierarchy<Datum>({ children: cats }, (d) =>
      isSector(d) ? undefined : (d as { children: Datum[] }).children,
    )
      .sum((d) => (isSector(d) ? Math.max(1, d.matchedEcs.length) : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    return treemap<Datum>().size([W, H]).tile(treemapSquarify).paddingTop(17).paddingInner(2).round(true)(h)
  }, [sectors])

  const categories = root.descendants().filter((n) => n.depth === 1) as HierarchyRectangularNode<Datum>[]
  const leaves = root.leaves()

  return (
    <svg className="treemap" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {categories.map((c) => (
        <g key={`cat-${(c.data as CatDatum).category}`} transform={`translate(${c.x0},${c.y0})`}>
          <rect width={c.x1 - c.x0} height={c.y1 - c.y0} fill="#f1f3f6" stroke="#e5e8ed" />
          <text x={5} y={12} className="cat-label">
            {(c.data as CatDatum).category}
          </text>
        </g>
      ))}
      {leaves.map((node, i) => {
        const d = node.data as PathwaySector
        const w = node.x1 - node.x0
        const h = node.y1 - node.y0
        const sig = d.enrichP < alpha
        const strength = Math.min(1, Math.abs(d.enrichZ) / lim)
        const fill = desaturate(divergingColor(d.enrichZ, lim), sig ? 1 : 0.25)
        const opacity = sig ? 0.6 + 0.4 * strength : 0.42
        const fg = textColor(fill)
        const show = w > 56 && h > 28
        const clip = `${uid}pwclip-${i}`
        const dir = d.enrichZ > 0.05 ? '▲' : d.enrichZ < -0.05 ? '▼' : '–'
        const lineH = 12
        const maxChars = Math.max(4, Math.floor((w - 10) / 6.6))
        const maxNameLines = Math.max(1, Math.min(3, Math.floor((h - 22) / lineH)))
        const nameLines = wrapLabel(d.name, maxChars, maxNameLines)
        const enrichPStr = d.enrichP < 1e-3 ? d.enrichP.toExponential(1) : d.enrichP.toFixed(3)
        return (
          <g
            key={d.name}
            transform={`translate(${node.x0},${node.y0})`}
            className="sector"
            onClick={() => onSelect(d.name)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(d.name)
            }}
          >
            <title>
              {`${d.name}\n${d.matchedEcs.length}/${d.totalEcs} enzymes with flux\nenrichment Z ${d.enrichZ.toFixed(2)} (p ${enrichPStr}) · mean log2FC ${d.meanLog2fc.toFixed(2)}`}
            </title>
            <clipPath id={clip}>
              <rect width={w} height={h} />
            </clipPath>
            <rect width={w} height={h} fill={fill} fillOpacity={opacity} rx={2} />
            {show && (
              <text x={5} y={13} fill={fg} className="sector-label" clipPath={`url(#${clip})`}>
                {nameLines.map((ln, k) => (
                  <tspan key={k} x={5} dy={k === 0 ? 0 : lineH}>
                    {ln}
                  </tspan>
                ))}
                <tspan x={5} dy={lineH} className="sector-sub">
                  {dir} Z {d.enrichZ.toFixed(1)} · {d.matchedEcs.length}EC
                </tspan>
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
