import { describe, expect, it } from 'vitest'
import {
  PRONOUNS_MAX_LENGTH,
  PRONOUNS_UNDISCLOSED,
  PRONOUN_GROUPS,
  displayPronouns,
  hasAnsweredPronouns,
  isListedPronouns,
  normalizePronouns,
} from './pronouns'

describe('normalizePronouns', () => {
  it('trimmer og folder mellemrum, så databasens constraint holder', () => {
    expect(normalizePronouns('  hun /  hende ')).toBe('hun / hende')
  })

  it('gør tomt til null -- "ikke udfyldt" er null, ikke en tom streng', () => {
    expect(normalizePronouns('')).toBeNull()
    expect(normalizePronouns('   ')).toBeNull()
    expect(normalizePronouns(null)).toBeNull()
    expect(normalizePronouns(undefined)).toBeNull()
  })

  it('klipper til databasens grænse uden at efterlade et mellemrum i enden', () => {
    const long = `${'a'.repeat(PRONOUNS_MAX_LENGTH - 1)} bbbb`
    const result = normalizePronouns(long)
    expect(result).toBe('a'.repeat(PRONOUNS_MAX_LENGTH - 1))
    expect(result!.length).toBeLessThanOrEqual(PRONOUNS_MAX_LENGTH)
  })
})

describe('displayPronouns', () => {
  it('viser det, der er valgt eller skrevet', () => {
    expect(displayPronouns('de/dem')).toBe('de/dem')
    expect(displayPronouns('hen/hens 🌿')).toBe('hen/hens 🌿')
  })

  it('viser intet for "vil ikke oplyse" og for det, der ikke er udfyldt', () => {
    expect(displayPronouns(PRONOUNS_UNDISCLOSED)).toBeNull()
    expect(displayPronouns(null)).toBeNull()
    expect(displayPronouns(undefined)).toBeNull()
  })
})

describe('hasAnsweredPronouns', () => {
  it('tæller "vil ikke oplyse" som et svar, så påmindelsen holder op', () => {
    expect(hasAnsweredPronouns(PRONOUNS_UNDISCLOSED)).toBe(true)
    expect(hasAnsweredPronouns('hun/hende')).toBe(true)
    expect(hasAnsweredPronouns(null)).toBe(false)
    expect(hasAnsweredPronouns(undefined)).toBe(false)
  })
})

describe('listen', () => {
  it('kender de valg, medlemmerne har bedt om', () => {
    for (const value of [
      'hun/hende',
      'han/ham',
      'de/dem',
      'hen/hen',
      'they/them',
      'sikker/effektiv',
    ]) {
      expect(isListedPronouns(value), value).toBe(true)
    }
    expect(isListedPronouns(PRONOUNS_UNDISCLOSED)).toBe(true)
    expect(isListedPronouns('noget helt eget')).toBe(false)
    expect(isListedPronouns(null)).toBe(false)
  })

  it('holder sig inden for databasens grænse', () => {
    for (const group of PRONOUN_GROUPS) {
      for (const option of group.options) {
        expect(option.value.length).toBeLessThanOrEqual(PRONOUNS_MAX_LENGTH)
        expect(option.value).toBe(normalizePronouns(option.value))
      }
    }
  })
})
