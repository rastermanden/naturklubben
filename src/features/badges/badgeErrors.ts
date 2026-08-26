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

/**
 * RPC'erne raiser med korte, stabile nøgler frem for pæne sætninger, så
 * teksten kan rettes her uden en migration. Alt andet får en generisk besked --
 * en rå Postgres-fejl siger ikke medlemmet noget.
 */
export function toFriendlyBadgeError(error: unknown): string {
  const code = errorProperty(error, 'code')
  const message = errorProperty(error, 'message')

  switch (message) {
    case 'badge_nominate_self':
      return 'Du kan ikke indstille dig selv til en badge.'
    case 'badge_nominate_reason_required':
      return 'Skriv en kort begrundelse for indstillingen.'
    case 'badge_nominate_reason_too_long':
      return 'Begrundelsen er for lang (højst 2000 tegn).'
    case 'badge_nominate_already_pending':
      return 'Der ligger allerede en åben indstilling af medlemmet til den badge.'
    case 'badge_nominate_already_awarded':
      return 'Medlemmet har allerede den badge.'
    case 'badge_nominate_badge_inactive':
      return 'Badgen kan ikke længere indstilles til.'
    case 'badge_nominate_badge_not_found':
    case 'badge_nominate_nominee_not_found':
      return 'Badgen eller medlemmet findes ikke længere. Opdatér siden.'
    case 'badge_nominate_rate_limited':
      return 'Du har indstillet mange på kort tid. Prøv igen om lidt.'
    case 'badge_vote_nominator':
      return 'Du har selv lavet indstillingen og kan derfor ikke være en af de to godkendere.'
    case 'badge_vote_already_voted':
      return 'Du har allerede stemt om den indstilling.'
    case 'badge_vote_already_resolved':
      return 'Indstillingen er allerede afgjort. Opdatér siden.'
    case 'badge_vote_nomination_not_found':
      return 'Indstillingen findes ikke længere. Opdatér siden.'
    case 'badge_vote_invalid_vote':
      return 'Stemmen var ugyldig. Opdatér siden og prøv igen.'
    case 'badge_vote_comment_too_long':
      return 'Kommentaren er for lang (højst 2000 tegn).'
    case 'badge_production_claimed_by_other':
      return 'En anden administrator har allerede taget opgaven.'
    case 'badge_production_already_done':
      return 'Opgaven er allerede markeret som færdig.'
    case 'badge_production_not_found':
      return 'Produktionsopgaven findes ikke længere. Opdatér siden.'
    case 'badge_delete_awarded':
      return 'Badgen er tildelt mindst ét medlem og kan derfor ikke slettes. Deaktivér den i stedet.'
    case 'badge_image_required':
      return 'Vælg et billede. En badge uden billede kan ikke produceres.'
    case 'badge_save_not_authorized':
      return 'Du er ikke logget ind længere. Log ind igen og prøv forfra.'
    case 'badge_vote_not_authorized':
    case 'badge_production_not_authorized':
    case 'badge_nominate_not_authorized':
      return 'Du har ikke rettigheder til det her længere. Opdatér siden.'
  }

  if (code === '23505') {
    return 'Der findes allerede en badge med det navn eller den slug.'
  }
  if (code === '42501') {
    return 'Du har ikke rettigheder til det her.'
  }
  if (code === '23514') {
    return 'Værdierne kunne ikke gemmes. Tjek felterne og prøv igen.'
  }

  return 'Handlingen kunne ikke gennemføres. Prøv igen om lidt.'
}
