import { useState } from 'react'
import {
  ProbationSubmissionError,
  type ProbationSubmissionErrorCode,
} from './probationErrors'

/**
 * Indsendelsen af en ansøgning om prøvemedlemskab.
 *
 * Ansøgeren er ikke logget ind, så kaldet går ikke gennem Convex' funktions-API
 * men gennem den offentlige HTTP-rute i `convex/probation.ts`. Det er med
 * vilje: kun dér kan serveren selv se, hvor anmodningen kom fra, og derfor kan
 * rate limitingen ikke omgås ved at kalde en mutation direkte.
 *
 * Adressen kommer fra `VITE_CONVEX_SITE_URL`, hvis den er sat (Convex'
 * `.convex.site`-vært, hvor `httpAction`'erne ligger). Er den ikke, udledes den
 * af `VITE_CONVEX_URL` med samme regel som `features/calendar/feedUrl.ts`. Det
 * er ikke kosmetik: PR-previewets `npx convex deploy --cmd` sender kun
 * deploymentets URL videre til buildet, så uden udledningen ville formularen
 * være død på hvert preview.
 */
const PATH = '/proevemedlemskab'

function siteUrl() {
  const explicit = import.meta.env.VITE_CONVEX_SITE_URL
  if (typeof explicit === 'string' && explicit.length > 0) {
    return explicit.replace(/\/$/, '')
  }

  const convexUrl = import.meta.env.VITE_CONVEX_URL
  return typeof convexUrl === 'string'
    ? convexUrl.replace('.convex.cloud', '.convex.site').replace(/\/$/, '')
    : ''
}

export interface ProbationApplicationInput {
  fullName: string
  email: string
  motivation: string
  subscription: {
    endpoint: string
    p256dh: string
    auth: string
  }
}

async function errorFromResponse(
  response: Response,
): Promise<ProbationSubmissionError> {
  let code: ProbationSubmissionErrorCode = 'temporarily_unavailable'
  let retryAfterSeconds: number | undefined
  try {
    const body = (await response.json()) as {
      code?: string
      retryAfterSeconds?: number
    }
    if (body.code === 'rate_limited') code = 'rate_limited'
    else if (body.code === 'invalid_request') code = 'invalid_request'
    if (typeof body.retryAfterSeconds === 'number') {
      retryAfterSeconds = body.retryAfterSeconds
    }
  } catch {
    // Et svar uden JSON er en serverfejl, ikke en valideringsfejl.
  }
  if (retryAfterSeconds === undefined) {
    const header = Number(response.headers.get('Retry-After'))
    if (Number.isFinite(header) && header > 0) retryAfterSeconds = header
  }
  return new ProbationSubmissionError(code, retryAfterSeconds)
}

export async function submitProbationApplication(
  input: ProbationApplicationInput,
): Promise<void> {
  const base = siteUrl()
  if (base === '') {
    throw new ProbationSubmissionError('temporarily_unavailable')
  }

  let response: Response
  try {
    response = await fetch(`${base}${PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    throw new ProbationSubmissionError('temporarily_unavailable')
  }

  // 202 er det eneste svar, der betyder "modtaget". Et 400/429/503 oversættes
  // til den kode, serveren gav, så formularen kan sige hvad der er galt.
  if (response.status === 202) return
  throw await errorFromResponse(response)
}

/** Til/fra-knap og fejltekst til formularen. */
export function useSubmitProbationApplication() {
  const [isPending, setIsPending] = useState(false)

  async function submit(input: ProbationApplicationInput) {
    setIsPending(true)
    try {
      await submitProbationApplication(input)
    } finally {
      setIsPending(false)
    }
  }

  return { isPending, submit }
}
