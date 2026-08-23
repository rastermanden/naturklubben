import { readableTextColor } from '../../lib/colorContrast'

export function ChatColorOption({
  value,
  label,
  selected,
  onSelect,
}: {
  value: string
  label: string
  selected: boolean
  onSelect: (value: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-label={`Vælg ${label}`}
      aria-pressed={selected}
      className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-transparent text-lg font-bold transition-transform hover:scale-105"
      style={{
        backgroundColor: value,
        color: readableTextColor(value),
      }}
    >
      <span aria-hidden="true">{selected ? '✓' : ''}</span>
    </button>
  )
}
