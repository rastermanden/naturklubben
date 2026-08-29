const SLAP_COMMAND_PATTERN = /^\/slap(?:[ \t]+(.+))?$/i
const ME_COMMAND_PATTERN = /^\/me[ \t]+(.+)$/i

export interface ParsedActionCommand {
  content: string
}

// mIRC's klassiske "/slap <nick>" tager bare den resterende tekst som mål --
// uden at slå navnet op mod nogen medlemsliste. Samme her: kommandoen virker,
// selv med et mål, der ikke findes. "/me <tekst>" er samme handlingsbesked,
// bare med brugerens egen formulering; uden tekst er der ingen handling at
// vise, så den sendes som almindelig besked.
export function parseActionCommand(
  rawInput: string,
): ParsedActionCommand | null {
  const input = rawInput.trim()

  const slap = SLAP_COMMAND_PATTERN.exec(input)
  if (slap) {
    const target = slap[1]?.trim()
    return {
      content: target
        ? `slår ${target} rundt med en stor ørred`
        : 'slår rundt med en stor ørred',
    }
  }

  const me = ME_COMMAND_PATTERN.exec(input)
  if (me) return { content: me[1].trim() }

  return null
}

export interface SlashCommandHint {
  command: string
  usage: string
  description: string
  completion: string
  isComplete: boolean
}

const SLASH_COMMANDS: Omit<SlashCommandHint, 'completion' | 'isComplete'>[] = [
  {
    command: '/me',
    usage: '/me <tekst>',
    description: 'Skriver en handling om dig selv',
  },
  {
    command: '/slap',
    usage: '/slap [navn]',
    description: 'Slår navnet rundt med en stor ørred',
  },
]

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
