/**
 * Adresserne til de to offentlige HTTP-ruter i `convex/calendarFeed.ts`.
 *
 * Convex' funktioner svarer på `<deployment>.convex.cloud`, mens HTTP-ruterne
 * ligger på `<deployment>.convex.site`. Site-adressen udledes derfor af
 * `VITE_CONVEX_URL`, så der ikke skal endnu en env-variabel til for at bygge
 * appen. Er URL'en ikke en sky-adresse, findes ruterne ikke -- så returneres
 * null, og kalderen skjuler det, den ikke kan bruge.
 */

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined

const siteUrl =
  convexUrl && convexUrl.includes('.convex.cloud')
    ? convexUrl.replace('.convex.cloud', '.convex.site')
    : null

/**
 * Tokenet i abonnements-URL'en. Det er ikke en hemmelighed, men en sti, der kan
 * skiftes på deploymentet (`npx convex env set CALENDAR_FEED_TOKEN <værdi>`), så
 * en URL, der er delt for vidt, kan tages ud af brug uden en ny kodeændring.
 */
export const CALENDAR_FEED_TOKEN = 'naturklubben'

/** URL'en, et medlem kan indsætte i sin kalender-app. */
export const calendarFeedUrl = siteUrl
  ? `${siteUrl}/calendar/${CALENDAR_FEED_TOKEN}.ics`
  : null

/** Gæsteformularens endpoint. Sender ansøgningen til HTTP-ruten, ikke til en mutation. */
export const guestRequestUrl = siteUrl
  ? `${siteUrl}/calendar/guest-request`
  : null
