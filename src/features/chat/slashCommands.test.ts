import { describe, expect, it } from 'vitest'
import { matchSlashCommandHints, parseActionCommand } from './slashCommands'

describe('parseActionCommand', () => {
  it('builds a slap action with the typed target', () => {
    expect(parseActionCommand('/slap Bo')).toEqual({
      content: 'slår Bo rundt med en stor ørred',
    })
  })

  it('builds a slap action with no target', () => {
    expect(parseActionCommand('/slap')).toEqual({
      content: 'slår rundt med en stor ørred',
    })
  })

  it('builds an action from /me with the typed text', () => {
    expect(parseActionCommand('/me kigger efter fiskehejren')).toEqual({
      content: 'kigger efter fiskehejren',
    })
  })

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseActionCommand('  /SLAP   Ada  ')).toEqual({
      content: 'slår Ada rundt med en stor ørred',
    })
    expect(parseActionCommand('  /ME   vinker  ')).toEqual({
      content: 'vinker',
    })
  })

  it('does not treat an unrelated message as a command', () => {
    expect(parseActionCommand('/slapping around')).toBeNull()
    expect(parseActionCommand('/mere kaffe tak')).toBeNull()
    expect(parseActionCommand('Skal vi mødes ved søen?')).toBeNull()
  })

  it('leaves a bare /me as a normal message', () => {
    expect(parseActionCommand('/me')).toBeNull()
  })
})

describe('matchSlashCommandHints', () => {
  it('suggests every command while the slash is alone', () => {
    expect(matchSlashCommandHints('/').map((hint) => hint.command)).toEqual([
      '/me',
      '/slap',
    ])
  })

  it('narrows the suggestions as the name is typed', () => {
    expect(matchSlashCommandHints('  /SL')).toEqual([
      {
        command: '/slap',
        usage: '/slap [navn]',
        description: 'Slår navnet rundt med en stor ørred',
        completion: '/slap ',
        isComplete: false,
      },
    ])
    expect(matchSlashCommandHints('/m').map((hint) => hint.command)).toEqual([
      '/me',
    ])
  })

  it('marks the hint complete once the name is fully typed', () => {
    expect(matchSlashCommandHints('/slap')[0].isComplete).toBe(true)
    expect(matchSlashCommandHints('/slap Bo')[0].isComplete).toBe(true)
    expect(matchSlashCommandHints('/me vinker')[0].command).toBe('/me')
  })

  it('drops the hints for anything that is not a command', () => {
    expect(matchSlashCommandHints('/slapping around')).toEqual([])
    expect(matchSlashCommandHints('/xyz')).toEqual([])
    expect(matchSlashCommandHints('Skal vi mødes ved søen?')).toEqual([])
    expect(matchSlashCommandHints('')).toEqual([])
  })
})
