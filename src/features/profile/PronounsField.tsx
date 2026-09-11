import { useId, useState } from 'react'
import {
  PRONOUNS_CUSTOM,
  PRONOUNS_MAX_LENGTH,
  PRONOUNS_UNDISCLOSED,
  PRONOUN_GROUPS,
  isListedPronouns,
} from './pronouns'

/**
 * Vælgeren på profilsiden: en lang liste, "Skriv selv" og "Vil ikke oplyse".
 *
 * Feltet er kontrolleret udefra på selve teksten (value/onChange). Om
 * fritekstfeltet står åbent, er derimod feltets egen sag: det åbner, når
 * medlemmet vælger "Skriv selv", og når en gemt værdi ikke står på listen --
 * ellers ville et medlem, der har skrevet sine egne, se en tom vælger.
 */
export function PronounsField({
  value,
  onChange,
}: {
  value: string | null
  onChange: (value: string | null) => void
}) {
  const selectId = useId()
  const customId = useId()
  // Fritekstfeltet er åbent, når medlemmet har valgt det -- eller når den
  // gemte værdi ikke står på listen, så et medlem med egne pronominer ikke
  // møder en tom vælger. Udledes under render; ingen effekt, intet ekstra
  // render.
  const [customChosen, setCustomChosen] = useState(false)
  const custom = customChosen || (value !== null && !isListedPronouns(value))

  const selectValue = custom ? PRONOUNS_CUSTOM : value === null ? '' : value

  // Samme pronominer findes på flere sprog (hen/hen er både dansk, svensk og
  // norsk). En <option> må kun have én værdi, så gentagelserne udelades --
  // den første gruppe, der nævner dem, vinder.
  const seen = new Set<string>()

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={selectId} className="text-sm font-medium text-ink-body">
        Pronominer
      </label>
      <select
        id={selectId}
        value={selectValue}
        onChange={(event) => {
          const next = event.target.value
          if (next === PRONOUNS_CUSTOM) {
            setCustomChosen(true)
            onChange(value !== null && !isListedPronouns(value) ? value : null)
            return
          }
          setCustomChosen(false)
          onChange(next === '' ? null : next)
        }}
        className="min-h-11 rounded-lg border border-line-strong bg-surface px-4 py-2 text-ink"
      >
        <option value="">Vælg pronominer …</option>
        {PRONOUN_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options
              .filter(({ value: option }) => {
                if (seen.has(option)) return false
                seen.add(option)
                return true
              })
              .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.hint
                    ? `${option.value} (${option.hint})`
                    : option.value}
                </option>
              ))}
          </optgroup>
        ))}
        <optgroup label="Andet">
          <option value={PRONOUNS_CUSTOM}>Skriv selv …</option>
          <option value={PRONOUNS_UNDISCLOSED}>Vil ikke oplyse</option>
        </optgroup>
      </select>

      {custom && (
        <div className="flex flex-col gap-1">
          <label htmlFor={customId} className="text-sm text-ink-body">
            Dine pronominer
          </label>
          <input
            id={customId}
            type="text"
            value={value ?? ''}
            onChange={(event) =>
              onChange(event.target.value === '' ? null : event.target.value)
            }
            maxLength={PRONOUNS_MAX_LENGTH}
            autoComplete="off"
            placeholder="fx hen/hens"
            className="rounded-lg border border-line-strong px-4 py-2 text-ink"
          />
        </div>
      )}

      <p className="text-xs text-ink-subtle">
        Vises ved dit navn på medlemslisten og i chatten, så ingen behøver at
        gætte. Når du vælger eller skifter, får de andre besked i chatten. Står
        dine ikke på listen, så skriv dem selv.
      </p>
    </div>
  )
}
