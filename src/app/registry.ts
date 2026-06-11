// Registry of bundled example flux datasets. The BRENDA maps are EC-keyed and
// organism-independent, so a dataset only needs to provide BiGG reaction flux.
const base = import.meta.env.BASE_URL

export interface SampleDef {
  id: string
  label: string
  csvUrl: string
  description: string
}

export const SAMPLES: SampleDef[] = [
  {
    id: 'core_aerobic_anaerobic',
    label: 'E. coli core — aerobic → anaerobic',
    csvUrl: `${base}data/samples/e_coli_core_aerobic_vs_anaerobic.csv`,
    description: 'Glycolysis & fermentation up, respiration down',
  },
  {
    id: 'core_glucose_acetate',
    label: 'E. coli core — glucose → acetate',
    csvUrl: `${base}data/samples/e_coli_core_glucose_vs_acetate.csv`,
    description: 'Gluconeogenic / glyoxylate up, glycolysis down',
  },
  {
    id: 'core_edge_cases',
    label: 'E. coli core — edge cases',
    csvUrl: `${base}data/samples/e_coli_core_edge_cases.csv`,
    description: 'Sign-flips, blocked, off-map ids, missing subsystem',
  },
  {
    id: 'ijo_nutrient_shift',
    label: 'iJO1366 — nutrient shift (genome-scale)',
    csvUrl: `${base}data/samples/iJO1366_nutrient_shift.csv`,
    description: '2583 reactions, genome-scale',
  },
]

export function sampleById(id: string): SampleDef | undefined {
  return SAMPLES.find((s) => s.id === id)
}
