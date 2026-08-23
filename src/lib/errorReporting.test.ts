import { describe, expect, it } from 'vitest'
import { createClientErrorReport } from './errorReporting'

describe('createClientErrorReport', () => {
  it('omits query parameters and fragments from the reported URL', () => {
    window.history.replaceState({}, '', '/login?token=secret#callback')

    const report = createClientErrorReport(new Error('render failed'), {
      source: 'react-global',
      componentStack: 'component stack',
    })

    expect(report.url).toBe('http://localhost:3000/login')
    expect(report.message).toBe('render failed')
    expect(report.componentStack).toBe('component stack')
  })
})
