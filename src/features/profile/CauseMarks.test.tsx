import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CauseMarks } from './CauseMarks'

afterEach(cleanup)

describe('CauseMarks', () => {
  it('samler mærkerne i ét navn til skærmlæseren', () => {
    render(<CauseMarks causes={['ukraine', 'regnbue']} />)
    const marks = screen.getByRole('img', {
      name: 'Støtter Ukraine, Regnbueflag',
    })
    expect(marks.textContent).toBe('🇺🇦 🏳️‍🌈')
  })

  it('tegner intet uden mærker', () => {
    const { container } = render(<CauseMarks causes={[]} />)
    expect(container.innerHTML).toBe('')
  })
})
