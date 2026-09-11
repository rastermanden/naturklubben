/**
 * Udskydelsen af pronomin-påmindelsen gemmes på enheden, ikke på profilen:
 * "Ikke nu" er et svar til den skærm, man sidder ved, ikke en beslutning om
 * pronominerne. Selve svaret ligger i profiles.pronouns.
 */

const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

export function pronounsReminderStorageKey(userId: string) {
  return `naturklubben:pronouns-reminder-snoozed:${userId}`
}

/** Er påmindelsen udskudt på denne enhed lige nu? */
export function isPronounsReminderSnoozed(userId: string, now = Date.now()) {
  try {
    const stored = window.localStorage.getItem(
      pronounsReminderStorageKey(userId),
    )
    if (stored === null) return false
    const until = Number(stored)
    return Number.isFinite(until) && until > now
  } catch {
    // Privat tilstand og blokerede cookies kaster her. Så vises påmindelsen
    // bare igen -- det er ikke værd at vælte appen over.
    return false
  }
}

/** Udskyd påmindelsen en uge på denne enhed. */
export function snoozePronounsReminder(userId: string, now = Date.now()) {
  try {
    window.localStorage.setItem(
      pronounsReminderStorageKey(userId),
      String(now + SNOOZE_MS),
    )
  } catch {
    // Se isPronounsReminderSnoozed.
  }
}
