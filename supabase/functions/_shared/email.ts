// Afsendelse af e-mail fra en Edge Function via Resends HTTP-API.
//
// Appen har ellers ingen mailudbyder: prøvemedlemskaber svares med Web Push
// (se supabase/README.md, "Hvorfor Web Push og ikke e-mail"). Gæster til en
// åben begivenhed (#224) er derimod ikke i appen og skal have svaret som mail.
// Nøglen (RESEND_API_KEY) og afsenderen (EMAIL_FROM, på et domæne verificeret
// hos Resend) er function-secrets, som deploy-functions.yml sætter fra repoet,
// hvis begge findes. Mangler en af dem, sender vi ikke -- og afgørelsens
// outbox viser tydeligt hvorfor, så arrangøren kan svare manuelt.

export interface EmailMessage {
  to: string
  subject: string
  text: string
}

export interface EmailSender {
  apiKey: string
  from: string
}

export interface EmailSendResult {
  ok: boolean
  status: number
  error?: string
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/**
 * Læser afsenderopsætningen fra function-secrets. Returnerer null, når nøgle
 * eller afsender mangler -- så kalderen kan melde det som en leveringsfejl i
 * stedet for at kaste.
 */
export function emailSenderFromEnv(
  env: { get(name: string): string | undefined } = Deno.env,
): EmailSender | null {
  const apiKey = env.get('RESEND_API_KEY')?.trim()
  const from = env.get('EMAIL_FROM')?.trim()
  if (!apiKey || !from) return null
  return { apiKey, from }
}

export async function sendEmail(
  message: EmailMessage,
  sender: EmailSender,
  fetchImpl: typeof fetch = fetch,
): Promise<EmailSendResult> {
  const response = await fetchImpl(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sender.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: sender.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  })

  if (response.ok) {
    return { ok: true, status: response.status }
  }

  // Resends fejlsvar er JSON med `message`; behold kun en kort, ufarlig
  // beskrivelse -- aldrig hele svaret, som kunne indeholde modtageradressen.
  let detail = ''
  try {
    const body = (await response.json()) as { message?: unknown }
    if (typeof body.message === 'string') detail = body.message.slice(0, 200)
  } catch {
    detail = ''
  }
  return {
    ok: false,
    status: response.status,
    error: detail
      ? `Mailudbyderen svarede ${response.status}: ${detail}`
      : `Mailudbyderen svarede ${response.status}.`,
  }
}
