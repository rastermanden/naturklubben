// Teksten i "Skriv til gæsten"-knappen: en ready-to-send mailto: med emne og
// en dansk kladde, som arrangøren kan rette til og sende fra sin egen
// mailklient. Se supabase/README.md, "Svaret til ansøgeren (#239)".

export interface GuestReplyEvent {
  title: string
  location: string | null
  start_at: string
  end_at: string | null
}

export interface GuestReplyInput {
  status: 'approved' | 'rejected'
  fullName: string
  email: string
  event: GuestReplyEvent
}

const dateFormatter = new Intl.DateTimeFormat('da-DK', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Copenhagen',
})
const timeFormatter = new Intl.DateTimeFormat('da-DK', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Copenhagen',
})

export function formatGuestEventTime(event: GuestReplyEvent) {
  const start = new Date(event.start_at)
  const end = event.end_at ? new Date(event.end_at) : null
  let text = `${dateFormatter.format(start)} kl. ${timeFormatter.format(start)}`
  if (end) text += `–${timeFormatter.format(end)}`
  return text
}

export interface GuestReplyDraft {
  subject: string
  body: string
}

export function guestReplyDraft({
  status,
  fullName,
  event,
}: GuestReplyInput): GuestReplyDraft {
  const firstName = fullName.trim().split(/\s+/)[0] || 'du'
  const when = formatGuestEventTime(event)
  const where = event.location ? `\nSted: ${event.location}` : ''

  if (status === 'approved') {
    return {
      subject: `Du er velkommen til "${event.title}"`,
      body: [
        `Hej ${firstName}`,
        '',
        `Du er velkommen til at deltage i "${event.title}". Vi glæder os til at se dig.`,
        '',
        `Tidspunkt: ${when}${where}`,
      ].join('\n'),
    }
  }

  return {
    subject: `Svar på din ansøgning til "${event.title}"`,
    body: [
      `Hej ${firstName}`,
      '',
      `Tak for din interesse i "${event.title}" (${when}). Vi kan desværre ikke tage imod din ansøgning denne gang.`,
      '',
      'Du er velkommen til at søge igen til en anden af klubbens åbne ture.',
    ].join('\n'),
  }
}

/** Bygger selve `mailto:`-linket, klar til `<a href>`. */
export function guestReplyMailto(input: GuestReplyInput): string {
  const draft = guestReplyDraft(input)
  const params = new URLSearchParams({
    subject: draft.subject,
    body: draft.body,
  })
  // URLSearchParams koder mellemrum som "+"; mailto:-klienter forventer %20.
  return `mailto:${encodeURIComponent(input.email)}?${params
    .toString()
    .replace(/\+/g, '%20')}`
}
