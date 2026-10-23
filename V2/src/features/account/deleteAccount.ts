import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'

/**
 * Sletning af egen konto.
 *
 * Klienten sender kun bekræftelsessætningen. Reservationen, sidste-admin-tjekket
 * og selve sletningen sker på serveren (`convex/account.ts`), og sletningen
 * gennemføres af en planlagt kørsel -- klienten skal derfor ikke vente på, at
 * alt er væk, men skal logge ud med det samme og sende medlemmet til
 * kvitteringssiden.
 */
export const ACCOUNT_DELETION_CONFIRMATION = 'SLET MIN KONTO'

export type AccountDeletionErrorCode =
  | 'invalid_confirmation'
  | 'last_admin'
  | 'not_a_member'
  | 'unknown'

export class AccountDeletionError extends Error {
  readonly code: AccountDeletionErrorCode

  constructor(code: AccountDeletionErrorCode) {
    super(code)
    this.name = 'AccountDeletionError'
    this.code = code
  }
}

/**
 * Convex-fejle fra en mutation kommer som en `Error` med serverens besked i
 * `message`. Koderne her er de faste strenge, `convex/account.ts` kaster --
 * ikke SQLSTATE'er, som den gamle app måtte oversætte.
 */
export function toAccountDeletionError(caught: unknown): AccountDeletionError {
  const message = caught instanceof Error ? caught.message : String(caught)
  if (message.includes('INVALID_CONFIRMATION')) {
    return new AccountDeletionError('invalid_confirmation')
  }
  if (message.includes('LAST_ADMIN')) {
    return new AccountDeletionError('last_admin')
  }
  if (message.includes('NOT_A_MEMBER')) {
    return new AccountDeletionError('not_a_member')
  }
  return new AccountDeletionError('unknown')
}

export function accountDeletionErrorMessage(error: unknown): string {
  const code =
    error instanceof AccountDeletionError ? error.code : ('unknown' as const)

  switch (code) {
    case 'invalid_confirmation':
      return `Skriv ${ACCOUNT_DELETION_CONFIRMATION} præcis som vist.`
    case 'last_admin':
      return 'Du er klubbens sidste administrator. Udpeg en ny administrator, før du sletter kontoen.'
    case 'not_a_member':
      return 'Du er ikke logget ind som medlem. Log ind igen og prøv en gang til.'
    default:
      return 'Kontoen kunne ikke slettes. Prøv igen om et øjeblik.'
  }
}

export function useDeleteAccount() {
  const requestDeletion = useMutation(api.account.requestDeletion)
  const [isPending, setIsPending] = useState(false)

  async function requestDeletionWithConfirmation(confirmation: string) {
    setIsPending(true)
    try {
      await requestDeletion({ confirmation })
    } catch (caught) {
      throw toAccountDeletionError(caught)
    } finally {
      setIsPending(false)
    }
  }

  return { isPending, requestDeletion: requestDeletionWithConfirmation }
}
