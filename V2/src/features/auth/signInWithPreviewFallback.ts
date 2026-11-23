import type { TokenBundle } from '@convex-dev/auth/react'
import { isPreviewDeployment } from '../pwa/previewInstall'

export type PreviewAwareSignInResult =
  | { status: 'complete'; tokens: TokenBundle }
  | { status: 'error'; userError: { error: string; [key: string]: unknown } }

export type EmailPasswordSignInFn = (args: {
  email: string
  password: string
}) => Promise<PreviewAwareSignInResult>

export type PreviewMemberSignInFn = (args: {
  email: string
  password: string
}) => Promise<PreviewAwareSignInResult>

export type SetSessionFn = (tokens: {
  accessToken: string
  userId: string
  refreshToken?: string
  refreshTokenExpiresAt?: number
}) => Promise<void>

/**
 * Logger ind med `auth:signInWithEmailPassword` først, og falder på PR-previews
 * tilbage til `auth:signInWithPreviewMember`, når lokalt login ikke lykkes
 * (fx fordi medlemmet kun findes i produktion). Gemmer aldrig adgangskoden.
 */
export async function signInWithPreviewFallback({
  signInWithPassword,
  signInWithPreviewMember,
  setSession,
  email,
  password,
  isPreview = isPreviewDeployment(),
}: {
  signInWithPassword: EmailPasswordSignInFn
  signInWithPreviewMember: PreviewMemberSignInFn
  setSession: SetSessionFn
  email: string
  password: string
  isPreview?: boolean
}): Promise<{ result: PreviewAwareSignInResult; usedPreviewMember: boolean }> {
  let passwordResult: PreviewAwareSignInResult
  try {
    passwordResult = await signInWithPassword({ email, password })
  } catch (passwordError) {
    if (!isPreview) throw passwordError
    const previewResult = await signInWithPreviewMember({ email, password })
    if (previewResult.status === 'complete') {
      await setSession(previewResult.tokens)
    }
    return { result: previewResult, usedPreviewMember: true }
  }

  if (passwordResult.status === 'complete') {
    await setSession(passwordResult.tokens)
    return { result: passwordResult, usedPreviewMember: false }
  }

  if (isPreview) {
    const previewResult = await signInWithPreviewMember({ email, password })
    if (previewResult.status === 'complete') {
      await setSession(previewResult.tokens)
    }
    return { result: previewResult, usedPreviewMember: true }
  }

  return { result: passwordResult, usedPreviewMember: false }
}
