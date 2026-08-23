function errorProperty(error: unknown, property: 'code' | 'message') {
  if (typeof error !== 'object' || error === null) return ''

  if (property === 'code' && 'code' in error) {
    return String(error.code ?? '')
  }
  if (property === 'message' && 'message' in error) {
    return String(error.message ?? '')
  }

  return ''
}

export function toFriendlyAdminRoleError(error: unknown): string {
  const code = errorProperty(error, 'code')
  const message = errorProperty(error, 'message')

  if (message === 'admin_role_last_admin') {
    return 'Den sidste administrator kan ikke få fjernet sin adminrolle.'
  }
  if (message === 'admin_role_target_not_found') {
    return 'Medlemmet findes ikke længere. Opdatér siden og prøv igen.'
  }
  if (message === 'admin_role_unchanged') {
    return 'Rollen er allerede ændret. Opdatér siden for at se den aktuelle rolle.'
  }
  if (message === 'admin_role_invalid_value') {
    return 'Rolleændringen var ugyldig. Opdatér siden og prøv igen.'
  }
  if (message === 'admin_role_not_authorized' || code === '42501') {
    return 'Du har ikke længere rettigheder til at ændre adminroller.'
  }

  return 'Adminrollen kunne ikke ændres. Prøv igen om lidt.'
}
