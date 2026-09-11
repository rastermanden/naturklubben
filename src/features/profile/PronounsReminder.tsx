import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useProfilesMap } from '../chat/useProfilesMap'
import { hasAnsweredPronouns } from './pronouns'
import {
  isPronounsReminderSnoozed,
  snoozePronounsReminder,
} from './pronounsReminderStorage'

/**
 * "Hvad er dine pronominer?" -- en påmindelse til medlemmer, der endnu ikke
 * har taget stilling på profilen.
 *
 * Den står i app-shellen og ikke kun på profilsiden, for den, der aldrig åbner
 * profilen, er netop den, der skal mindes. Til gengæld kan den udskydes: "Ikke
 * nu" gemmer den væk i en uge på den enhed, man trykkede på. Den forsvinder
 * for altid, så snart der er svaret -- også med "Vil ikke oplyse".
 */
export function PronounsReminder({ userId }: { userId: string }) {
  const { data: profiles } = useProfilesMap()
  const { pathname } = useLocation()
  const [snoozed, setSnoozed] = useState(() =>
    isPronounsReminderSnoozed(userId),
  )

  // På profilsiden står feltet lige der; påmindelsen ville pege på sig selv.
  if (pathname === '/profil' || snoozed) return null

  // Vent, til profilen er hentet: et tomt svar må ikke ligne "ikke udfyldt".
  const profile = profiles?.[userId]
  if (!profile || hasAnsweredPronouns(profile.pronouns)) return null

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
