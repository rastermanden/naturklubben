// Typerne af push-notifikationer ud over chatten (#216), som et medlem kan slå
// til og fra -- samme navne som i databasens check-constraints. Delt mellem
// Edge Functions og frontend (src/features/notifications), så listen kun
// findes ét sted; derfor uden andre afhængigheder.

export const NOTIFICATION_KINDS = [
  'event_created',
  'event_reminder',
  'badge_nomination_review',
  'waitlist_promoted',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]
