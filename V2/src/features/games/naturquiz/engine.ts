/**
 * Naturquiz -- reglerne.
 *
 * Som Tetris, Kaptajn Kaper og 2048 er alt her rene funktioner: en runde
 * bygges med `startGame(rng)`, og hvert svar ændrer tilstanden med
 * `answerQuestion` og `nextQuestion`. Terningen -- hvilke ti arter det bliver,
 * og i hvilken rækkefølge svarmulighederne står -- kommer udefra som en `Rng`,
 * så en hel runde kan spilles igennem i en test uden at gætte på et kast.
 *
 * En runde er ti spørgsmål. Hvert spørgsmål viser ét billede og fire
 * svarmuligheder: den rigtige art og tre forkerte fra samme kategori (fugl,
 * plante eller spor), så mulighederne ligner hinanden nok til at være et
 * rigtigt spørgsmål. Et rigtigt svar giver point for selve svaret, en bonus
 * for at svare hurtigt, og en bonus for i træk at have svaret rigtigt (en
 * "streak"). Et forkert svar -- eller intet svar inden tiden løber ud -- giver
 * ingen point og nulstiller stregen.
 */

import { speciesBank, speciesByCategory, type Species } from './bank'

export type Rng = () => number

/** Antal spørgsmål i en runde. */
export const QUESTIONS_PER_ROUND = 10

/** Svarmuligheder pr. spørgsmål: den rigtige og tre forkerte. */
export const OPTIONS_PER_QUESTION = 4

/** Hvor lang tid der er til at svare, før det tæller som forkert. */
export const QUESTION_TIME_LIMIT_MS = 15000

/** Point for et rigtigt svar, uanset hastighed og streak. */
export const BASE_POINTS = 100

/** Den højeste hastighedsbonus -- givet for et svar med det samme. */
export const MAX_SPEED_BONUS = 50

/** Bonus pr. rigtigt svar i træk, ganget med streakens længde *før* dette svar. */
export const STREAK_BONUS_PER_LEVEL = 10

export interface Question {
  species: Species
  /** De fire muligheder, i den rækkefølge de skal vises -- allerede blandet. */
  options: readonly Species[]
  correctId: string
}

export interface QuestionResult {
  /** `null`, hvis tiden løb ud, uden at der blev svaret. */
  choiceId: string | null
  correct: boolean
  /** Millisekunder brugt på at svare, brugt til hastighedsbonussen. */
  elapsedMs: number
  points: number
}

export type GameStatus = 'idle' | 'running' | 'over'

export interface NaturquizState {
  status: GameStatus
  questions: readonly Question[]
  /** Index i `questions` for det spørgsmål, der vises nu. */
  index: number
  score: number
  correctCount: number
  streak: number
  maxStreak: number
  /** Resultatet af det spørgsmål, der lige er besvaret. Nulstilles af
   *  `nextQuestion`, så et nyt svar kan afgives. */
  lastResult: QuestionResult | null
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function buildQuestion(
  species: Species,
  categoryPool: readonly Species[],
  rng: Rng,
): Question {
  const distractorPool = categoryPool.filter((other) => other.id !== species.id)
  const distractors = shuffle(distractorPool, rng).slice(
    0,
    OPTIONS_PER_QUESTION - 1,
  )
  const options = shuffle([species, ...distractors], rng)
  return { species, options, correctId: species.id }
}

/**
 * Ti spørgsmål, trukket uden gengangere fra artsbanken. Kategoriens andre
 * arter bruges som forkerte svar -- en art, der er alene i sin kategori i
 * banken, kan ikke stilles som spørgsmål, fordi der ikke er tre forkerte svar
 * at vælge imellem.
 */
export function createRound(
  rng: Rng,
  bank: readonly Species[] = speciesBank,
  count: number = QUESTIONS_PER_ROUND,
): Question[] {
  const byCategory = new Map<string, Species[]>()
  for (const species of bank) {
    const list = byCategory.get(species.category) ?? []
    list.push(species)
    byCategory.set(species.category, list)
  }

  const eligible = bank.filter(
    (species) =>
      (byCategory.get(species.category)?.length ?? 0) >= OPTIONS_PER_QUESTION,
  )
  const chosen = shuffle(eligible, rng).slice(0, count)

  return chosen.map((species) =>
    buildQuestion(species, byCategory.get(species.category) ?? [species], rng),
  )
}

export function createGame(): NaturquizState {
  return {
    status: 'idle',
    questions: [],
    index: 0,
    score: 0,
    correctCount: 0,
    streak: 0,
    maxStreak: 0,
    lastResult: null,
  }
}

export function startGame(
  rng: Rng,
  bank: readonly Species[] = speciesBank,
): NaturquizState {
  return {
    ...createGame(),
    status: 'running',
    questions: createRound(rng, bank),
  }
}

export function currentQuestion(state: NaturquizState): Question | null {
  return state.questions[state.index] ?? null
}

function speedBonus(elapsedMs: number): number {
  const remaining = QUESTION_TIME_LIMIT_MS - elapsedMs
  const fraction = Math.max(0, Math.min(1, remaining / QUESTION_TIME_LIMIT_MS))
  return Math.round(MAX_SPEED_BONUS * fraction)
}

/** Point for et rigtigt svar: grundpoint, hastighedsbonus og streakbonus, hvor
 *  streakbonussen regnes af, hvor lang stregen var *før* dette svar. */
function pointsForAnswer(elapsedMs: number, streakBefore: number): number {
  const cappedStreak = Math.min(streakBefore, QUESTIONS_PER_ROUND - 1)
  return (
    BASE_POINTS + speedBonus(elapsedMs) + STREAK_BONUS_PER_LEVEL * cappedStreak
  )
}

/**
 * Svar på det spørgsmål, der vises nu. Et svar, der allerede har fået sit
 * resultat, kan ikke besvares igen -- man skal videre til næste spørgsmål
 * først. `choiceId` er `null`, hvis tiden løb ud, uden at spilleren nåede at
 * vælge noget.
 */
export function answerQuestion(
  state: NaturquizState,
  choiceId: string | null,
  elapsedMs: number,
): NaturquizState {
  if (state.status !== 'running' || state.lastResult) return state

  const question = currentQuestion(state)
  if (!question) return state

  const correct = choiceId !== null && choiceId === question.correctId
  const points = correct ? pointsForAnswer(elapsedMs, state.streak) : 0
  const streak = correct ? state.streak + 1 : 0

  return {
    ...state,
    score: state.score + points,
    correctCount: state.correctCount + (correct ? 1 : 0),
    streak,
    maxStreak: Math.max(state.maxStreak, streak),
    lastResult: { choiceId, correct, elapsedMs, points },
  }
}

/** Videre til næste spørgsmål -- eller enden af runden, hvis det var det sidste. */
export function nextQuestion(state: NaturquizState): NaturquizState {
  if (state.status !== 'running' || !state.lastResult) return state

  const index = state.index + 1
  if (index >= state.questions.length) {
    return { ...state, status: 'over', index, lastResult: null }
  }
  return { ...state, index, lastResult: null }
}

export { speciesBank, speciesByCategory }
export type { Species, SpeciesCategory } from './bank'
