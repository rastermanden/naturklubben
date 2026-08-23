import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabaseClient'

export type AccountExport = Record<string, unknown>

export type AccountExportErrorCode =
  'invalid_password' | 'recent_login_required' | 'export_failed' | 'unknown'

export class AccountExportError extends Error {
  readonly code: AccountExportErrorCode

  constructor(code: AccountExportErrorCode) {
    super(code)
    this.name = 'AccountExportError'
    this.code = code
  }
}

async function functionErrorCode(
  error: unknown,
): Promise<AccountExportErrorCode> {
  if (!(error instanceof FunctionsHttpError)) return 'unknown'
  try {
    const body = (await error.context.json()) as { code?: string }
    switch (body.code) {
      case 'recent_login_required':
      case 'export_failed':
        return body.code
      default:
        return 'unknown'
    }
  } catch {
    return 'unknown'
  }
}

export function accountExportErrorMessage(error: unknown): string {
  const code =
    error instanceof AccountExportError ? error.code : ('unknown' as const)
  switch (code) {
    case 'invalid_password':
      return 'Adgangskoden er forkert. Prøv igen.'
    case 'recent_login_required':
      return 'Loginbekræftelsen er udløbet. Indtast adgangskoden igen.'
    case 'export_failed':
      return 'Din dataudlevering kunne ikke oprettes. Prøv igen om et øjeblik.'
    default:
      return 'Din dataudlevering kunne ikke hentes. Prøv igen om et øjeblik.'
  }
}

export async function exportAccount(
  email: string,
  password: string,
): Promise<AccountExport> {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError) throw new AccountExportError('invalid_password')

  const { data, error } = await supabase.functions.invoke<AccountExport>(
    'export-account',
    { body: {} },
  )
  if (error) throw new AccountExportError(await functionErrorCode(error))
  if (!data || typeof data !== 'object') {
    throw new AccountExportError('export_failed')
  }
  return data
}

export function downloadAccountExport(
  data: AccountExport,
  date = new Date(),
): void {
  const content = JSON.stringify(data, null, 2)
  const blob = new Blob([content], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `naturklubben-data-${date.toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
