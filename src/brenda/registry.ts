import type { PathwayDef } from './types'

const base = import.meta.env.BASE_URL

export interface BrendaIndex {
  pathways: PathwayDef[]
  bigg2ec: Record<string, string[]>
}

/** Load the static BRENDA index (pathway list + BiGG→EC bridge) once. */
export async function loadBrendaIndex(): Promise<BrendaIndex> {
  const [pathways, bigg2ec] = await Promise.all([
    fetch(`${base}brenda/pathways.json`).then((r) => {
      if (!r.ok) throw new Error(`pathways.json HTTP ${r.status}`)
      return r.json() as Promise<PathwayDef[]>
    }),
    fetch(`${base}brenda/bigg2ec.json`).then((r) => {
      if (!r.ok) throw new Error(`bigg2ec.json HTTP ${r.status}`)
      return r.json() as Promise<Record<string, string[]>>
    }),
  ])
  return { pathways, bigg2ec }
}

export function svgUrl(file: string): string {
  return `${base}brenda/maps/${file}`
}
