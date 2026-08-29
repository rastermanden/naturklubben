import { useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

/**
 * Nyheder om nye funktioner i appen.
 *
 * Rækkerne skrives af migrationer -- en ny funktion tager sin egen nyhed med i
 * den migration, den alligevel har. Klienten læser dem kun og husker, hvad
 * medlemmet har set, i feature_announcement_reads.
 */
export interface FeatureAnnouncement {
  id: string
  slug: string
  title: string
  body: string
  path: string | null
  released_at: string
}

export interface ReadableFeatureAnnouncement extends FeatureAnnouncement {
  isRead: boolean
}

/**
 * Hvor længe en nyhed er "ny" nok til, at det kan betale sig at spørge
 * serveren, om notifikationen er sendt. Samme vindue som outboxen i
 * pending_feature_announcement_pushes -- er nyheden ældre, sender serveren
 * alligevel ikke.
 */
const DELIVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const ANNOUNCEMENTS_KEY = ['feature-announcements'] as const

export function featureAnnouncementReadsKey(userId: string) {
  return ['feature-announcement-reads', userId] as const
}

async function fetchAnnouncements(): Promise<FeatureAnnouncement[]> {
  const { data, error } = await supabase
    .from('feature_announcements')
    .select('id, slug, title, body, path, released_at')
    .order('released_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as FeatureAnnouncement[]
}

async function fetchReadIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('feature_announcement_reads')
    .select('announcement_id')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []).map((row) => row.announcement_id as string)
}

export function useFeatureAnnouncements(userId: string) {
  const queryClient = useQueryClient()
  const readsKey = featureAnnouncementReadsKey(userId)

  const announcementsQuery = useQuery({
    queryKey: ANNOUNCEMENTS_KEY,
    queryFn: fetchAnnouncements,
  })

  const readsQuery = useQuery({
    queryKey: readsKey,
    queryFn: () => fetchReadIds(userId),
  })

  // Bevidst en almindelig funktion og ikke en useMutation: den kaldes også,
  // når Nyheder-siden forlades, og skal gøre sit arbejde færdigt, selv om
  // komponenten, der bad om det, er væk. Slår den fejl, står nyheden bare
  // stadig som ulæst -- der er intet for medlemmet at handle på.
  const markAsRead = useCallback(
    async (ids: readonly string[]) => {
      if (ids.length === 0) return
      const { error } = await supabase
        .from('feature_announcement_reads')
        .upsert(
          ids.map((id) => ({ announcement_id: id, user_id: userId })),
          { onConflict: 'announcement_id,user_id', ignoreDuplicates: true },
        )
      if (error) {
        console.error('Kunne ikke markere nyheden som læst', error)
        return
      }
      queryClient.setQueryData<string[]>(
        featureAnnouncementReadsKey(userId),
        (current) => [...new Set([...(current ?? []), ...ids])],
      )
    },
    [queryClient, userId],
  )

  const announcements = useMemo<ReadableFeatureAnnouncement[]>(() => {
    const read = new Set(readsQuery.data ?? [])
    return (announcementsQuery.data ?? []).map((announcement) => ({
      ...announcement,
      isRead: read.has(announcement.id),
    }))
  }, [announcementsQuery.data, readsQuery.data])

  const unread = useMemo(
    () => announcements.filter((announcement) => !announcement.isRead),
    [announcements],
  )

  return {
    announcements,
    unread,
    // Læselisten afgør, hvad der er ulæst. Så længe den ikke er hentet, ville
    // alt se ulæst ud -- og banneret ville blinke forbi hos et medlem, der har
    // set nyheden for længst.
    isLoading: announcementsQuery.isPending || readsQuery.isPending,
    isError: announcementsQuery.isError || readsQuery.isError,
    markAsRead,
  }
}

/**
 * Sendt eller ej -- én gang pr. indlæsning af appen. Serveren afgør selv, om
 * der er noget at sende, og lader være, hvis en anden klient nåede det først;
 * flaget her er kun for at lade være med at spørge igen ved hver navigation.
 */
let deliveryRequested = false

/** Kun til test: glem, at der er spurgt i denne indlæsning. */
export function resetFeatureAnnouncementDelivery() {
  deliveryRequested = false
}

/**
 * Beder serveren sende notifikationen om nye funktioner, hvis den ikke er
 * sendt endnu.
 *
 * Nyheden oprettes af en migration, og en migration kan ikke kalde en Edge
 * Function (den kender ikke dens URL). Derfor gør det første medlem, der åbner
 * appen efter deployet, det for hele klubben. Kaldet siger intet om hvad eller
 * til hvem -- det er udelukkende et "kig efter".
 */
export function useFeatureAnnouncementDelivery(
  announcements: readonly FeatureAnnouncement[],
) {
  // Kun det nyeste tidspunkt som afhængighed: det er en streng, der står
  // stille mellem renders, i modsætning til listen selv, og alderen regnes
  // først ud i effekten -- et Date.now() under render gør komponenten uren.
  const newestReleasedAt = announcements.reduce(
    (newest, announcement) =>
      announcement.released_at > newest ? announcement.released_at : newest,
    '',
  )

  useEffect(() => {
    if (!newestReleasedAt || deliveryRequested) return
    if (
      Date.now() - new Date(newestReleasedAt).getTime() >=
      DELIVERY_WINDOW_MS
    ) {
      return
    }
    deliveryRequested = true

    void supabase.functions
      .invoke('feature-announcements', { method: 'POST' })
      .then(({ error }) => {
        // En fejl her koster ingenting for medlemmet foran skærmen: nyheden
        // står i appen uanset, og næste indlæsning spørger igen.
        if (error) console.error('Kunne ikke udsende nyheden', error)
      })
  }, [newestReleasedAt])
}
