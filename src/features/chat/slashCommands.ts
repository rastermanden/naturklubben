import type { MessageType } from './useMessages'

const SLAP_COMMAND_PATTERN = /^\/slap(?:[ \t]+(.+))?$/i
const ME_COMMAND_PATTERN = /^\/me[ \t]+(.+)$/i
const SHRUG_COMMAND_PATTERN = /^\/shrug(?:[ \t]+(.+))?$/i
const HELP_COMMAND_PATTERN = /^\/help$/i
const AWAY_COMMAND_PATTERN = /^\/away(?:[ \t]+(.+))?$/i
const BACK_COMMAND_PATTERN = /^\/back$/i
const POLL_COMMAND_PATTERN = /^\/afstemning(?:[ \t]+([\s\S]+))?$/i

const SHRUG = '¯\\_(ツ)_/¯'

// Samme grænser som migrationen 20260913170000_chat_polls.sql håndhæver i
// databasen (polls.question og poll_options.label) -- parseren skal afvise
// en for lang afstemning med en venlig besked, før den overhovedet når
// create_poll og rammer et check-constraint-brud.
export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 6
export const POLL_QUESTION_MAX_LENGTH = 300
export const POLL_OPTION_MAX_LENGTH = 200

// En kommando ender enten som en besked i chatten ('message'), en afstemning
// ('poll', som klienten sender som besked og derefter kalder create_poll
// for), en fejlbesked, kun afsenderen ser ('error') eller en lokal virkning,
// kun afsenderen ser -- mIRC's kommandoer var begge dele.
export type ParsedCommand =
  | { kind: 'message'; content: string; messageType: MessageType }
  | { kind: 'poll'; question: string; options: string[] }
  | { kind: 'help' }
  | { kind: 'away'; message: string | null }
  | { kind: 'back' }
  | { kind: 'error'; message: string }

// mIRC's klassiske "/slap <nick>" tager bare den resterende tekst som mål --
// uden at slå navnet op mod nogen medlemsliste. Samme her: kommandoen virker,
// selv med et mål, der ikke findes. "/me <tekst>" er samme handlingsbesked,
// bare med brugerens egen formulering; uden tekst er der ingen handling at
// vise, så den sendes som almindelig besked. "/shrug" er derimod ingen
// handling, men brugerens egen besked med et skuldertræk sat bagpå -- den
// sendes derfor som almindelig besked.
export function parseChatCommand(rawInput: string): ParsedCommand | null {
  const input = rawInput.trim()

  const slap = SLAP_COMMAND_PATTERN.exec(input)
  if (slap) {
    const target = slap[1]?.trim()
    return {
      kind: 'message',
      messageType: 'action',
      content: target
        ? `slår ${target} rundt med en stor ørred`
        : 'slår rundt med en stor ørred',
    }
  }

  const me = ME_COMMAND_PATTERN.exec(input)
  if (me) {
    return { kind: 'message', messageType: 'action', content: me[1].trim() }
  }

  const shrug = SHRUG_COMMAND_PATTERN.exec(input)
  if (shrug) {
    const text = shrug[1]?.trim()
    return {
      kind: 'message',
      messageType: 'text',
      content: text ? `${text} ${SHRUG}` : SHRUG,
    }
  }

  if (HELP_COMMAND_PATTERN.test(input)) return { kind: 'help' }

  const away = AWAY_COMMAND_PATTERN.exec(input)
  if (away) return { kind: 'away', message: away[1]?.trim() ?? null }

  if (BACK_COMMAND_PATTERN.test(input)) return { kind: 'back' }

  const poll = POLL_COMMAND_PATTERN.exec(input)
  if (poll) return parsePollCommand(poll[1])

  return null
}

// "/afstemning <spørgsmål> | <svar 1> | <svar 2> [| ...]": spørgsmål og svar
// adskilles af '|', ligesom en tabel-række -- ugyldig eller tom input giver
// en venlig fejl i stedet for en tavs afvisning eller et databasefejlsvar.
function parsePollCommand(rawArguments: string | undefined): ParsedCommand {
  const usageError: ParsedCommand = {
    kind: 'error',
    message:
      'Brug /afstemning <spørgsmål> | <svar 1> | <svar 2> [| ...] -- med mellem ' +
      `${POLL_MIN_OPTIONS} og ${POLL_MAX_OPTIONS} svar.`,
  }

  const rest = rawArguments?.trim()
  if (!rest) return usageError

  const parts = rest.split('|').map((part) => part.trim())
  const [question, ...options] = parts

  if (!question) return usageError
  if (question.length > POLL_QUESTION_MAX_LENGTH) {
    return {
      kind: 'error',
      message: `Spørgsmålet må højst være ${POLL_QUESTION_MAX_LENGTH} tegn.`,
    }
  }

  if (options.some((option) => option.length === 0)) {
    return { kind: 'error', message: 'Svarmulighederne må ikke være tomme.' }
  }

  if (options.length < POLL_MIN_OPTIONS || options.length > POLL_MAX_OPTIONS) {
    return {
      kind: 'error',
      message: `En afstemning skal have mellem ${POLL_MIN_OPTIONS} og ${POLL_MAX_OPTIONS} svar.`,
    }
  }

  if (options.some((option) => option.length > POLL_OPTION_MAX_LENGTH)) {
    return {
      kind: 'error',
      message: `Hvert svar må højst være ${POLL_OPTION_MAX_LENGTH} tegn.`,
    }
  }

  const uniqueOptions = new Set(options.map((option) => option.toLowerCase()))
  if (uniqueOptions.size !== options.length) {
    return {
      kind: 'error',
      message: 'To svar i samme afstemning må ikke være ens.',
    }
  }

  return { kind: 'poll', question, options }
}

export interface SlashCommand {
  command: string
  usage: string
  description: string
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    command: '/afstemning',
    usage: '/afstemning <spørgsmål> | <svar 1> | <svar 2> [| ...]',
    description: `Opretter en afstemning med ${POLL_MIN_OPTIONS}-${POLL_MAX_OPTIONS} svar`,
  },
  {
    command: '/away',
    usage: '/away [besked]',
    description: 'Markerer dig som væk for de andre online',
  },
  {
    command: '/back',
    usage: '/back',
    description: 'Fjerner væk-markeringen igen',
  },
  {
    command: '/help',
    usage: '/help',
    description: 'Viser denne liste, kun for dig selv',
  },
  {
    command: '/me',
    usage: '/me <tekst>',
    description: 'Skriver en handling om dig selv',
  },
  {
    command: '/shrug',
    usage: '/shrug [tekst]',
    description: `Sætter ${SHRUG} bag på beskeden`,
  },
  {
    command: '/slap',
    usage: '/slap [navn]',
    description: 'Slår navnet rundt med en stor ørred',
  },
]

export function helpText(): string {
  return [
    'Kommandoer i chatten:',
    ...SLASH_COMMANDS.map(
      (command) => `${command.usage} — ${command.description}`,
    ),
    'Kun du kan se dette svar.',
  ].join('\n')
}

export interface SlashCommandHint extends SlashCommand {
  completion: string
  isComplete: boolean
}

// Hintene vises, mens kommandonavnet skrives ("/", "/sl", "/slap"), og det
// matchende bliver stående, mens resten skrives ("/slap Bo") -- men kun hvis
// navnet er skrevet færdigt, så "/slapping" ikke ser ud som en kommando.
export function matchSlashCommandHints(rawInput: string): SlashCommandHint[] {
  const text = rawInput.trimStart()
  if (!text.startsWith('/')) return []

  const [typedWord] = text.split(/[ \t]/, 1)
  const typed = typedWord.toLowerCase()
  const hasArguments = text.length > typedWord.length

  return SLASH_COMMANDS.filter((command) =>
    hasArguments
      ? typed === command.command
      : command.command.startsWith(typed),
  ).map((command) => ({
    ...command,
    completion: `${command.command} `,
    isComplete: typed === command.command,
  }))
}
