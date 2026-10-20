import { useEffect } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

/**
 * Nyheder om nye funktioner i appen.
 *
 * Rækkerne skrives af koden (`ANNOUNCEMENTS` i `convex/announcements.ts`) og
 * læses her; hvad medlemmet har set, ligger i `featureAnnouncementReads` og
 * markeres med en mutation. Convex-abonnementet opdaterer listen af sig selv,
 * så der er ingen cache at holde styr på.
 */

/**
 * Sendt eller ej -- én gang pr. indlæsning af appen. Serveren afgør selv, om
 * der er noget at sende, og lader være, hvis en anden klient nåede det først;
 * flaget her er kun for at lade være med at kalde ved hver navigation.
 */
let deliveryRequested = false

/** Kun til test: glem, at der er spurgt i denne indlæsning. */
export function resetFeatureAnnouncementDelivery() {
  deliveryRequested = false
}

export function useFeatureAnnouncements() {
  const announcements = useQuery(api.announcements.list)
  const markRead = useMutation(api.announcements.markRead)
  const requestDelivery = useMutation(api.announcements.requestDelivery)

  /**
   * Beder serveren sende notifikationen om nye funktioner, hvis den ikke er
   * sendt endnu -- og så de nyheder, koden kender, så de findes.
   *
   * Nyheden oprettes ikke af en migration længere (V2 har ingen), så det er
   * her, den kommer ind i databasen første gang efter et deploy. Kaldet siger
   * intet om hvad eller til hvem; det er udelukkende et "kig efter".
   */
  useEffect(() => {
    if (deliveryRequested) return
    deliveryRequested = true
    void requestDelivery({}).catch((caught: unknown) => {
      // En fejl her koster ingenting for medlemmet foran skærmen: næste
      // indlæsning spørger igen.
      console.error('Kunne ikke udsende nyheden', caught)
    })
  }, [requestDelivery])

  const unread = (announcements ?? []).filter(
    (announcement) => !announcement.isRead,
  )

  return {
    announcements: announcements ?? [],
    unread,
    // Læselisten afgør, hvad der er ulæst. Så længe den ikke er hentet, ville
    // alt se ulæst ud -- og banneret ville blinke forbi hos et medlem, der har
    // set nyheden for længst.
    isLoading: announcements === undefined,
    markAsRead: async (ids: readonly Id<'featureAnnouncements'>[]) => {
      if (ids.length === 0) return
      try {
        await markRead({ announcementIds: [...ids] })
      } catch (caught) {
        // Slår det fejl, står nyheden bare stadig som ulæst -- der er intet
        // for medlemmet at handle på.
        console.error('Kunne ikke markere nyheden som læst', caught)
      }
    },
  }
}
