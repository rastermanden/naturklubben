import type { ClearEvent } from './engine'

const LINE_NAMES = ['', 'enkelt', 'dobbelt', 'trippel', 'Tetris'] as const

/**
 * Sætningen, der både står på brættet og bliver læst op, når en brik har
 * ryddet noget. Den er sin egen funktion, fordi den skal være til at læse --
 * og til at teste -- uden et bræt.
 */
export function describeClear(event: ClearEvent): string {
  const parts: string[] = []

  if (event.tSpin !== 'none') {
    const kind = event.tSpin === 'mini' ? 'Mini T-spin' : 'T-spin'
    parts.push(event.lines === 0 ? kind : `${kind} ${LINE_NAMES[event.lines]}`)
  } else if (event.lines === 4) {
    parts.push('Tetris!')
  } else if (event.lines > 0) {
    const name = LINE_NAMES[event.lines]
    parts.push(name.charAt(0).toUpperCase() + name.slice(1))
  }

  if (parts.length === 0) return ''
  if (event.backToBack) parts.push('i træk')
  if (event.combo > 0) parts.push(`kæde x${event.combo + 1}`)

  return `${parts.join(' ')} -- ${event.points} point`
}
