import { describe, expect, it } from 'vitest'
import { toFriendlyAdminRoleError } from './adminRoleErrors'

describe('toFriendlyAdminRoleError', () => {
  it.each([
    [
      { code: '23514', message: 'admin_role_last_admin' },
      'Den sidste administrator kan ikke få fjernet sin adminrolle.',
    ],
    [
      { code: 'P0002', message: 'admin_role_target_not_found' },
      'Medlemmet findes ikke længere. Opdatér siden og prøv igen.',
    ],
    [
      { code: '22023', message: 'admin_role_unchanged' },
      'Rollen er allerede ændret. Opdatér siden for at se den aktuelle rolle.',
    ],
    [
      { code: '42501', message: 'admin_role_not_authorized' },
      'Du har ikke længere rettigheder til at ændre adminroller.',
    ],
  ])('maps %# to a safe Danish message', (error, expected) => {
    expect(toFriendlyAdminRoleError(error)).toBe(expected)
  })

  it('does not expose unknown database messages', () => {
    expect(
      toFriendlyAdminRoleError({
        code: 'XX000',
        message: 'internal database detail',
      }),
    ).toBe('Adminrollen kunne ikke ændres. Prøv igen om lidt.')
  })
})
