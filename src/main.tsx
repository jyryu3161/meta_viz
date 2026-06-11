import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// NOTE: no React.StrictMode — it double-invokes effects in dev, which would
// double-inject the BRENDA SVG in the imperative map effect. Components are
// otherwise effect-idempotent.
const container = document.getElementById('root')
if (!container) throw new Error('#root not found')
createRoot(container).render(<App />)
