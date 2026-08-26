import { describe, expect, it } from 'vitest'
import { parseSlapCommand } from './slashCommands'

describe('parseSlapCommand', () => {
  it('builds an action with the typed target', () => {
    expect(parseSlapCommand('/slap Bo')).toEqual({
      content: 'slår Bo rundt med en stor ørred',
    })
  })

  it('builds an action with no target', () => {
    expect(parseSlapCommand('/slap')).toEqual({
      content: 'slår rundt med en stor ørred',
    })
  })

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseSlapCommand('  /SLAP   Ada  ')).toEqual({
      content: 'slår Ada rundt med en stor ørred',
    })
  })

  it('does not treat an unrelated message as a command', () => {
    expect(parseSlapCommand('/slapping around')).toBeNull()
    expect(parseSlapCommand('Skal vi mødes ved søen?')).toBeNull()
  })
})
