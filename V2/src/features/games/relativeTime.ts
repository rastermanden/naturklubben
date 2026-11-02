/**
 * "for 3 min siden", kort sagt.
 *
 * Den gamle app lånte `formatRelativeTime` fra chatten. V2's chat-domæne er
 * ikke portet endnu, og spil-siden skal ikke vente på det, så funktionen står
 * her i den korte form listen har brug for.
 */
export function formatRelativeTime(at: number, now = Date.now()): string {
  const seconds = Math.max(Math.round((now - at) / 1000), 0)
  if (seconds < 60) return 'lige nu'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min siden`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} t siden`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} dage siden`

  return new Intl.DateTimeFormat('da-DK', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(at))
}
