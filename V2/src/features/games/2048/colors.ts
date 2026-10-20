/**
 * Brikkernes farver følger originalens skala fra lys til mørk, ikke appens
 * tema: de er en del af, hvordan spillet genkendes, og de virker på både lys
 * og mørk bund. Nøglen er eksponenten, så 2 er 1, 4 er 2, 2048 er 11.
 */
const TILE_COLORS: readonly { bg: string; fg: string }[] = [
  { bg: 'transparent', fg: 'transparent' },
  { bg: '#eee4da', fg: '#776e65' },
  { bg: '#ede0c8', fg: '#776e65' },
  { bg: '#f2b179', fg: '#f9f6f2' },
  { bg: '#f59563', fg: '#f9f6f2' },
  { bg: '#f67c5f', fg: '#f9f6f2' },
  { bg: '#f65e3b', fg: '#f9f6f2' },
  { bg: '#edcf72', fg: '#f9f6f2' },
  { bg: '#edcc61', fg: '#f9f6f2' },
  { bg: '#edc850', fg: '#f9f6f2' },
  { bg: '#edc53f', fg: '#f9f6f2' },
  { bg: '#edc22e', fg: '#f9f6f2' },
]
/** Alt over 2048 er sjældent nok til at få samme, mørke farve. */
const BEYOND_COLOR = { bg: '#3c3a32', fg: '#f9f6f2' }

export function tileColor(value: number): { bg: string; fg: string } {
  if (value === 0) return TILE_COLORS[0]
  const exponent = Math.log2(value)
  return TILE_COLORS[exponent] ?? BEYOND_COLOR
}
