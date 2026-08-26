import type { BadgeProduction } from './types'

export interface ProductionDeadline {
  /** Millisekunder tilbage af de 24 timer. Negativt, når fristen er overskredet. */
  msLeft: number
  overdue: boolean
  /** Kort tekst til admin-panelet, fx "3 t 12 min tilbage". */
  label: string
}

function formatDuration(ms: number) {
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours} t ${minutes} min`
  if (minutes > 0) return `${minutes} min`
  return 'under et minut'
}

/**
 * Regner deadline om til noget, der kan læses. Fristen er 24 timer efter
 * tildelingen (badge_productions.due_at), og en overskredet opgave skal være
 * tydelig -- ikke bare et tidspunkt, der er passeret.
 */
export function productionDeadline(
  production: Pick<BadgeProduction, 'due_at' | 'status' | 'completed_at'>,
  now: number = Date.now(),
): ProductionDeadline {
  const msLeft = new Date(production.due_at).getTime() - now

  if (production.status === 'done') {
    return { msLeft, overdue: false, label: 'Færdig' }
  }
  if (msLeft <= 0) {
    return {
      msLeft,
      overdue: true,
      label: `Overskredet med ${formatDuration(-msLeft)}`,
    }
  }
  return { msLeft, overdue: false, label: `${formatDuration(msLeft)} tilbage` }
}

/** Sortering: overskredne først, derefter dem med kortest tid tilbage. */
export function compareProductions(a: BadgeProduction, b: BadgeProduction) {
  const doneA = a.status === 'done' ? 1 : 0
  const doneB = b.status === 'done' ? 1 : 0
  if (doneA !== doneB) return doneA - doneB
  return new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
}
