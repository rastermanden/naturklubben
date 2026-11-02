import { errorCode } from '../auth/authErrors'

/**
 * Oversætter fejlkoderne fra `members.setAdmin` til danske beskeder.
 *
 * Koderne er de samme som i den gamle apps `set_admin_role`, men bæres nu som
 * `ConvexError`-data i stedet for som en Postgres-besked.
 */
export function toFriendlyAdminRoleError(error: unknown): string {
  const code = errorCode(error)

  switch (code) {
    case 'ADMIN_ROLE_LAST_ADMIN':
      return 'Den sidste administrator kan ikke få fjernet sin adminrolle.'
    case 'ADMIN_ROLE_TARGET_NOT_FOUND':
      return 'Medlemmet findes ikke længere. Opdatér siden og prøv igen.'
    case 'ADMIN_ROLE_UNCHANGED':
      return 'Rollen er allerede ændret. Opdatér siden for at se den aktuelle rolle.'
    case 'ADMIN_ROLE_DURING_DELETION':
      return 'Rollen kan ikke ændres, mens kontoen er ved at blive slettet.'
    case 'NOT_ADMIN':
      return 'Du har ikke længere rettigheder til at ændre adminroller.'
    case 'NOT_A_MEMBER':
      return 'Du er ikke længere medlem af Naturklubben.'
    default:
      return 'Adminrollen kunne ikke ændres. Prøv igen om lidt.'
  }
}
