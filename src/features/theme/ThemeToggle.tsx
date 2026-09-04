import { useTheme } from './useTheme'
import type { ThemePreference } from './theme'

const OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'Følg telefonens indstilling' },
  { value: 'light', label: 'Lys', hint: 'Altid lys' },
  { value: 'dark', label: 'Mørk', hint: 'Altid mørk' },
]

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { preference, setPreference } = useTheme()

  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-label="Udseende"
        className="flex rounded-full border border-line-strong p-0.5"
      >
        {OPTIONS.map((option) => {
          const isSelected = preference === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              title={option.hint}
              onClick={() => setPreference(option.value)}
              className={`min-h-11 flex-1 rounded-full px-3 text-sm ${
                isSelected
                  ? 'bg-accent text-white'
                  : 'text-ink-muted hover:bg-surface-raised'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
