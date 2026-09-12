// Teksten i svaret til en gæst, der har søgt om at deltage i en åben
// begivenhed (#224). Ren funktion, så den kan testes uden en mailudbyder.

export interface GuestDecisionEvent {
  title: string
  location: string | null
  start_at: string
  end_at: string | null
}

export interface GuestDecisionInput {
  status: 'approved' | 'rejected'
  fullName: string
  partySize: number
  event: GuestDecisionEvent
}

export interface GuestDecisionEmail {
  subject: string
  text: string
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

export function formatEventTime(event: GuestDecisionEvent) {
  const start = new Date(event.start_at)
  const end = event.end_at ? new Date(event.end_at) : null
  let text = `${dateFormatter.format(start)} kl. ${timeFormatter.format(start)}`
  if (end) text += `–${timeFormatter.format(end)}`
  return text
}

export function guestDecisionEmail({
  status,
  fullName,
  partySize,
  event,
}: GuestDecisionInput): GuestDecisionEmail {
  const firstName = fullName.trim().split(/\s+/)[0] || 'du'
  const when = formatEventTime(event)
  const where = event.location ? `\nSted: ${event.location}` : ''
  const people = partySize > 1 ? `\nAntal personer: ${partySize}` : ''

  if (status === 'approved') {
    return {
      subject: `Du er velkommen til "${event.title}"`,
      text: [
        `Hej ${firstName}`,
        '',
        `Din ansøgning om at deltage i "${event.title}" er godkendt. Vi glæder os til at se dig.`,
        '',
        `Tidspunkt: ${when}${where}${people}`,
        '',
        'Har du spørgsmål, så svar på denne mail.',
        '',
        'Venlig hilsen',
        'Naturklubben',
      ].join('\n'),
    }
  }

  return {
    subject: `Svar på din ansøgning til "${event.title}"`,
    text: [
      `Hej ${firstName}`,
      '',
      `Tak for din interesse i "${event.title}" (${when}). Vi kan desværre ikke tage imod flere deltagere denne gang.`,
      '',
      'Du er velkommen til at søge igen til en anden af klubbens åbne ture.',
      '',
      'Venlig hilsen',
      'Naturklubben',
    ].join('\n'),
  }
}
