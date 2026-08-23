import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabaseClient'

export const ACCOUNT_DELETION_CONFIRMATION = 'SLET MIN KONTO'

export type AccountDeletionErrorCode =
  | 'invalid_password'
  | 'invalid_confirmation'
  | 'recent_login_required'
  | 'last_admin'
  | 'storage_cleanup_failed'
  | 'account_delete_failed'
  | 'unknown'

export class AccountDeletionError extends Error {
  readonly code: AccountDeletionErrorCode

  constructor(code: AccountDeletionErrorCode) {
    super(code)
    this.name = 'AccountDeletionError'
    this.code = code
  }
}

async function functionErrorCode(
  error: unknown,
): Promise<AccountDeletionErrorCode> {
  if (!(error instanceof FunctionsHttpError)) return 'unknown'

  try {
    const body = (await error.context.json()) as { code?: string }
    switch (body.code) {
      case 'invalid_confirmation':
      case 'recent_login_required':
      case 'last_admin':
      case 'storage_cleanup_failed':
      case 'account_delete_failed':
        return body.code
      default:
        return 'unknown'
    }
  } catch {
    return 'unknown'
  }
}

export function accountDeletionErrorMessage(error: unknown): string {
  const code =
    error instanceof AccountDeletionError ? error.code : ('unknown' as const)

  switch (code) {
    case 'invalid_password':
      return 'Adgangskoden er forkert. Prøv igen.'
    case 'invalid_confirmation':
      return `Skriv ${ACCOUNT_DELETION_CONFIRMATION} præcis som vist.`
    case 'recent_login_required':
      return 'Loginbekræftelsen er udløbet. Indtast adgangskoden igen.'
    case 'last_admin':
      return 'Du er klubbens sidste administrator. Udpeg en ny administrator, før du sletter kontoen.'
    case 'storage_cleanup_failed':
      return 'Alle billedfiler kunne ikke slettes. Kontoen er bevaret, men enkelte filer kan allerede være fjernet. Prøv igen for at fuldføre.'
    case 'account_delete_failed':
      return 'Kontoen kunne ikke slettes. Ingen succes er registreret; prøv igen.'
    default:
      return 'Kontoen kunne ikke slettes. Prøv igen om et øjeblik.'
  }
}

export async function deleteAccount(email: string, password: string) {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError) throw new AccountDeletionError('invalid_password')

  const { error } = await supabase.functions.invoke('delete-account', {
    body: { confirmation: ACCOUNT_DELETION_CONFIRMATION },
  })
  if (error) {
    throw new AccountDeletionError(await functionErrorCode(error))
  }
}

export async function clearDeletedAccountSession() {
  // Kald først efter navigation til den offentlige kvitteringsside. Ellers kan
  // ProtectedRoute nå at sende profilen til forsiden, før kvitteringen vises.
  await supabase.auth.signOut({ scope: 'local' })
}
