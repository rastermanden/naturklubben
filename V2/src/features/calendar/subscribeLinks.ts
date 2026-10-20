/** Googles "tilføj kalender fra URL"-side, forudfyldt med feedet. */
export function googleCalendarUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`
}

/** Samme feed over webcal://, som Apple Kalender og Outlook kan åbne direkte. */
export function webcalUrl(feedUrl: string): string {
  return feedUrl.replace(/^https?:\/\//, 'webcal://')
}
