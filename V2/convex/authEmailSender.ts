import { v } from 'convex/values'
import { components } from './_generated/api'
import { internalMutation } from './_generated/server'
import { authMail } from './authEmail'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function localizeAuthEmail(args: {
  subject?: string
  text?: string
  html?: string
}): { subject?: string; text?: string; html?: string } {
  const text = args.text ?? ''
  const linkMatch = /https?:\/\/\S+/.exec(text)
  const link = linkMatch?.[0]

  if (link) {
    if (link.includes('/ny-adgangskode')) {
      return authMail('reset', link)
    }
    if (link.includes('/velkommen')) {
      return authMail('verify', link)
    }
    if (args.subject === 'Validate your email address') {
      const intro = 'Klik på linket for at bekræfte din e-mailadresse.'
      const footer =
        'Hvis du ikke har bedt om denne mail, kan du se bort fra den.'
      return {
        subject: 'Bekræft din e-mailadresse til Naturklubben',
        text: [intro, '', link, '', footer].join('\n'),
        html: `<!doctype html><html lang="da"><body><p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p><p>${escapeHtml(footer)}</p></body></html>`,
      }
    }
  }

  if (args.subject === 'Your password was changed') {
    const body =
      'Adgangskoden til din Naturklubben-konto er blevet ændret.\n\n' +
      'Hvis det var dig, kan du se bort fra denne mail. Hvis det ikke var dig, så nulstil din adgangskode med det samme.'
    return {
      subject: 'Din adgangskode til Naturklubben blev ændret',
      text: body,
      html: `<!doctype html><html lang="da"><body><p>${escapeHtml(body).replaceAll('\n\n', '</p><p>')}</p></body></html>`,
    }
  }

  if (args.subject === 'Your email address was changed') {
    const body =
      'E-mailadressen på din Naturklubben-konto er blevet ændret.\n\n' +
      'Hvis det var dig, kan du se bort fra denne mail. Hvis det ikke var dig, så nulstil din adgangskode med det samme.'
    return {
      subject: 'Din e-mailadresse til Naturklubben blev ændret',
      text: body,
      html: `<!doctype html><html lang="da"><body><p>${escapeHtml(body).replaceAll('\n\n', '</p><p>')}</p></body></html>`,
    }
  }

  return {
    ...(args.subject !== undefined ? { subject: args.subject } : {}),
    ...(args.text !== undefined ? { text: args.text } : {}),
    ...(args.html !== undefined ? { html: args.html } : {}),
  }
}

/**
 * Mellemled mellem `@convex-dev/auth` og `@convex-dev/resend`:
 * oversætter standardtekster til dansk og springer afsendelsen over uden fejl,
 * når `RESEND_API_KEY` ikke er sat (fx i lokale test eller previews uden nøgle).
 */
export const sendEmail = internalMutation({
  args: {
    options: v.object({
      apiKey: v.string(),
      testMode: v.boolean(),
      initialBackoffMs: v.number(),
      retryAttempts: v.number(),
    }),
    from: v.string(),
    to: v.array(v.string()),
    subject: v.optional(v.string()),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    if (args.options.apiKey.trim().length === 0) {
      // Ingen adresse og intet link i loggen: linket er en engangskode.
      console.log('Auth-mail sendt (uden nøgle, kun log)')
      return 'skipped-no-api-key'
    }
    const localized = localizeAuthEmail({
      subject: args.subject,
      text: args.text,
      html: args.html,
    })
    return await ctx.runMutation(components.resend.lib.sendEmail, {
      options: args.options,
      from: args.from,
      to: args.to,
      ...localized,
    })
  },
})
