import { CAUSES } from './causes'

/**
 * Vælgeren på profilsiden: hvert mærke er en knap, der slås til og fra.
 * aria-pressed frem for checkboxes, så knappen kan bære sit emoji og stadig
 * læses som "Støtter Ukraine, trykket".
 */
export function CausesField({
  value,
  onChange,
}: {
  value: readonly string[]
  onChange: (value: string[]) => void
}) {
  const chosen = new Set(value)

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-ink-body">Hjertesager</legend>
      <div className="flex flex-wrap gap-2">
        {CAUSES.map((cause) => {
          const pressed = chosen.has(cause.slug)
          return (
            <button
              key={cause.slug}
              type="button"
              aria-pressed={pressed}
              onClick={() =>
                onChange(
                  pressed
                    ? value.filter((slug) => slug !== cause.slug)
                    : [...value, cause.slug],
                )
              }
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm ${
                pressed
                  ? 'border-accent bg-accent text-white'
                  : 'border-line-strong text-ink-body'
              }`}
            >
              <span aria-hidden="true" className="text-lg">
                {cause.emoji}
              </span>
              {cause.label}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-ink-subtle">
        Små mærker ved dit navn på medlemslisten og i chatten. Vælg dem, der
        passer på dig -- eller ingen.
      </p>
    </fieldset>
  )
}
