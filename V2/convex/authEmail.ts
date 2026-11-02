/**
 * Auth-mails: bekræftelse ved oprettelse og nulstilling af adgangskode.
 *
 * Afsendelsen er et POST til Resends REST API. Der er ingen `resend`-pakke.
 * Uden `RESEND_API_KEY` logges mailen, og kaldet lykkes, så et preview ikke
 * vælter, fordi domænet endnu ikke kan sende.
 */

export type AuthMailKind = 'verify' | 'reset'

/**
 * Hvad previewet må gøre med en auth-mail.
 *
 * Produktion sender som hidtil. I previewet går mail kun til adgangslisten.
 * Nulstilling til en adresse uden bruger — eller uden for listen — sender
 * ingenting (`skip`), så siden kan vise det samme svar som ved en ukendt
 * adresse. Oprettelse uden for listen afvises (`deny`), så siden ikke
 * påstår, at en bekræftelsesmail er sendt.
 */
export function authMailDecision(input: {
  restrictToAllowlist: boolean
  kind: AuthMailKind
  onAllowlist: boolean
  hasAccount: boolean
}): 'send' | 'skip' | 'deny' {
  if (!input.restrictToAllowlist) return 'send'
  if (!input.onAllowlist) return input.kind === 'reset' ? 'skip' : 'deny'
  if (input.kind === 'reset' && !input.hasAccount) return 'skip'
  return 'send'
}

export const DEFAULT_AUTH_FROM = 'Naturklubben <noreply@naturklubben.dk>'

export function authFromAddress(override: string | undefined): string {
  const trimmed = override?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_AUTH_FROM
}

export function authMail(
  kind: AuthMailKind,
  url: string,
): { subject: string; text: string; html: string } {
  if (kind === 'reset') {
    return message(
      'Nulstil din adgangskode til Naturklubben',
      'Klik på linket for at vælge en ny adgangskode.',
      'Hvis du ikke har bedt om en ny adgangskode, kan du se bort fra mailen.',
      url,
    )
  }
  return message(
    'Bekræft din e-mail til Naturklubben',
    'Klik på linket for at aktivere din bruger — så er du logget ind med det samme.',
    'Kan du ikke finde mailen, så kig i spam-mappen.',
    url,
  )
}

function message(
  subject: string,
  intro: string,
  footer: string,
  url: string,
): { subject: string; text: string; html: string } {
  const href = escapeHtml(url)
  return {
    subject,
    text: [intro, '', url, '', footer].join('\n'),
    html: `<!doctype html><html lang="da"><body><p>${escapeHtml(intro)}</p><p><a href="${href}">${href}</a></p><p>${escapeHtml(footer)}</p></body></html>`,
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export type ResendResult = {
  status: number
  accepted: boolean
  /** Kort fejltekst fra Resend. Tom, når afsendelsen lykkedes eller blev logget. */
  detail: string
}

export async function postResendEmail(input: {
  apiKey: string
  from: string
  to: string
  subject: string
  text: string
  html: string
  fetchImpl: typeof fetch
}): Promise<ResendResult> {
  const response = await input.fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  })
  let detail = ''
  if (!response.ok) {
    try {
      const body = (await response.json()) as { message?: unknown }
      if (typeof body.message === 'string') detail = body.message.slice(0, 200)
    } catch {
      detail = ''
    }
  }
  return { status: response.status, accepted: response.ok, detail }
}

/**
 * Sender en auth-mail, eller logger den, når der ikke er en nøgle.
 * Kaster `AUTH_EMAIL_NOT_SENT`, hvis Resend afviser -- så siden ikke
 * påstår, at mailen er på vej.
 */
export async function deliverAuthEmail(input: {
  kind: AuthMailKind
  to: string
  url: string
  apiKey: string | undefined
  from: string | undefined
  fetchImpl: typeof fetch
  log: (line: string) => void
}): Promise<void> {
  const message = authMail(input.kind, input.url)
  const from = authFromAddress(input.from)
  const apiKey = input.apiKey?.trim()
  if (!apiKey) {
    input.log(
      `Auth-mail uden nøgle (${input.kind}) til ${input.to}: ${input.url}`,
    )
    return
  }
  const result = await postResendEmail({
    apiKey,
    from,
    to: input.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    fetchImpl: input.fetchImpl,
  })
  if (!result.accepted) {
    input.log(
      `Auth-mail afvist (${input.kind}) status ${result.status}: ${result.detail}`,
    )
    throw new Error('AUTH_EMAIL_NOT_SENT')
  }
}
