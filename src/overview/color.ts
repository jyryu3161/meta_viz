const GRAY: readonly [number, number, number] = [233, 236, 240]

// Refined diverging ramp for a light UI: a calm steel-blue (down) through a warm
// off-white to a muted brick-red (up). Up (positive) = red, down = blue.
const STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0.0, [40, 86, 140]], // steel blue
  [0.27, [108, 156, 198]], // soft blue
  [0.5, [244, 244, 240]], // warm off-white
  [0.73, [221, 130, 102]], // soft terracotta
  [1.0, [168, 50, 50]], // muted brick red
]

/**
 * Diverging color for a signed value. Symmetric domain [-lim, lim], clamped so
 * outliers saturate instead of compressing the scale. Up = red, down = blue.
 */
export function divergingColor(value: number, lim: number): string {
  const L = Math.max(lim, 1e-6)
  const clamped = Math.max(-L, Math.min(L, value))
  const t = (clamped + L) / (2 * L) // 0 (down/blue) .. 1 (up/red)
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [p0, c0] = STOPS[i - 1]
      const [p1, c1] = STOPS[i]
      const f = (t - p0) / (p1 - p0)
      const mix = (a: number, b: number) => Math.round(a + (b - a) * f)
      return `rgb(${mix(c0[0], c1[0])}, ${mix(c0[1], c1[1])}, ${mix(c0[2], c1[2])})`
    }
  }
  const last = STOPS[STOPS.length - 1][1]
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`
}

function parseRgb(s: string): [number, number, number] {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s)
  if (!m) return [128, 128, 128]
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Blend a color toward neutral gray; vividness=1 keeps it, 0 makes it gray. */
export function desaturate(color: string, vividness: number): string {
  const v = Math.max(0, Math.min(1, vividness))
  const [r, g, b] = parseRgb(color)
  const mix = (c: number, gray: number) => Math.round(gray + (c - gray) * v)
  return `rgb(${mix(r, GRAY[0])}, ${mix(g, GRAY[1])}, ${mix(b, GRAY[2])})`
}

/** Pick black or white text for legibility on a given background color. */
export function textColor(bg: string): string {
  const [r, g, b] = parseRgb(bg)
  // perceived luminance (sRGB approximation)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1a1a1a' : '#ffffff'
}
