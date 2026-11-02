import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

/**
 * Dataudleveringen: medlemmets egne data som en JSON-fil.
 *
 * Selve indsamlingen sker i `convex/account.ts` (`exportData`), som kun kan
 * svare om den indloggede. Her hentes svaret og pakkes som en download -- den
 * gamle app fik filen som et HTTP-svar fra en Edge Function, men i V2 er der
 * ingen function at downloade fra.
 *
 * **Usikkert punkt:** den gamle app krævede et friskt genlogin, før data blev
 * udleveret. Convex Auth giver ikke et `last_sign_in_at`, så kravet kan ikke
 * efterprøves server-side endnu; siden bør selv bede om adgangskoden, indtil
 * det er afklaret.
 */
export type AccountExport = Record<string, unknown>

export function downloadAccountExport(
  data: AccountExport,
  date = new Date(),
): void {
  const content = JSON.stringify(data, null, 2)
  const blob = new Blob([content], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `naturklubben-data-${date.toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function useAccountExport() {
  const [requested, setRequested] = useState(false)
  const data = useQuery(api.account.exportData, requested ? {} : 'skip')

  return {
    data: data ?? null,
    isLoading: requested && data === undefined,
    request: () => setRequested(true),
  }
}
