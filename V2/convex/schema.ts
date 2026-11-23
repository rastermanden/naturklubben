import { defineSchema } from 'convex/server'
import { legacyAuthTables } from './tables/legacyAuth'
import { memberTables } from './tables/members'
import { calendarTables } from './tables/calendar'
import { chatTables } from './tables/chat'
import { galleryTables } from './tables/gallery'
import { audioTables } from './tables/audio'
import { notificationTables } from './tables/notifications'
import { communityTables } from './tables/community'
import { migrateTables } from './tables/migrate'

/**
 * V2's samlede skema.
 *
 * Tabellerne er delt i domænefiler under `convex/tables/`, så to ting kan være
 * sandt på samme tid: Convex kræver ét `defineSchema`-kald, og hver domænefil
 * skal kunne ændres uden at nogen redigerer en fælles fil. Ret derfor en tabel
 * i dens egen fil -- denne fil rører man kun, når et helt nyt domæne dukker op.
 *
 * `users` og overgangstabellerne fra Convex Auth v1 ligger i
 * `tables/legacyAuth.ts`; nye sessioner, bekræftede e-mails og adgangskodehashes
 * bor i Convex Auth 2.x-komponenterne (`auth`, `authEmail`, `authPassword`).
 */
export default defineSchema({
  ...legacyAuthTables,
  ...memberTables,
  ...calendarTables,
  ...chatTables,
  ...galleryTables,
  ...audioTables,
  ...notificationTables,
  ...communityTables,
  ...migrateTables,
})
