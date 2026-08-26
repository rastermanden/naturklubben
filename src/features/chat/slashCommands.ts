const SLAP_COMMAND_PATTERN = /^\/slap(?:[ \t]+(.+))?$/i

export interface ParsedActionCommand {
  content: string
}

// mIRC's klassiske "/slap <nick>" tager bare den resterende tekst som mål --
// uden at slå navnet op mod nogen medlemsliste. Samme her: kommandoen virker,
// selv med et mål, der ikke findes.
export function parseSlapCommand(rawInput: string): ParsedActionCommand | null {
  const match = SLAP_COMMAND_PATTERN.exec(rawInput.trim())
  if (!match) return null

  const target = match[1]?.trim()
  return {
    content: target
      ? `slår ${target} rundt med en stor ørred`
      : 'slår rundt med en stor ørred',
  }
}
