import { tileColor } from './colors'
import type { Game2048State } from './engine'

function tileTextSize(value: number): string {
  if (value >= 10000) return 'text-base sm:text-xl'
  if (value >= 1000) return 'text-lg sm:text-2xl'
  if (value >= 100) return 'text-xl sm:text-3xl'
  return 'text-2xl sm:text-4xl'
}

function sameCell(
  a: { row: number; col: number } | null,
  row: number,
  col: number,
) {
  return a !== null && a.row === row && a.col === col
}

/**
 * Brættet som et gitter af felter. Ingen canvas -- seksten felter er ingenting
 * for DOM'en, og så kan oplæseren læse dem og testen finde dem.
 */
export function Board2048({ state }: { state: Game2048State }) {
  return (
    <div
      role="grid"
      aria-label="Spillebræt"
      className="grid aspect-square w-full grid-cols-4 gap-2 rounded-xl bg-surface-strong p-2 select-none sm:gap-3 sm:p-3"
    >
      {state.board.map((cells, row) => (
        <div key={row} role="row" className="contents">
          {cells.map((value, col) => {
            const color = tileColor(value)
            const spawned = sameCell(state.spawned, row, col)
            const merged = state.merged.some((cell) => sameCell(cell, row, col))
            return (
              <div
                key={col}
                role="gridcell"
                aria-label={value === 0 ? 'tom' : String(value)}
                data-value={value}
                className={`flex aspect-square items-center justify-center rounded-lg bg-surface-sunken font-bold tabular-nums ${tileTextSize(value)} ${
                  spawned
                    ? 'motion-safe:animate-tile-appear'
                    : merged
                      ? 'motion-safe:animate-tile-pop'
                      : ''
                }`}
                style={
                  value === 0
                    ? undefined
                    : { backgroundColor: color.bg, color: color.fg }
                }
              >
                {value === 0 ? '' : value}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
