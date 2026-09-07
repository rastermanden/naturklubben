import type { PieceType } from './pieces'

/**
 * Brikkernes farver er de samme overalt, hvor Tetris spilles -- en I er cyan,
 * en T er lilla. De følger derfor ikke appens temafarver: de er en del af,
 * hvordan spillet genkendes, og de virker på både lys og mørk bund.
 */
export const PIECE_COLORS: Record<PieceType, string> = {
  I: '#22d3ee',
  J: '#3b82f6',
  L: '#f97316',
  O: '#eab308',
  S: '#22c55e',
  T: '#a855f7',
  Z: '#ef4444',
}

/** Navnene bruges af oplæsere og af listen over brikker i hjælpeteksten. */
export const PIECE_NAMES: Record<PieceType, string> = {
  I: 'I-brik',
  J: 'J-brik',
  L: 'L-brik',
  O: 'O-brik',
  S: 'S-brik',
  T: 'T-brik',
  Z: 'Z-brik',
}

/** Gitteret og skyggen skal kunne ses på begge bunde -- derfor gennemsigtigt. */
export const GRID_LINE_COLOR = 'rgb(128 128 128 / 0.22)'
export const GHOST_ALPHA = 0.28
