const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

export function pronounsReminderStorageKey(userId: string) {
  return `naturklubben:pronouns-reminder-snoozed:${userId}`
}

export function isPronounsReminderSnoozed(userId: string, now = Date.now()) {
  try {
    const stored = window.localStorage.getItem(
      pronounsReminderStorageKey(userId),
    )
    if (stored === null) return false
    const until = Number(stored)
    return Number.isFinite(until) && until > now
  } catch {
    return false
  }
}

export function snoozePronounsReminder(userId: string, now = Date.now()) {
  try {
    window.localStorage.setItem(
      pronounsReminderStorageKey(userId),
      String(now + SNOOZE_MS),
    )
  } catch {
    // Privat tilstand kan blokere localStorage. Påmindelsen vises bare igen.
  }
}
