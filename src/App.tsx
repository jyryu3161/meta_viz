import { useEffect, useMemo } from 'react'
import { useStore } from './state/store'
import { loadBrendaIndex } from './brenda/registry'
import { UploadForm } from './app/UploadForm'
import { SampleSelector } from './app/SampleSelector'
import { CoverageReport } from './app/CoverageReport'
import { Legend } from './app/Legend'
import { PathwayTreemap } from './brenda/PathwayTreemap'
import { BrendaMapView } from './brenda/BrendaMapView'
import { PathwayPanel } from './brenda/PathwayPanel'

const ALPHAS = [0.001, 0.01, 0.05, 0.1]

export default function App() {
  const index = useStore((s) => s.index)
  const indexError = useStore((s) => s.indexError)
  const dataset = useStore((s) => s.dataset)
  const sectors = useStore((s) => s.sectors)
  const ecData = useStore((s) => s.ecData)
  const limFc = useStore((s) => s.limFc)
  const limZ = useStore((s) => s.limZ)
  const alpha = useStore((s) => s.alpha)
  const view = useStore((s) => s.view)
  const selectedPathway = useStore((s) => s.selectedPathway)
  const setAlpha = useStore((s) => s.setAlpha)
  const selectPathway = useStore((s) => s.selectPathway)
  const back = useStore((s) => s.back)

  // load the BRENDA index once
  useEffect(() => {
    let cancelled = false
    loadBrendaIndex()
      .then((idx) => {
        if (!cancelled) useStore.getState().setIndex(idx)
      })
      .catch((e: unknown) => {
        if (!cancelled) useStore.getState().setIndexError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const activeSector = useMemo(
    () => sectors.find((s) => s.name === selectedPathway) ?? null,
    [sectors, selectedPathway],
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⬡</span>
          <div>
            <h1>meta_viz</h1>
            <span className="tagline">two-condition flux · BRENDA pathway maps</span>
          </div>
        </div>
        <div className="controls">
          {dataset && <SampleSelector />}
          <label className="alpha">
            α&nbsp;
            <select value={alpha} onChange={(e) => setAlpha(Number(e.target.value))}>
              {ALPHAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <UploadForm />
        </div>
      </header>

      {!dataset ? (
        <main className="hero">
          <h2>Differential flux on BRENDA pathway maps</h2>
          <p>
            Upload a per-reaction table of <code>reaction_id, log2fc, p_value</code> (BiGG ids). Your flux is
            mapped to enzymes (EC) via MetaNetX + KEGG and painted onto the real BRENDA pathway maps.
          </p>
          {indexError ? (
            <p className="sample-err">BRENDA index failed to load: {indexError}</p>
          ) : !index ? (
            <p className="hint">loading BRENDA index…</p>
          ) : (
            <p className="hint">{index.pathways.length} BRENDA pathways ready.</p>
          )}
          <div className="hero-actions">
            <SampleSelector />
            <UploadForm />
          </div>
          <p className="hint">No data handy? Pick a sample above and click “Load sample”.</p>
        </main>
      ) : view === 'overview' ? (
        <main className="overview-layout">
          <div className="overview-main">
            {sectors.length > 0 ? (
              <PathwayTreemap sectors={sectors} lim={limZ} onSelect={selectPathway} alpha={alpha} />
            ) : (
              <div className="empty-note">
                <p>
                  <b>No BRENDA pathway lit up.</b>
                </p>
                <p>
                  {dataset.rows.length} reactions loaded ({dataset.detectedNamespace}).{' '}
                  {!index
                    ? 'BRENDA index is still loading…'
                    : indexError
                      ? `BRENDA index failed to load (${indexError}).`
                      : 'See the Coverage panel — likely the reaction ids are not BiGG, or they map only to reactions without an EC number (transport / exchange / spontaneous).'}
                </p>
              </div>
            )}
          </div>
          <div className="sidebar">
            <Legend lim={limZ} />
            <CoverageReport />
          </div>
        </main>
      ) : (
        <main className="detail">
          <div className="detail-bar">
            <button className="back" onClick={back}>
              ← Overview
            </button>
            <h2>{selectedPathway}</h2>
          </div>
          <div className="detail-body">
            <div className="detail-map">
              {activeSector ? (
                <BrendaMapView file={activeSector.file} ecData={ecData} lim={limFc} />
              ) : (
                <div className="brenda-status err">pathway not found</div>
              )}
            </div>
            {activeSector && <PathwayPanel sector={activeSector} ecData={ecData} lim={limFc} alpha={alpha} />}
          </div>
        </main>
      )}
    </div>
  )
}
