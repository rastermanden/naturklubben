import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReadByAvatars } from './ReadByAvatars'

afterEach(cleanup)

const reader = (id: string, name: string) => ({
  id,
  name,
  avatarUrl: null,
  color: '#16a34a',
})

describe('ReadByAvatars (#294)', () => {
  it('viser intet uden læsere', () => {
    const { container } = render(<ReadByAvatars readers={[]} isOwn={false} />)
    expect(container.textContent).toBe('')
  })

  it('har navnene som etiket og viser dem ved et tryk', () => {
    render(
      <ReadByAvatars
        readers={[reader('a', 'Alice'), reader('b', 'Bob')]}
        isOwn
      />,
    )
    const button = screen.getByRole('button', { name: 'Set af Alice og Bob' })
    expect(screen.queryByText('Set af Alice og Bob')).toBeNull()
    fireEvent.click(button)
    expect(screen.getByText('Set af Alice og Bob')).toBeTruthy()
  })

  it('viser højst fem avatarer og tæller resten', () => {
    render(
      <ReadByAvatars
        readers={['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n) => reader(n, n))}
        isOwn={false}
      />,
    )
    expect(screen.getByText('+2')).toBeTruthy()
  })
})
