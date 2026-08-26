import { describe, expect, it } from 'vitest'
import { toFriendlyBadgeError } from './badgeErrors'

describe('toFriendlyBadgeError', () => {
  it('oversætter to-admin-reglens egne fejl', () => {
    expect(toFriendlyBadgeError({ message: 'badge_vote_nominator' })).toMatch(
      /selv lavet indstillingen/,
    )
    expect(
      toFriendlyBadgeError({ message: 'badge_vote_already_voted' }),
    ).toMatch(/allerede stemt/)
  })

  it('oversætter indstillingens egne fejl', () => {
    expect(toFriendlyBadgeError({ message: 'badge_nominate_self' })).toMatch(
      /ikke indstille dig selv/,
    )
    expect(
      toFriendlyBadgeError({ message: 'badge_nominate_rate_limited' }),
    ).toMatch(/mange på kort tid/)
  })

  it('forklarer, hvorfor en tildelt badge ikke kan slettes', () => {
    expect(toFriendlyBadgeError({ message: 'badge_delete_awarded' })).toMatch(
      /Deaktivér den i stedet/,
    )
  })

  it('falder tilbage til SQLSTATE, når beskeden er ukendt', () => {
    expect(
      toFriendlyBadgeError({ code: '23505', message: 'duplicate key value' }),
    ).toMatch(/allerede en badge/)
    expect(
      toFriendlyBadgeError({ code: '42501', message: 'permission denied' }),
    ).toMatch(/ikke rettigheder/)
  })

  it('oversætter klientens egne nøgler', () => {
    expect(toFriendlyBadgeError(new Error('badge_image_required'))).toMatch(
      /Vælg et billede/,
    )
    expect(
      toFriendlyBadgeError(new Error('badge_save_not_authorized')),
    ).toMatch(/ikke logget ind/)
  })

  it('siger noget brugbart om en fejl, den slet ikke kender', () => {
    expect(toFriendlyBadgeError(new Error('boom'))).toMatch(/Prøv igen/)
    expect(toFriendlyBadgeError(null)).toMatch(/Prøv igen/)
  })
})
