import type { ChatRoom, MessageView } from './types'

/**
 * Ren logik for den lokale beskedhistorik: hvilke beskeder der gemmes, og hvad
 * chatten viser, mens den live side endnu ikke er fremme.
 *
 * Denne fil rører hverken IndexedDB, netværk eller `navigator` -- det er den
 * del, der kan testes uden browser-API'er. Selve lageret ligger i
 * `historyCacheStore.ts`, og forbindelsen mellem de to i `useChatHistory`.
 *
 * Forskellen fra offline-køen (#219) er, at køen gemmer beskeder, der endnu
 * ikke er *sendt*; historikken gemmer beskeder, der allerede er *modtaget*.
 * Formålet er det samme: at appen ikke står og hænger på "Henter beskeder…",
 * når forbindelsen mangler eller er langsom.
 */

/** Hvor en brugers beskedhistorik for ét rum hører til i lageret. */
export function historyCacheKey(profileId: string, room: ChatRoom): string {
  return `${profileId}:${room}`
}

/**
 * Et rum af beskedhistorik, som det sidst blev set. Nøglen er
 * `historyCacheKey(profileId, room)`, så et andet medlem, der logger ind på
 * samme maskine, aldrig får den forrige brugers beskeder at se.
 */
export interface CachedHistory {
  key: string
  room: ChatRoom
  /** Ældste først, som chatten læses. */
  messages: MessageView[]
  hasMore: boolean
  updatedAt: number
}

/** Formen, `usePaginatedQuery` rapporterer sin side i. */
export type HistoryStatus =
  | 'LoadingFirstPage'
  | 'LoadingMore'
  | 'CanLoadMore'
  | 'Exhausted'

export interface ResolvedHistory {
  /** Ældste først. */
  messages: MessageView[]
  /** Sand, når der endnu intet er at vise -- hverken live eller fra cachen. */
  isFirstLoad: boolean
  hasMore: boolean
  isLoadingMore: boolean
}

/**
 * Hvad chatten skal vise, givet cachen og det live paginerede svar.
 *
 * Cachen er et "sidst kendte" billede: den vises med det samme -- også uden
 * forbindelse -- og skiftes ud, så snart den live side er fremme. Mens den
 * live side mangler (`LoadingFirstPage`) og der ingen cache er, er der intet
 * at vise endnu; det er det eneste tidspunkt, `isFirstLoad` er sand.
 *
 * Mens cachen vises, sættes `hasMore` til false: "Hent ældre" kalder jo
 * `loadMore`, som kræver forbindelse, og uden den ville knappen bare hænge.
 * Så snart den live side er fremme, er `hasMore` igen den live værdi.
 */
export function resolveHistory({
  cached,
  liveResults,
  status,
}: {
  cached: CachedHistory | null
  /** Den live side, nyeste først (som `usePaginatedQuery` leverer den). */
  liveResults: MessageView[]
  status: HistoryStatus
}): ResolvedHistory {
  if (status === 'LoadingFirstPage') {
    if (cached !== null) {
      return {
        messages: cached.messages,
        isFirstLoad: false,
        hasMore: false,
        isLoadingMore: false,
      }
    }
    return {
      messages: [],
      isFirstLoad: true,
      hasMore: false,
      isLoadingMore: false,
    }
  }

  return {
    messages: [...liveResults].reverse(),
    isFirstLoad: false,
    hasMore: status === 'CanLoadMore',
    isLoadingMore: status === 'LoadingMore',
  }
}
