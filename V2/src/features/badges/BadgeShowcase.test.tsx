import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../convex/_generated/dataModel'
import type { AwardedMemberBadge } from './types'

vi.mock('./useBadges', () => ({
  useMyBadges: () => [],
}))

import { BadgeShowcase } from './BadgeShowcase'

const memberBadge: AwardedMemberBadge = {
  _id: 'mb-1' as Id<'memberBadges'>,
  badgeId: 'badge-1' as Id<'badges'>,
  badgeName: 'Skovmærke',
  badgeSlug: 'skovmaerke',
  badgeDescription: 'Til den, der altid finder bålpladsen.',
  profileId: 'profile-1' as Id<'profiles'>,
  profileName: 'Modtager',
  nominatedById: 'profile-2' as Id<'profiles'>,
  nominatedByName: 'Indstiller',
  reason: 'Tændte bål i øsende regn.',
  awardedAt: new Date('2026-08-26T12:00:00.000Z').getTime(),
  imageUrl: 'https://example.test/skovmaerke.png',
  imageWidth: 2000,
  imageHeight: 1000,
  cropX: 500,
  cropY: 0,
  cropSize: 1000,
}

afterEach(cleanup)

describe('BadgeShowcase', () => {
  it('viser den gemte beskæring frem for hele billedet', () => {
    render(<BadgeShowcase badges={[memberBadge]} />)

    const image = screen
      .getByRole('button', {
        name: 'Se detaljer om Skovmærke',
      })
      .querySelector('img')!

    expect(image.getAttribute('src')).toBe(
      'https://example.test/skovmaerke.png',
    )
    expect(image.style.width).toBe('200%')
    expect(image.style.left).toBe('-50%')
  })

  it('viser dato, indstiller, beskrivelse og begrundelse ved klik og lukker igen', () => {
    render(<BadgeShowcase badges={[memberBadge]} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Se detaljer om Skovmærke' }),
    )

    const dialog = screen.getByRole('dialog', { name: 'Skovmærke' })
    expect(dialog).toBeTruthy()
    expect(
      screen.getByText('Til den, der altid finder bålpladsen.'),
    ).toBeTruthy()
    expect(screen.getByText(/Tildelt 26\. august 2026/)).toBeTruthy()
    expect(screen.getByText('Indstillet af Indstiller')).toBeTruthy()
    expect(screen.getByText('Tændte bål i øsende regn.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Luk' }))
    expect(screen.queryByRole('dialog')).toBeNull()
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
