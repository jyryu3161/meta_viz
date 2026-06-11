import { useEffect, useRef, useState } from 'react'
import { select } from 'd3-selection'
import { zoom } from 'd3-zoom'
import { svgUrl } from './registry'
import type { EcDatum } from './types'
import { divergingColor } from '../overview/color'

interface Props {
  file: string
  ecData: Map<string, EcDatum>
  lim: number
}

interface Hover {
  x: number
  y: number
  name: string
  ecs: string[]
  datum?: EcDatum
}

// strict 4-part EC (matches the build script); tolerates trailing '-' (partial EC)
const EC_RE = /ecno=([0-9]+\.[0-9]+\.[0-9]+\.[0-9-]+)/

/** EC numbers from a BRENDA enzyme box's `enzyme.php?ecno=` links (deduplicated). */
function ecsOfNode(node: Element): string[] {
  const seen = new Set<string>()
  node.querySelectorAll('a[href*="ecno="]').forEach((a) => {
    const m = EC_RE.exec(a.getAttribute('href') || '')
    if (m) seen.add(m[1])
  })
  return [...seen]
}

/** Of a box's ECs, the one with data and the largest |log2fc|. */
function bestEc(ecs: string[], ecData: Map<string, EcDatum>): EcDatum | undefined {
  let best: EcDatum | undefined
  for (const ec of ecs) {
    const d = ecData.get(ec)
    if (d && (!best || Math.abs(d.log2fc) > Math.abs(best.log2fc))) best = d
  }
  return best
}

type Pt = [number, number]

/** A node's center = its `transform="translate(x,y)"` (rects are centered there). */
function nodeCenter(node: Element): Pt | null {
  const m = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(node.getAttribute('transform') || '')
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null
}

/** First and last point of a link path's `d` (links are plain M…L… geometry). */
function linkEnds(path: Element): [Pt, Pt] | null {
  const nums = (path.getAttribute('d') || '').match(/-?[\d.]+/g)
  if (!nums || nums.length < 4) return null
  return [
    [+nums[0], +nums[1]],
    [+nums[nums.length - 2], +nums[nums.length - 1]],
  ]
}

const dist2 = (a: Pt, b: Pt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

/**
 * Renders a real BRENDA pathway SVG and recolors its enzyme (`nodeEN`) boxes by
 * the EC-level flux. Fetch/layout happens once per pathway `file`; recoloring runs
 * separately when the flux data or scale changes — so adjusting α does not re-fetch
 * the SVG or reset the pan/zoom. We only recolor (no MetaboMAPS code); the SVG is
 * BRENDA's own (CC BY 4.0).
 */
export function BrendaMapView({ file, ecData, lim }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const ecDataRef = useRef(ecData)
  ecDataRef.current = ecData
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errMsg, setErrMsg] = useState('')
  const [matched, setMatched] = useState(0)
  const [hover, setHover] = useState<Hover | null>(null)
  const [version, setVersion] = useState(0) // bumped when a new SVG is mounted

  // delegated hover — added once for the component's lifetime; reads current data via ref
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const onMove = (ev: MouseEvent) => {
      const node = (ev.target as Element)?.closest?.('g.node.nodeEN')
      if (!node) {
        setHover(null)
        return
      }
      const ecs = ecsOfNode(node)
      setHover({ x: ev.clientX, y: ev.clientY, name: node.querySelector('title')?.textContent || '', ecs, datum: bestEc(ecs, ecDataRef.current) })
    }
    const onLeave = () => setHover(null)
    wrap.addEventListener('mousemove', onMove)
    wrap.addEventListener('mouseleave', onLeave)
    return () => {
      wrap.removeEventListener('mousemove', onMove)
      wrap.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // 1. fetch + lay out the BRENDA SVG — only when the pathway file changes
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setHover(null)
    fetch(svgUrl(file))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => {
        if (cancelled || !wrapRef.current) return
        const wrap = wrapRef.current
        wrap.innerHTML = text
        const svg = wrap.querySelector('svg')
        if (!svg) throw new Error('no <svg> in map')

        // defense-in-depth: BRENDA SVGs are static drawings, but strip any
        // <script> or on* handler before we keep the injected markup.
        svg.querySelectorAll('script').forEach((s) => s.remove())
        svg.querySelectorAll('*').forEach((el) => {
          for (const attr of [...el.attributes]) {
            if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name)
          }
        })

        const origW = svg.getAttribute('width')
        const origH = svg.getAttribute('height')
        svg.setAttribute('width', '100%')
        svg.setAttribute('height', '100%')
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')

        const NS = 'http://www.w3.org/2000/svg'
        const zg = document.createElementNS(NS, 'g')
        while (svg.firstChild) zg.appendChild(svg.firstChild)
        svg.appendChild(zg)

        // BRENDA hides the detailed enzyme/cofactor layers by default (revealed on
        // zoom-in). Our detail view IS the zoomed-in reaction view, so reveal them.
        // Keep nodeSM (boundary metabolites) — hiding them orphans arrows.
        svg.querySelectorAll<SVGElement>('.all-enz-subst, .all-cofactors').forEach((g) => {
          g.style.display = 'inline'
        })
        svg.querySelectorAll<SVGTextElement>('text').forEach((t) => {
          if (parseFloat(t.getAttribute('font-size') || '0') >= 50) t.style.display = 'none'
          // BRENDA labels enzymes with no known EC as "?.?.?.?" — relabel to "N/A"
          else if (t.textContent && t.textContent.trim() === '?.?.?.?') t.textContent = 'N/A'
        })

        // Fit the viewBox to the actual content (BRENDA's declared canvas is huge).
        try {
          const bb = zg.getBBox()
          if (bb.width > 0 && bb.height > 0) {
            const pad = Math.max(bb.width, bb.height) * 0.02
            svg.setAttribute('viewBox', `${bb.x - pad} ${bb.y - pad} ${bb.width + 2 * pad} ${bb.height + 2 * pad}`)
          } else if (origW && origH) {
            svg.setAttribute('viewBox', `0 0 ${parseFloat(origW)} ${parseFloat(origH)}`)
          }
        } catch {
          if (origW && origH) svg.setAttribute('viewBox', `0 0 ${parseFloat(origW)} ${parseFloat(origH)}`)
        }
        if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 1000 800')

        const zb = zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.4, 16])
          .on('zoom', (ev) => zg.setAttribute('transform', ev.transform.toString()))
        select(svg).call(zb)

        if (!cancelled) {
          setStatus('ready')
          setVersion((v) => v + 1)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErrMsg(e instanceof Error ? e.message : String(e))
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [file])

  // 2. (re)color when the flux data or scale changes — no re-fetch, no zoom reset
  useEffect(() => {
    if (status !== 'ready' || !wrapRef.current) return
    const svg = wrapRef.current.querySelector('svg')
    if (!svg) return

    // node geometry (centers) for associating enzymes with their metabolites
    const geom: { el: SVGGElement; c: Pt; isMet: boolean }[] = []
    svg.querySelectorAll<SVGGElement>('g.node').forEach((node) => {
      const c = nodeCenter(node)
      if (c) geom.push({ el: node, c, isMet: node.classList.contains('nodeCM') || node.classList.contains('nodeSM') })
    })

    // fade the whole pathway into context...
    svg.querySelectorAll<SVGElement>('path.link').forEach((p) => {
      p.style.stroke = '#d3d8e0'
      p.style.strokeOpacity = '0.5'
      p.style.strokeWidth = '1'
    })
    for (const { el } of geom) {
      const rect = el.querySelector<SVGRectElement>('rect')
      if (rect) {
        rect.style.fill = '#eef1f4'
        rect.style.stroke = '#dfe3e8'
        rect.style.fillOpacity = '0.5'
        rect.style.strokeWidth = '0.8'
      }
      el.querySelectorAll<SVGElement>('text').forEach((t) => {
        t.style.opacity = '0.4'
        t.style.fontWeight = ''
      })
      el.removeAttribute('data-flux')
      el.style.cursor = ''
    }

    // ...highlight enzymes that have flux, collecting their centers.
    let n = 0
    const fluxCenters: Pt[] = []
    for (const { el, c, isMet } of geom) {
      if (isMet || !el.classList.contains('nodeEN')) continue
      const best = bestEc(ecsOfNode(el), ecData)
      const rect = el.querySelector<SVGRectElement>('rect')
      if (!best || !rect) continue
      rect.style.fill = divergingColor(best.log2fc, lim)
      rect.style.fillOpacity = '1'
      rect.style.stroke = '#334155'
      rect.style.strokeWidth = '1.2'
      el.style.cursor = 'pointer'
      el.setAttribute('data-flux', '1')
      el.querySelectorAll<SVGElement>('text').forEach((t) => {
        t.style.opacity = '1'
        t.style.fontWeight = '700'
      })
      fluxCenters.push(c)
      n++
    }
    setMatched(n)

    // ...and emphasize the metabolites wired to a flux enzyme (+ their links), so
    // each active reaction reads as a connected unit against the faded background.
    if (fluxCenters.length) {
      const T = 62 * 62 // link endpoints sit at node edges → centers are within ~node size
      const related = new Set<SVGGElement>()
      svg.querySelectorAll<SVGPathElement>('path.link').forEach((path) => {
        const ends = linkEnds(path)
        if (!ends) return
        const [a, b] = ends
        const aFlux = fluxCenters.some((fc) => dist2(fc, a) < T)
        const bFlux = fluxCenters.some((fc) => dist2(fc, b) < T)
        if (!aFlux && !bFlux) return
        const far = aFlux ? b : a
        let nearest: { el: SVGGElement; isMet: boolean } | null = null
        let bd = Infinity
        for (const nd of geom) {
          const d = dist2(nd.c, far)
          if (d < bd) {
            bd = d
            nearest = nd
          }
        }
        if (nearest && nearest.isMet && bd < T) {
          related.add(nearest.el)
          path.style.stroke = '#64748b'
          path.style.strokeOpacity = '0.9'
          path.style.strokeWidth = '1.4'
        }
      })
      related.forEach((el) => {
        const rect = el.querySelector<SVGRectElement>('rect')
        if (rect) {
          rect.style.fill = '#eef2f8'
          rect.style.stroke = '#64748b'
          rect.style.fillOpacity = '1'
          rect.style.strokeWidth = '1'
        }
        el.querySelectorAll<SVGElement>('text').forEach((t) => {
          t.style.opacity = '1'
        })
      })
    }
  }, [ecData, lim, status, version])

  const fmtP = (p: number) => (p < 1e-3 ? p.toExponential(1) : p.toFixed(3))

  return (
    <div className="brenda-map">
      <div className="brenda-svg" ref={wrapRef} />
      {status === 'loading' && <div className="brenda-status">loading BRENDA map…</div>}
      {status === 'error' && <div className="brenda-status err">map unavailable: {errMsg}</div>}
      {status === 'ready' && <div className="brenda-badge">{matched} enzymes with flux · scroll to zoom, drag to pan</div>}
      {hover && (hover.datum || hover.name) && (
        <div className="brenda-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hover.name && <div className="tip-name">{hover.name}</div>}
          {hover.ecs.length > 0 && <div className="tip-ec">EC {hover.ecs.join(', ')}</div>}
          {hover.datum ? (
            <div className="tip-val">
              log2FC {hover.datum.log2fc.toFixed(2)} · p {fmtP(hover.datum.pValue)}
              <div className="tip-rxn">
                {hover.datum.nReactions} reaction(s): {hover.datum.reactions.slice(0, 6).join(', ')}
                {hover.datum.reactions.length > 6 ? '…' : ''}
              </div>
            </div>
          ) : (
            <div className="tip-val muted">no flux data for this enzyme</div>
          )}
        </div>
      )}
    </div>
  )
}
