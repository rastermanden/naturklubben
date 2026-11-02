/**
 * Læsekvitteringer i chatten: hvor hver læsers lille avatar skal stå.
 * Rene funktioner -- ingen React, ingen Convex -- så placeringen kan testes.
 *
 * Databasen gemmer én position pr. medlem pr. rum: den seneste besked, de har
 * læst. Avataren vises under netop den besked (som i Messenger) -- ikke under
 * hver eneste besked, de har læst.
 */

export interface ReadPosition {
  userId: string
  room: string
  lastReadMessageId: string | null
  lastReadAt: number
}

interface MessageLike {
  id: string
  userId: string | null
  createdAt: number
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
    if (position.userId === currentUserId) continue

    let index =
      position.lastReadMessageId !== null
        ? (indexById.get(position.lastReadMessageId) ?? -1)
        : -1

    if (index === -1) {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i]!.createdAt <= position.lastReadAt) {
          index = i
          break
        }
      }
    }

    if (index === -1) continue
    const message = messages[index]!
    if (message.userId === position.userId) continue

    result.set(message.id, [...(result.get(message.id) ?? []), position.userId])
  }

  return result
}

/**
 * Skal den nyeste besked markeres som læst? Kun hvis den ligger efter ens
 * nuværende position (samme rækkefølge som chatten: tidspunkt, så id).
 *
 * Uden et besked-id er hele det millisekund allerede læst, så klienten ikke
 * bliver ved med at sende en markering, serveren alligevel lader stå.
 */
export function isAfterPosition(
  message: MessageLike,
  position: ReadPosition | undefined,
): boolean {
  if (!position) return true
  if (message.createdAt !== position.lastReadAt) {
    return message.createdAt > position.lastReadAt
  }
  if (position.lastReadMessageId === null) return false
  return message.id > position.lastReadMessageId
}

/** "Set af Alice", "Set af Alice og Bob", "Set af Alice, Bob og Carl". */
export function readByLabel(names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `Set af ${names[0]}`
  return `Set af ${names.slice(0, -1).join(', ')} og ${names[names.length - 1]}`
}
