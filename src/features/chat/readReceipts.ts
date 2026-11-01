/**
 * Læsekvitteringer i chatten (#294): hvor hver læsers lille avatar skal stå.
 * Rene funktioner -- ingen React, ingen Supabase -- så placeringen kan testes.
 *
 * Databasen gemmer én position pr. medlem pr. rum: den seneste besked, de har
 * læst. Avataren vises under netop den besked (som i Messenger) -- ikke under
 * hver eneste besked, de har læst.
 */

export interface ReadPosition {
  user_id: string
  room: string
  last_read_message_id: string | null
  last_read_at: string
}

interface MessageLike {
  id: string
  user_id: string | null
  created_at: string
}

/**
 * Hvilke læsere der hører til under hvilken besked. `messages` skal stå i
 * visningsrækkefølge (ældste først).
 *
 * - Man ser ikke sig selv.
 * - En afsender vises ikke under sin egen besked -- det er givet, at de har
 *   læst den.
 * - En position før de indlæste beskeder vises ikke (den hører til en ældre
 *   besked, der ikke er på skærmen).
 * - Er positionens besked ikke indlæst (fx slettet helt), placeres avataren
 *   ved den seneste besked, der er skrevet senest samtidig med positionen.
 */
export function readersByMessage(
  messages: readonly MessageLike[],
  positions: readonly ReadPosition[],
  currentUserId: string,
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  if (messages.length === 0) return result

  const indexById = new Map(
    messages.map((message, index) => [message.id, index]),
  )

  for (const position of positions) {
    if (position.user_id === currentUserId) continue

    let index =
      position.last_read_message_id !== null
        ? (indexById.get(position.last_read_message_id) ?? -1)
        : -1

    if (index === -1) {
      const readAt = new Date(position.last_read_at).getTime()
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (new Date(messages[i]!.created_at).getTime() <= readAt) {
          index = i
          break
        }
      }
    }

    if (index === -1) continue
    const message = messages[index]!
    if (message.user_id === position.user_id) continue

    result.set(message.id, [
      ...(result.get(message.id) ?? []),
      position.user_id,
    ])
  }

  return result
}

/**
 * Skal den nyeste besked markeres som læst? Kun hvis den ligger efter ens
 * nuværende position (samme rækkefølge som chatten: tidspunkt, så id).
 */
export function isAfterPosition(
  message: MessageLike,
  position: ReadPosition | undefined,
): boolean {
  if (!position) return true
  const messageTime = new Date(message.created_at).getTime()
  const positionTime = new Date(position.last_read_at).getTime()
  if (messageTime !== positionTime) return messageTime > positionTime
  return message.id > (position.last_read_message_id ?? '')
}

/** "Set af Alice", "Set af Alice og Bob", "Set af Alice, Bob og Carl". */
export function readByLabel(names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `Set af ${names[0]}`
  return `Set af ${names.slice(0, -1).join(', ')} og ${names[names.length - 1]}`
}

/** Erstatter eller tilføjer en position i listen (fra Realtime). */
export function upsertPosition(
  positions: readonly ReadPosition[] | undefined,
  next: ReadPosition,
): ReadPosition[] {
  const others = (positions ?? []).filter(
    (position) =>
      !(position.user_id === next.user_id && position.room === next.room),
  )
  return [...others, next]
}
