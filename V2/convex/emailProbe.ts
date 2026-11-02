import { v } from 'convex/values'
import { internal } from './_generated/api'
import { env, internalAction } from './_generated/server'
import { authFromAddress, postResendEmail } from './authEmail'

/**
 * Én prøvemail til Martin, så vi kan se, om Resend tager imod
 * noreply@naturklubben.dk. Modtageren er fast og kan ikke ændres af kaldet.
 */
const PROBE_TO = 'martin.martinjensen@gmail.com'

export const send = internalAction({
  args: {},
  returns: v.object({
    status: v.number(),
    accepted: v.boolean(),
    detail: v.string(),
  }),
  handler: async (
    ctx,
  ): Promise<{
    status: number
    accepted: boolean
    detail: string
  }> => {
    // Samme loft som auth-mailen: previewet skriver ikke til adresser
    // uden for adgangslisten. Prøven her er ikke en af dem.
    const decision = await ctx.runQuery(internal.authMailGate.decide, {
      email: PROBE_TO,
      kind: 'verify',
    })
    if (decision !== 'send') {
      return { status: 0, accepted: false, detail: 'NOT_ON_ALLOWLIST' }
    }
    const apiKey = env.RESEND_API_KEY?.trim()
    if (!apiKey) {
      return { status: 0, accepted: false, detail: 'NO_KEY' }
    }
    const result = await postResendEmail({
      apiKey,
      from: authFromAddress(env.AUTH_EMAIL_FROM),
      to: PROBE_TO,
      subject: 'Prøve fra Naturklubben',
      text: 'Dette er en enkelt prøvemail, så vi kan se, om Resend tager imod afsenderen noreply@naturklubben.dk.',
      html: '<p>Dette er en enkelt prøvemail, så vi kan se, om Resend tager imod afsenderen noreply@naturklubben.dk.</p>',
      fetchImpl: fetch,
    })
    console.log(
      `Resend-prøve status ${result.status} accepted ${result.accepted} ${result.detail}`,
    )
    return result
  },
})
