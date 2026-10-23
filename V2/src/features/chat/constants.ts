/**
 * Faste farver og det faste reaktionssæt til chatten.
 *
 * Reaktionssættet spejler unionen i `convex/tables/chat.ts`: backend'en afviser
 * en emoji, der ikke står der, og rækkefølgen her er den, vælgeren viser dem i.
 * Farverne er de samme som i den gamle app -- `profiles.chatColor` har
 * `#16a34a` som standard, og et tidligere medlem har ingen profil og får den
 * neutrale grå.
 */
export const DEFAULT_CHAT_COLOR = '#16a34a'
export const FORMER_MEMBER_COLOR = '#64748b'

export const REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '🙏'] as const

export type ReactionEmoji = (typeof REACTION_EMOJI)[number]

/**
 * Sort eller hvid tekst på en given baggrundsfarve, efter hvor lys farven er.
 * En boble i en lys chatfarve skal ikke have hvid tekst på.
 *
 * Beregningen er WCAG's relative luminans; grænsen 0,6 er valgt, så de
 * grønne og gule farver i paletten får mørk tekst og de blå og røde får lys.
 */
export function readableTextColor(background: string): string {
  const hex = background.replace('#', '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((character) => character + character)
          .join('')
      : hex
  if (full.length !== 6) return '#0f172a'

  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(full.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance =
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  return luminance > 0.6 ? '#0f172a' : '#ffffff'
}
