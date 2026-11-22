import type { useAuthActions } from '@convex-dev/auth/react'
import { isPreviewDeployment } from '../pwa/previewInstall'

type SignInFn = ReturnType<typeof useAuthActions>['signIn']
type SignInResult = Awaited<ReturnType<SignInFn>>

/**
 * Logger ind med `password`-provideren først, og falder på PR-previews
 * tilbage til `preview-member`, når `password` enten fejler (fx ingen lokal
 * adgangskodekonto) eller returnerer `{ signingIn: false }` (fx ubekræftet
 * lokal konto). Gemmer aldrig adgangskoden.
 */
export async function signInWithPreviewFallback({
  signIn,
  email,
  password,
  redirectTo,
  isPreview = isPreviewDeployment(),
}: {
  signIn: SignInFn
  email: string
  password: string
  redirectTo?: string
  isPreview?: boolean
}): Promise<{ result: SignInResult; usedPreviewMember: boolean }> {
  const passwordParams: Record<string, string> = {
    email,
    password,
    flow: 'signIn',
    ...(redirectTo !== undefined ? { redirectTo } : {}),
  }

  let passwordResult: SignInResult
  try {
    passwordResult = await signIn('password', passwordParams)
  } catch (passwordError) {
    if (!isPreview) throw passwordError
    const result = await signIn('preview-member', { email, password })
    return { result, usedPreviewMember: true }
  }

  if (passwordResult && !passwordResult.signingIn && isPreview) {
    const result = await signIn('preview-member', { email, password })
    return { result, usedPreviewMember: true }
  }

  return { result: passwordResult, usedPreviewMember: false }
}
