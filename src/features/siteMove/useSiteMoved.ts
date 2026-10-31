import { useEffect, useState } from 'react'
import { isMovedResponse, probeUrl, shouldCheckForMove } from './siteMove'

/**
 * Om appen er flyttet til naturklubben.dk -- se `siteMove.ts`. Tjekket
 * sker én gang ved start og kun på den gamle adresse; offline eller ved en
 * fejl antages det, at intet er flyttet, så appen virker som før.
 */
export function useSiteMoved(): boolean {
  const [moved, setMoved] = useState(false)

  useEffect(() => {
    if (!shouldCheckForMove(window.location)) return
    let cancelled = false

    fetch(probeUrl(import.meta.env.BASE_URL, Date.now()), {
      redirect: 'manual',
      cache: 'no-store',
    })
      .then((response) => {
        if (!cancelled && isMovedResponse(response)) setMoved(true)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  return moved
}
