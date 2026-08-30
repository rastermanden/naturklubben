import { describe, expect, it } from 'vitest'
import { findLinkMatches, splitLinks } from './linkify'

describe('findLinkMatches', () => {
  it('finds an https link', () => {
    expect(findLinkMatches('Se https://naturklubben.dk for mere')).toEqual([
      { start: 3, end: 26, href: 'https://naturklubben.dk' },
    ])
  })

  it('finds a www-link without a scheme and prefixes https for the href', () => {
    expect(findLinkMatches('www.dr.dk har en artikel')).toEqual([
      { start: 0, end: 9, href: 'https://www.dr.dk' },
    ])
  })

  it('strips trailing sentence punctuation that is not part of the link', () => {
    expect(findLinkMatches('Kig her: https://dr.dk.')).toEqual([
      { start: 9, end: 22, href: 'https://dr.dk' },
    ])
  })

  it('strips a closing parenthesis that wraps the link', () => {
    expect(findLinkMatches('(se https://dr.dk)')).toEqual([
      { start: 4, end: 17, href: 'https://dr.dk' },
    ])
  })

  it('keeps a closing parenthesis that belongs to the link itself', () => {
    const text = 'https://da.wikipedia.org/wiki/Ørred_(fisk)'
    expect(findLinkMatches(text)).toEqual([
      { start: 0, end: text.length, href: text },
    ])
  })

  it('finds several links in the same message', () => {
    expect(
      findLinkMatches('https://dr.dk og https://naturklubben.dk'),
    ).toHaveLength(2)
  })

  it('is empty for a message without a link', () => {
    expect(findLinkMatches('Vi ses ved søen')).toEqual([])
  })
})

describe('splitLinks', () => {
  it('splits text around a link', () => {
    expect(splitLinks('Se https://dr.dk for nyheder')).toEqual([
      { text: 'Se ', href: null },
      { text: 'https://dr.dk', href: 'https://dr.dk' },
      { text: ' for nyheder', href: null },
    ])
  })

  it('leaves text without a link alone', () => {
    expect(splitLinks('Vi ses ved søen')).toEqual([
      { text: 'Vi ses ved søen', href: null },
    ])
  })

  it('leaves an empty string alone', () => {
    expect(splitLinks('')).toEqual([{ text: '', href: null }])
  })
})
