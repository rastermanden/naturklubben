import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Badge, MemberBadge } from './types'

vi.mock('./useBadges', () => ({
  badgeImageUrl: (path: string) => `https://example.test/${path}`,
}))

import { BadgeShowcase } from './BadgeShowcase'

const badge: Badge = {
  id: 'badge-1',
  slug: 'bonderoeven',
  name: 'Bonderøven',
  description: 'Til den, der har flest kartofler.',
  image_path: 'badge-1/original-abc.png',
  image_width: 2000,
  image_height: 1000,
  image_mime_type: 'image/png',
  crop_x: 500,
  crop_y: 0,
  crop_size: 1000,
  diameter_mm: 58,
  bleed_mm: 5,
  print_path: 'badge-1/print-1.png',
  print_status: 'ready',
  print_error: null,
  print_started_at: '2026-08-26T10:00:10.000Z',
  is_active: true,
  created_at: '2026-08-26T10:00:00.000Z',
  updated_at: '2026-08-26T10:00:20.000Z',
}

const memberBadge: MemberBadge = {
  id: 'member-badge-1',
  badge_id: badge.id,
  profile_id: 'member-1',
  nominated_by: 'member-2',
  reason: 'Han gravede hele marken op i hånden.',
  awarded_at: '2026-08-26T12:00:00.000Z',
  badges: badge,
}

afterEach(cleanup)

describe('BadgeShowcase', () => {
  it('viser den gemte beskæring frem for hele billedet', () => {
    render(<BadgeShowcase badges={[memberBadge]} />)

    const image = screen
      .getByRole('button', {
        name: 'Se detaljer om Bonderøven',
      })
      .querySelector('img')!

    expect(image.getAttribute('src')).toBe(
      'https://example.test/badge-1/original-abc.png',
    )
    // Udsnittet er halvdelen af billedets bredde og starter midt i det.
    expect(image.style.width).toBe('200%')
    expect(image.style.left).toBe('-50%')
  })

  it('viser dato, indstiller og begrundelse ved klik', () => {
    render(
      <BadgeShowcase
        badges={[memberBadge]}
        nameFor={(id) => (id === 'member-2' ? 'Kasper' : null)}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Se detaljer om Bonderøven' }),
    )

    const dialog = screen.getByRole('dialog', { name: 'Bonderøven' })
    expect(dialog).toBeTruthy()
    expect(screen.getByText(/Tildelt 26\. august 2026/)).toBeTruthy()
    expect(screen.getByText('Indstillet af Kasper')).toBeTruthy()
    expect(
      screen.getByText('Han gravede hele marken op i hånden.'),
    ).toBeTruthy()
  })

  it('siger ingenting, når medlemmet ingen badges har', () => {
    const { container } = render(<BadgeShowcase badges={[]} />)

    expect(container.textContent).toBe('')
  })

  it('kan fortælle, at vitrinen er tom, når profilen beder om det', () => {
    render(<BadgeShowcase badges={[]} emptyText="Du har ingen badges endnu." />)

    expect(screen.getByText('Du har ingen badges endnu.')).toBeTruthy()
  })
})
