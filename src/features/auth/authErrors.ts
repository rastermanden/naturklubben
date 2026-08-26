/** Oversætter kendte Supabase Auth-fejlbeskeder til venlige danske beskeder. */
export function toFriendlyAuthError(message: string): string {
  const known: Record<string, string> = {
    'Invalid login credentials': 'Forkert e-mail eller adgangskode.',
    'User already registered': 'Der findes allerede en bruger med den e-mail.',
    'Email not confirmed': 'Bekræft venligst din e-mail, før du logger ind.',
    'Password should be at least 6 characters':
      'Adgangskoden skal være på mindst 6 tegn.',
    'Email not allowed':
      'Denne e-mailadresse er ikke inviteret til Naturklubben.',
    // Supabase' indbyggede mailtjeneste er stramt rate limited. Uden den her
    // blev svaret til et intetsigende "Der skete en fejl".
    'Email rate limit exceeded':
      'Der er sendt for mange mails på kort tid. Prøv igen om en time.',
    'For security purposes, you can only request this after 60 seconds.':
      'Vent et minut, før du prøver igen.',
  }
  return known[message] ?? 'Der skete en fejl. Prøv igen om lidt.'
}

/**
 * Oversætter fejlen i et mail-links URL (`#error_code=...`) til en dansk
 * besked. Supabase bruger samme fejlkoder til bekræftelses- og
 * nulstillingslinks, så teksten om, hvad man så gør, kommer fra kaldet.
 */
export function toFriendlyLinkError(
  errorCode: string | null,
  errorDescription: string | null,
): string {
  if (errorCode === 'otp_expired' || /expired/i.test(errorDescription ?? '')) {
    return 'Linket er udløbet eller allerede brugt.'
  }
  if (errorCode === 'access_denied') {
    return 'Linket kunne ikke bruges. Det er måske allerede brugt én gang.'
  }
  return 'Linket i mailen virkede ikke.'
}
