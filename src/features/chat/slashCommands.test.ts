import { describe, expect, it } from 'vitest'
import {
  helpText,
  matchSlashCommandHints,
  parseChatCommand,
  SLASH_COMMANDS,
} from './slashCommands'

describe('parseChatCommand', () => {
  it('builds a slap action with the typed target', () => {
    expect(parseChatCommand('/slap Bo')).toEqual({
      kind: 'message',
      messageType: 'action',
      content: 'slår Bo rundt med en stor ørred',
    })
  })

  it('builds a slap action with no target', () => {
    expect(parseChatCommand('/slap')).toEqual({
      kind: 'message',
      messageType: 'action',
      content: 'slår rundt med en stor ørred',
    })
  })

  it('builds an action from /me with the typed text', () => {
    expect(parseChatCommand('/me kigger efter fiskehejren')).toEqual({
      kind: 'message',
      messageType: 'action',
      content: 'kigger efter fiskehejren',
    })
  })

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseChatCommand('  /SLAP   Ada  ')).toEqual({
      kind: 'message',
      messageType: 'action',
      content: 'slår Ada rundt med en stor ørred',
    })
    expect(parseChatCommand('  /ME   vinker  ')).toEqual({
      kind: 'message',
      messageType: 'action',
      content: 'vinker',
    })
    expect(parseChatCommand('  /SHRUG   nå  ')).toEqual({
      kind: 'message',
      messageType: 'text',
      content: 'nå ¯\\_(ツ)_/¯',
    })
  })

  it('does not treat an unrelated message as a command', () => {
    expect(parseChatCommand('/slapping around')).toBeNull()
    expect(parseChatCommand('/mere kaffe tak')).toBeNull()
    expect(parseChatCommand('/shrugging it off')).toBeNull()
    expect(parseChatCommand('Skal vi mødes ved søen?')).toBeNull()
  })

  it('leaves a bare /me as a normal message', () => {
    expect(parseChatCommand('/me')).toBeNull()
  })

  it('appends a shrug as an ordinary message, not an action', () => {
    expect(parseChatCommand('/shrug det ved jeg ikke')).toEqual({
      kind: 'message',
      messageType: 'text',
      content: 'det ved jeg ikke ¯\\_(ツ)_/¯',
    })
    expect(parseChatCommand('/shrug')).toEqual({
      kind: 'message',
      messageType: 'text',
      content: '¯\\_(ツ)_/¯',
    })
    expect(parseChatCommand('/shrugging')).toBeNull()
  })
})

describe('parseChatCommand: lokale kommandoer', () => {
  it('parses /help', () => {
    expect(parseChatCommand('/help')).toEqual({ kind: 'help' })
    expect(parseChatCommand('/help mig')).toBeNull()
  })

  it('parses /away with and without a reason', () => {
    expect(parseChatCommand('/away til frokost')).toEqual({
      kind: 'away',
      message: 'til frokost',
    })
    expect(parseChatCommand('/away')).toEqual({ kind: 'away', message: null })
  })

  it('parses /back', () => {
    expect(parseChatCommand('  /BACK ')).toEqual({ kind: 'back' })
    expect(parseChatCommand('/back snart')).toBeNull()
  })
})

describe('helpText', () => {
  it('lists every command with its usage', () => {
    const text = helpText()
    for (const command of SLASH_COMMANDS) {
      expect(text).toContain(command.usage)
      expect(text).toContain(command.description)
    }
  })
})

describe('matchSlashCommandHints', () => {
  it('suggests every command while the slash is alone', () => {
    expect(matchSlashCommandHints('/').map((hint) => hint.command)).toEqual([
      '/away',
      '/back',
      '/help',
      '/me',
      '/shrug',
      '/slap',
    ])
  })

  it('narrows the suggestions as the name is typed', () => {
    expect(matchSlashCommandHints('/s').map((hint) => hint.command)).toEqual([
      '/shrug',
      '/slap',
    ])
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

  it('keeps the hint while an argument is typed', () => {
    expect(matchSlashCommandHints('/away til frokost')).toEqual([
      {
        command: '/away',
        usage: '/away [besked]',
        description: 'Markerer dig som væk for de andre online',
        completion: '/away ',
        isComplete: true,
      },
    ])
  })

  it('drops the hints for anything that is not a command', () => {
    expect(matchSlashCommandHints('/slapping around')).toEqual([])
    expect(matchSlashCommandHints('/xyz')).toEqual([])
    expect(matchSlashCommandHints('Skal vi mødes ved søen?')).toEqual([])
    expect(matchSlashCommandHints('')).toEqual([])
  })
})
