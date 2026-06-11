import { useRef, useState } from 'react'
import { parseDataset } from '../io/parse'
import { useStore } from '../state/store'

export function UploadForm() {
  const loadDataset = useStore((s) => s.loadDataset)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onFile(file: File) {
    setBusy(true)
    try {
      const ds = parseDataset(await file.text())
      useStore.getState().setSampleId(null) // custom upload -> not a registry sample
      loadDataset(ds)
      const skipped = ds.errors.length ? `, ${ds.errors.length} skipped` : ''
      setMsg(ds.rows.length ? `${file.name}: ${ds.rows.length} reactions${skipped}` : `${file.name}: ${ds.errors[0]?.message ?? 'no rows'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="upload">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
        }}
      />
      <button className="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
        Upload CSV/TSV
      </button>
      {msg && <span className="upload-msg">{msg}</span>}
    </div>
  )
}
