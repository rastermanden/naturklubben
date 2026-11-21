import { useId } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

interface EventPickerProps {
  /** Begivenhedens id, eller `''` for "Ingen". */
  value: string
  /**
   * Titlen på den begivenhed, `value` peger på, hvis den ikke nødvendigvis er
   * i listen -- fx albummets egen begivenhed. Uden den ville en `select` med
   * en `value`, der ikke matcher nogen `option`, falde tilbage til den første
   * og dermed vise "Ingen", mens uploaden knytter begivenheden alligevel.
   */
  valueTitle?: string
  onChange: (eventId: string) => void
  label?: string
  emptyLabel?: string
  hideWhenEmpty?: boolean
  tone?: 'default' | 'inverse'
  disabled?: boolean
  emptyListHint?: string
}

/**
 * Det valgfrie "Knyt til begivenhed"-felt i upload-, redigerings- og flyt-formularer.
 *
 * Feltet ligger i sin egen komponent, fordi Convex' `useQuery` kaster, når
 * funktionen fejler: står kaldet i `GalleryPage`, river en fejl hele siden med
 * sig, og så kan man heller ikke uploade uden begivenhed. Her fanger
 * `AppErrorBoundary` omkring komponenten fejlen, og resten af formularen
 * bliver stående.
 *
 * Listen dækker både afholdte og kommende begivenheder -- billeder uploades
 * som regel efter turen -- og datoen står ved titlen, så to ture med samme
 * navn kan skelnes.
 */
export function EventPicker({
  value,
  valueTitle,
  onChange,
  label = 'Knyt til begivenhed (valgfri)',
  emptyLabel = 'Ingen',
  hideWhenEmpty = true,
  tone = 'default',
  disabled = false,
  emptyListHint,
}: EventPickerProps) {
  const selectId = useId()
  const hintId = useId()
  const events = useQuery(api.calendar.eventOptions, {})

  if (
    hideWhenEmpty &&
    events !== undefined &&
    events.length === 0 &&
    value === ''
  ) {
    return null
  }

  // Feltet er brugbart, mens listen hentes: en `disabled` select er ude af
  // tab-rækkefølgen, så en skærmlæser møder den slet ikke -- og der kommer
  // ingen besked, når den bliver aktiv. `aria-busy` siger det i stedet.
  const options = events ?? []
  const valueIsListed =
    value === '' || options.some((event) => event.id === value)
  const showEmptyHint =
    events !== undefined && events.length === 0 && Boolean(emptyListHint)

  const labelClass =
    tone === 'inverse' ? 'text-sm text-white' : 'text-sm text-ink-body'
  const selectClass =
    tone === 'inverse'
      ? 'min-h-11 rounded border border-white/40 bg-surface px-3 py-2 text-base text-ink disabled:opacity-60'
      : 'min-h-11 rounded border border-line-strong bg-surface px-3 py-2 text-base disabled:opacity-60'

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className={labelClass}>
        {label}
      </label>
      <select
        id={selectId}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-busy={events === undefined}
        aria-describedby={showEmptyHint ? hintId : undefined}
        className={selectClass}
      >
        <option value="">{emptyLabel}</option>
        {!valueIsListed && (
          <option value={value}>{valueTitle ?? 'Denne begivenhed'}</option>
        )}
        {options.map((event) => (
          <option key={event.id} value={event.id}>
            {eventLabel(event)}
          </option>
        ))}
      </select>
      {showEmptyHint && (
        <p
          id={hintId}
          className={
            tone === 'inverse'
              ? 'text-xs text-white/75'
              : 'text-xs text-ink-subtle'
          }
        >
          {emptyListHint}
        </p>
      )}
    </div>
  )
}

function eventLabel(event: { title: string; startAt: number }) {
  const date = new Date(event.startAt).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${event.title} (${date})`
}
