import { describe, expect, it } from 'vitest'
import {
  ProbationSubmissionError,
  toFriendlyProbationApplicationError,
  toProbationSubmissionError,
} from './probationErrors'

describe('probation submission errors', () => {
  it('parses rate-limit responses and shows an understandable wait', async () => {
    const parsed = await toProbationSubmissionError({
      context: new Response(
        JSON.stringify({
          code: 'rate_limited',
          retryAfterSeconds: 848,
        }),
        {
          status: 429,
          headers: { 'Retry-After': '848' },
        },
      ),
    })

    expect(parsed).toBeInstanceOf(ProbationSubmissionError)
    expect(toFriendlyProbationApplicationError(parsed)).toBe(
      'Der er sendt for mange ansøgninger. Prøv igen om cirka 15 minutter.',
    )
  })

  it('uses Retry-After when the response body has no duration', async () => {
    const parsed = await toProbationSubmissionError({
      context: new Response(JSON.stringify({ code: 'rate_limited' }), {
        status: 429,
        headers: { 'Retry-After': '3600' },
      }),
    })

    expect(toFriendlyProbationApplicationError(parsed)).toBe(
      'Der er sendt for mange ansøgninger. Prøv igen om cirka 1 time.',
    )
  })

  it('maps validation and backend failures without exposing server details', async () => {
    const invalid = await toProbationSubmissionError({
      context: new Response(JSON.stringify({ code: 'invalid_request' }), {
        status: 400,
      }),
    })
    const unavailable = await toProbationSubmissionError({
      context: new Response(
        JSON.stringify({
          code: 'temporarily_unavailable',
          detail: 'sensitive backend detail',
        }),
        { status: 503 },
      ),
    })

    expect(toFriendlyProbationApplicationError(invalid)).toBe(
      'Kontrollér felterne og notifikationstilladelsen, og prøv igen.',
    )
    expect(toFriendlyProbationApplicationError(unavailable)).toBe(
      'Ansøgningen kan ikke sendes lige nu. Prøv igen om lidt.',
    )
    expect(toFriendlyProbationApplicationError(unavailable)).not.toContain(
      'sensitive',
    )
  })

  it('keeps admin authorization and missing-row errors distinct', () => {
    expect(toFriendlyProbationApplicationError({ code: '42501' })).toBe(
      'Du har ikke rettigheder til at behandle ansøgningen.',
    )
    expect(toFriendlyProbationApplicationError({ code: 'P0002' })).toBe(
      'Ansøgningen blev ikke fundet. Opdater siden og prøv igen.',
    )
  })
})
