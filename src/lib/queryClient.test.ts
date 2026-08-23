import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isPermanentClientError,
  queryClient,
  shouldRetryQuery,
} from './queryClient'

afterEach(() => {
  queryClient.clear()
  vi.restoreAllMocks()
})

describe('query error classification', () => {
  it.each([
    { status: 400 },
    { status: 403 },
    { statusCode: 404 },
    { context: { status: 401 } },
    { response: { status: 422 } },
    { code: 'PGRST116' },
    { code: 'PGRST202' },
    { code: 'PGRST301' },
    { code: '42501' },
    { code: '23505' },
    { code: 'P0001' },
    { code: 'PT404' },
  ])('recognizes permanent client error %#', (error) => {
    expect(isPermanentClientError(error)).toBe(true)
  })

  it.each([
    { status: 408 },
    { status: 425 },
    { status: 429 },
    { status: 500 },
    { context: { status: 503 } },
    { code: 'PGRST000' },
    { code: 'PGRST121' },
    { code: 'PGRST300' },
    { code: '42P17' },
    { code: '54000' },
    { code: 'PT503' },
    { code: 'XX000' },
    new TypeError('Failed to fetch'),
  ])('keeps transient or server error %# retryable', (error) => {
    expect(isPermanentClientError(error)).toBe(false)
  })
})

describe('query client defaults', () => {
  it('keeps queries fresh for 30 seconds without changing mutations', () => {
    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      staleTime: 30_000,
      retry: shouldRetryQuery,
    })
    expect(queryClient.getDefaultOptions().mutations).toBeUndefined()
  })

  it('retries transient failures at most twice', () => {
    const transientError = new TypeError('Failed to fetch')

    expect(shouldRetryQuery(0, transientError)).toBe(true)
    expect(shouldRetryQuery(1, transientError)).toBe(true)
    expect(shouldRetryQuery(2, transientError)).toBe(false)
    expect(shouldRetryQuery(0, { status: 403 })).toBe(false)
  })

  it('reports a terminal query error centrally without exposing key details', async () => {
    const error = new Error('members failed')
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    await expect(
      queryClient.fetchQuery({
        queryKey: ['members', 'private-user-id'],
        queryFn: () => Promise.reject(error),
        retry: false,
      }),
    ).rejects.toBe(error)

    expect(consoleError).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledWith('Query fejlede', {
      query: 'members',
      error,
    })
  })
})
