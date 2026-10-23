import { defineSchema } from 'convex/server'
import { authTables } from '@convex-dev/auth/server'
import { memberTables } from './tables/members'
import { calendarTables } from './tables/calendar'
import { chatTables } from './tables/chat'
import { galleryTables } from './tables/gallery'
import { notificationTables } from './tables/notifications'
import { communityTables } from './tables/community'

/**
 * V2's samlede skema.
 *
 * Tabellerne er delt i domænefiler under `convex/tables/`, så to ting kan være
 * sandt på samme tid: Convex kræver ét `defineSchema`-kald, og hver domænefil
 * skal kunne ændres uden at nogen redigerer en fælles fil. Ret derfor en tabel
 * i dens egen fil -- denne fil rører man kun, når et helt nyt domæne dukker op.
 *
 * `authTables` kommer fra Convex Auth (users, authAccounts, authSessions,
 * authRefreshTokens, authVerificationCodes, authVerifiers, authRateLimits).
 * Den kan ikke erstattes af egne tabeller: biblioteket læser og skriver dem selv.
 */
export default defineSchema({
  ...authTables,
  ...memberTables,
  ...calendarTables,
  ...chatTables,
  ...galleryTables,
  ...notificationTables,
  ...communityTables,
})
