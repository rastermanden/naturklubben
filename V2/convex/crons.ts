import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

/**
 * Planlagte kørsler.
 *
 * Portet fra pg_cron-jobberne i den gamle app. To ting er anderledes, og det er
 * hele pointen med at flytte dem:
 *
 * 1. **`pg_net` er væk.** I den gamle app lagde cron et HTTP-kald i en kø og
 *    bad en Edge Function om at gøre arbejdet, fordi Postgres ikke selv kunne
 *    sende Web Push. Her kalder cron sin mutation eller action direkte.
 * 2. **Jobnavnene er de gamle.** De står i kommentaren over hver post, så en
 *    kørsel kan slås op i den gamle migration og sammenlignes.
 *
 * Kadencen er den samme som før, bortset fra kontosletningen: den havde ingen
 * cron i den gamle app (Edge Function'en gjorde det hele i ét kald), men her
 * *skal* den have en, fordi der ikke er nogen function at gøre det i -- se
 * `convex/account.ts`.
 *
 * Guest-ansøgningernes to jobber (`cleanup-event-guest-request-attempts`,
 * `purge-expired-event-guest-requests`) hører til kalender-/gæstedomænet og
 * portes sammen med det, ikke her.
 */
const crons = cronJobs()

// Erstatter pg_cron-jobbet 'retry-probation-notifications' ('*\/5 * * * *'):
// ansøgninger, hvis svar aldrig nåede frem, forsøges igen.
crons.interval(
  'retry-probation-notifications',
  { minutes: 5 },
  internal.probation.retryNotifications,
)

// Erstatter pg_cron-jobbet 'cleanup-probation-submission-attempts'
// ('17 * * * *'): rate-limit-forsøg ældre end 25 timer fjernes.
crons.cron(
  'cleanup-probation-submission-attempts',
  '17 * * * *',
  internal.probation.cleanupSubmissionAttempts,
)

// Erstatter pg_cron-jobbet 'purge-expired-probation-applications'
// ('0 3 * * *'): afgjorte ansøgninger efter 90 dage, ubesvarede efter 12
// måneder.
crons.cron(
  'purge-expired-probation-applications',
  '0 3 * * *',
  internal.probation.purgeExpired,
)

// Erstatter pg_cron-jobbet 'enqueue-event-reminders' ('*\/15 * * * *'):
// påmindelse dagen før. Selve opslaget i `events` mangler, fordi
// kalenderdomænet ikke er portet -- se `convex/push.ts`.
crons.interval(
  'enqueue-event-reminders',
  { minutes: 15 },
  internal.push.enqueueEventReminders,
)

// Ny i V2: gennemfører en kontosletning, der blev reserveret, men aldrig
// færdig -- fx fordi kaldet døde efter reservationen. Erstatter den del af
// `delete-account`-functionen, som den gamle app ikke kunne genoptage.
crons.interval(
  'complete-reserved-account-deletions',
  { minutes: 5 },
  internal.account.completeReservedDeletions,
)

export default crons
