import { useState } from 'react'
import { useStore } from '../state/store'
import { parseDataset } from '../io/parse'
import { SAMPLES, sampleById, type SampleDef } from './registry'

export function SampleSelector() {
  const sampleId = useStore((s) => s.sampleId)
  const dataset = useStore((s) => s.dataset)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // default-select the first sample until something is loaded; '' = custom upload
  const sampleValue = sampleId ?? (dataset ? '' : SAMPLES[0].id)
  const current = sampleById(sampleValue)

  async function load(sample: SampleDef) {
    setBusy(true)
    setErr(null)
    try {
      useStore.getState().setSampleId(sample.id)
      const res = await fetch(sample.csvUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      useStore.getState().loadDataset(parseDataset(await res.text()))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sample-selector">
      <label>
        Sample
        <select
          value={sampleValue}
          onChange={(e) => {
            const s = sampleById(e.target.value)
            if (s) void load(s)
          }}
          disabled={busy}
        >
          {sampleValue === '' && (
            <option value="" disabled>
              (custom upload)
            </option>
          )}
          {SAMPLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <button onClick={() => current && void load(current)} disabled={busy || !current}>
        Load sample
      </button>
      {current && <span className="sample-desc">{current.description}</span>}
      {err && <span className="sample-err">load failed: {err}</span>}
    </div>
  )
}
