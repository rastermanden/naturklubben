import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useCurrentProfile } from '../auth/useCurrentProfile'
import { hasAnsweredPronouns } from './pronouns'
import {
  isPronounsReminderSnoozed,
  snoozePronounsReminder,
} from './pronounsReminderStorage'

/**
 * Samme påmindelse som i den nuværende app. Den læser den indloggedes profil
 * fra Convex i stedet for et Supabase-opslag.
 */
export function PronounsReminder() {
  const { profile } = useCurrentProfile()
  const { pathname } = useLocation()
  const [snoozed, setSnoozed] = useState(false)
  const userId = profile?._id

  if (
    !userId ||
    pathname === '/profil' ||
    snoozed ||
    isPronounsReminderSnoozed(userId)
  ) {
    return null
  }
  if (hasAnsweredPronouns(profile.pronouns)) return null

  return (
    <aside
      aria-labelledby="pronouns-reminder-heading"
      className="mx-4 mt-4 shrink-0 rounded-xl border border-line bg-surface-sunken p-4"
    >
      <h2 id="pronouns-reminder-heading" className="font-medium text-ink">
        Hvad er dine pronominer?
      </h2>
      <p className="mt-1 text-sm text-ink-body">
        Fortæl de andre, hvad du gerne vil kaldes -- hun, han, de, hen eller
        noget helt andet. Det tager et øjeblik på din profil, og du kan også
        vælge ikke at oplyse det.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          to="/profil"
          className="inline-flex min-h-11 items-center rounded-full border border-accent bg-accent px-4 py-2 text-sm text-white"
        >
          Udfyld på min profil
        </Link>
        <button
          type="button"
          onClick={() => {
            snoozePronounsReminder(userId)
            setSnoozed(true)
          }}
          className="min-h-11 rounded px-2 py-1 text-sm text-ink-muted underline"
        >
          Ikke nu
        </button>
      </div>
    </aside>
  )
}
