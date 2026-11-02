/**
 * Fugletræk -- reglerne.
 *
 * Et vendespil (par): et bræt af kort med bagsiden opad. Hvert kort viser en
 * dansk naturart som et tegn (ingen billedfiler, som i de andre spil). Man
 * vender to kort ad gangen; to ens bliver liggende åbne, to forskellige vendes
 * tilbage. Når hele brættet er vendt, er partiet klaret. Færre vendinger og
 * kortere tid giver flere point.
 *
 * Tre klasser, som Stifinderens baner:
 *
 *   let (level 1)         6 par   (12 kort)
 *   mellemsvær (level 2)  8 par   (16 kort)
 *   svær (level 3)        10 par  (20 kort)
 *
 * `lines` på resultatlisten er antal vendinger (en "vending" = et par kort
 * vendt), som "træk" i Kaptajn Kaper. Færrest mulige vendinger er antallet af
 * par: man rammer et nyt par hver gang. `level` er klassen.
 *
 * Loftet er sat, så de tre klasser kan ligge på samme liste -- de samme tal
 * som Stifinderen: en let giver højst 1.200, en mellemsvær 3.600 og en svær
 * 6.000. Et perfekt parti (færrest mulige vendinger, øjeblikkeligt) rammer
 * loftet. Tallene står også i `game_scores_score_plausible` for `fugletraek`
 * (se migrationen `20261008090000_game_scores_fugletraek.sql`).
 *
 * Som i de andre spil er en vending en ren funktion. Terningen bruges kun, når
 * brættet lægges, så det samme bræt kan spilles igennem i en test. Uret hører
 * til i hooket; `scoreFor` får tiden udefra.
 */

export type Rng = () => number

export type GameClass = 1 | 2 | 3

/** Antal par pr. klasse. Det halve af kortene, og færrest mulige vendinger. */
export const CLASS_PAIRS = { 1: 6, 2: 8, 3: 10 } as const satisfies Record<
  GameClass,
  number
>

/** Højeste pointtal for et perfekt parti. Hold i sync med migrationen. */
export const CLASS_MAX_SCORE = {
  1: 1200,
  2: 3600,
  3: 6000,
} as const satisfies Record<GameClass, number>

/** Referencetid pr. par i point-formlen: tiden tæller herfra. */
const SECONDS_PER_PAIR = 4

/**
 * De danske naturarter, kortene kan vise. Kun tegn -- ingen filer at hente, og
 * de virker i begge temaer. Der skal være mindst `CLASS_PAIRS[3]` af dem.
 */
export const SPECIES: readonly { id: string; symbol: string; name: string }[] =
  [
    { id: 'raev', symbol: '🦊', name: 'Ræv' },
    { id: 'raadyr', symbol: '🦌', name: 'Rådyr' },
    { id: 'ugle', symbol: '🦉', name: 'Ugle' },
    { id: 'egern', symbol: '🐿️', name: 'Egern' },
    { id: 'pindsvin', symbol: '🦔', name: 'Pindsvin' },
    { id: 'frø', symbol: '🐸', name: 'Frø' },
    { id: 'and', symbol: '🦆', name: 'And' },
    { id: 'svane', symbol: '🦢', name: 'Svane' },
    { id: 'bi', symbol: '🐝', name: 'Bi' },
    { id: 'sommerfugl', symbol: '🦋', name: 'Sommerfugl' },
    { id: 'snegl', symbol: '🐌', name: 'Snegl' },
    { id: 'svamp', symbol: '🍄', name: 'Svamp' },
  ]

export interface Card {
  /** Pladsen på brættet. Stabil nøgle, selv når to kort har samme art. */
  id: number
  /** Artens id: to kort med samme `kind` er et par. */
  kind: string
  symbol: string
  name: string
  matched: boolean
}

export type Status = 'idle' | 'running' | 'over'

export interface FugletraekState {
  status: Status
  level: GameClass
  cards: Card[]
  /** Kort vendt op lige nu, som ikke er fundet som par (0, 1 eller 2 stk.). */
  flipped: number[]
  /** To forskellige kort ligger åbne og venter på at blive vendt tilbage. */
  mismatch: boolean
  /** Antal vendinger (par kort vendt). Færrest mulige er antallet af par. */
  flips: number
  matchedPairs: number
}

export type Action = { type: 'flip'; index: number } | { type: 'clearMismatch' }

export function className(level: number): string {
  if (level === 1) return 'let'
  if (level === 2) return 'mellemsvær'
  if (level === 3) return 'svær'
  return 'klasse'
}

export function classTitle(level: number): string {
  if (level === 1) return 'Let'
  if (level === 2) return 'Mellemsvær'
  if (level === 3) return 'Svær'
  return 'Klasse'
}

/**
 * Point: hvor tæt på det perfekte parti man kom. To faktorer, begge højst 1 --
 * forholdet mellem færrest mulige vendinger og de faktiske, og hvor hurtigt
 * det gik. Et perfekt parti (par vendinger, 0 sekunder) rammer loftet; alt
 * andet ligger under. Resultatet rundes aldrig op over loftet, for det tal
 * afviser databasen.
 */
export function scoreFor(
  level: GameClass,
  flips: number,
  elapsed: number,
): number {
  const pairs = CLASS_PAIRS[level]
  if (flips < pairs || elapsed < 0) return 0
  const flipRatio = pairs / flips
  const ref = pairs * SECONDS_PER_PAIR
  const timeRatio = ref / (ref + elapsed)
  const score = Math.round(CLASS_MAX_SCORE[level] * flipRatio * timeRatio)
  return Math.min(score, CLASS_MAX_SCORE[level])
}

/** Blander en kopi af listen (Fisher-Yates) med den givne terning. */
function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = items.slice()
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function mulberry32(seed: number): Rng {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Bygger og blander et bræt for klassen. */
export function startGame(level: GameClass, rng: Rng): FugletraekState {
  const pairs = CLASS_PAIRS[level]
  const chosen = shuffle(SPECIES, rng).slice(0, pairs)
  const deck = shuffle(
    chosen.flatMap((species) => [species, species]),
    rng,
  )
  const cards: Card[] = deck.map((species, index) => ({
    id: index,
    kind: species.id,
    symbol: species.symbol,
    name: species.name,
    matched: false,
  }))
  return {
    status: 'running',
    level,
    cards,
    flipped: [],
    mismatch: false,
    flips: 0,
    matchedPairs: 0,
  }
}

/** Det stille bræt, før man vælger en klasse. */
export function createGame(): FugletraekState {
  return { ...startGame(1, mulberry32(0x1b1d)), status: 'idle' }
}

export function reduce(
  state: FugletraekState,
  action: Action,
): FugletraekState {
  if (state.status !== 'running') return state

  if (action.type === 'clearMismatch') {
    if (!state.mismatch) return state
    return { ...state, flipped: [], mismatch: false }
  }

  const { index } = action
  const card = state.cards[index]
  if (!card || card.matched) return state

  // To forskellige kort ligger åbne: vend dem tilbage, og vend så det nye.
  if (state.mismatch) {
    if (state.flipped.includes(index)) return state
    return reduce({ ...state, flipped: [], mismatch: false }, action)
  }

  if (state.flipped.includes(index)) return state

  // Første kort i vendingen.
  if (state.flipped.length === 0) {
    return { ...state, flipped: [index] }
  }

  // Andet kort: vendingen er gjort.
  const first = state.cards[state.flipped[0]]
  const flips = state.flips + 1
  if (first.kind === card.kind) {
    const cards = state.cards.map((c) =>
      c.id === first.id || c.id === card.id ? { ...c, matched: true } : c,
    )
    const matchedPairs = state.matchedPairs + 1
    const won = matchedPairs === state.cards.length / 2
    return {
      ...state,
      cards,
      flipped: [],
      mismatch: false,
      flips,
      matchedPairs,
      status: won ? 'over' : 'running',
    }
  }

  // To forskellige: de bliver liggende åbne, til næste vending eller en rydning.
  return { ...state, flipped: [state.flipped[0], index], mismatch: true, flips }
}

/** Om et kort vises med forsiden opad lige nu. */
export function isFaceUp(state: FugletraekState, index: number): boolean {
  const card = state.cards[index]
  return Boolean(card && (card.matched || state.flipped.includes(index)))
}
