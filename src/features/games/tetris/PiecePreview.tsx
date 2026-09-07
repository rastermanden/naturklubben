import { pieceCells, type PieceType } from './pieces'
import { PIECE_COLORS, PIECE_NAMES } from './colors'

/**
 * En lille tegning af en brik til "næste" og "gemt". Den er lavet af elementer
 * og ikke af canvas: den skifter kun, når brikken skifter, og et par firkanter
 * er billigere at vedligeholde end endnu et tegneprogram.
 */
interface PiecePreviewProps {
  piece: PieceType | null
  label: string
  dimmed?: boolean
  size?: 'small' | 'normal'
}

const GRID = 4

export function PiecePreview({
  piece,
  label,
  dimmed = false,
  size = 'normal',
}: PiecePreviewProps) {
  const cells = piece ? pieceCells(piece, 0) : []
  const filled = new Set(cells.map(({ x, y }) => `${x},${y}`))
  const box = size === 'small' ? 'w-12' : 'w-16'

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-ink-subtle">{label}</span>
      <div
        role="img"
        aria-label={piece ? PIECE_NAMES[piece] : `${label}: tom`}
        className={`grid aspect-square ${box} grid-cols-4 grid-rows-4 gap-px rounded border border-line-soft bg-surface-sunken p-1 ${
          dimmed ? 'opacity-40' : ''
        }`}
      >
        {Array.from({ length: GRID * GRID }, (_, index) => {
          const x = index % GRID
          const y = Math.floor(index / GRID)
          const occupied = piece && filled.has(`${x},${y}`)
          return (
            <span
              key={index}
              aria-hidden="true"
              className="rounded-[2px]"
              style={
                occupied ? { backgroundColor: PIECE_COLORS[piece] } : undefined
              }
            />
          )
        })}
      </div>
    </div>
  )
}
