/**
 * 7-kabale -- reglerne.
 *
 * Klassisk Klondike: syv rækker, en bunke, en talon og fire grundbunker.
 * Rækkerne bygges nedad i skiftende farve, og kun en konge må ligge på en tom
 * række. Grundbunkerne bygges op i samme kulør, fra es til konge. Man trækker
 * ét eller tre kort fra bunken; kun det øverste kort på talonen må spilles.
 *
 * Et træk er en ren funktion. Terningen bruges kun, når kortene gives, så det
 * samme parti kan spilles igennem i en test. Uret hører til i hooket;
 * `scoreFor` får tiden udefra.
 *
 * `lines` på resultatlisten er antal træk, `level` er 1 eller 3 (hvor mange
 * kort der trækkes). Loftet står også i `game_scores_score_plausible` for
 * `kabale` (se migrationen `20261101160000_game_scores_kabale.sql`).
 *
 * Point undervejs følger den udbredte tælling: 10 for et kort lagt hjem, 5
 * for et kort fra talonen til en række, 5 for et kort der vendes, −15 for et
 * kort fra en grundbunke tilbage til en række, og et fradrag når bunken
 * vendes. Et vundet parti får derudover et tids-tillæg og, for træk 3, et
 * tillæg fordi den variant er sværere. Tallet kan ikke overstige `SCORE_CAP`.
 */

export type Rng = () => number

export const SUITS = ['hjerter', 'ruder', 'klør', 'spar'] as const
export type Suit = (typeof SUITS)[number]
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13
export type DrawCount = 1 | 3

export const TABLEAU_COLUMNS = 7
export const DECK_SIZE = 52

/** Højeste pointtal et parti kan lægge på listen. Hold i sync med migrationen. */
export const SCORE_CAP = 2000

/** Sekunder, tids-tillægget regnes ned fra. Et øjeblikkeligt parti får det hele. */
export const TIME_BONUS_START = 600

/** Tillæg for træk 3. Træk 1 er lettere og får det ikke. */
export const DRAW3_BONUS = 400

export const POINTS = {
  toFoundation: 10,
  wasteToTableau: 5,
  flip: 5,
  foundationToTableau: -15,
  recycleDraw1: -100,
  recycleDraw3: -20,
} as const

export interface Card {
  /** 0..51. Kulør skifter for hver 13, rang ligger i resten. */
  id: number
  suit: Suit
  rank: Rank
  faceUp: boolean
}

export type Zone =
  | { kind: 'stock' }
  | { kind: 'waste' }
  | { kind: 'foundation'; index: number }
  | { kind: 'tableau'; index: number }

export interface Move {
  from: Zone
  to: Zone
  /** Antal kort fra toppen af kilden. 1 for talon, grundbunke og ét træk. */
  count: number
}

interface Snapshot {
  tableau: Card[][]
  foundations: Card[][]
  stock: Card[]
  waste: Card[]
  moves: number
  points: number
}

export interface GameState {
  status: 'playing' | 'won'
  drawCount: DrawCount
  /** Syv rækker. Index 0 er nederst, sidste kort er øverst. */
  tableau: Card[][]
  /** Fire grundbunker. En tom bunke tager et es; derefter samme kulør opad. */
  foundations: Card[][]
  /** Kortbunken, bagsiden opad. Sidste kort trækkes først. */
  stock: Card[]
  /** Talonen, forsiden opad. Sidste kort er det, man må spille. */
  waste: Card[]
  moves: number
  /** Point undervejs, før tids-tillæg. Kan være negativ, hvis bunken vendes ofte. */
  points: number
  /** Billeder taget før hvert træk, nyeste sidst. Uden deres egen historik. */
  history: Snapshot[]
}

export type Action =
  | { type: 'move'; move: Move }
  | { type: 'draw' }
  | { type: 'undo' }
  | { type: 'toFoundation'; from: Zone }

const SUIT_SYMBOL: Record<Suit, string> = {
  hjerter: '♥',
  ruder: '♦',
  klør: '♣',
  spar: '♠',
}

const MAX_HISTORY = 200
const AUTO_STEPS = 120
const SEARCH_NODES = 4000

export function isRed(suit: Suit): boolean {
  return suit === 'hjerter' || suit === 'ruder'
}

export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOL[suit]
}

/** Kortets rang, som den står i hjørnet. To tegn er det længste, der er plads til. */
export function rankShort(rank: Rank): string {
  if (rank === 1) return 'E'
  if (rank === 11) return 'Kn'
  if (rank === 12) return 'D'
  if (rank === 13) return 'K'
  return String(rank)
}

export function rankLabel(rank: Rank): string {
  if (rank === 1) return 'es'
  if (rank === 11) return 'knægt'
  if (rank === 12) return 'dame'
  if (rank === 13) return 'konge'
  return String(rank)
}

export function cardLabel(card: Card): string {
  return `${card.suit} ${rankLabel(card.rank)}`
}

export function drawName(level: number): string {
  return level === 3 ? 'træk 3' : 'træk 1'
}

export function topCard(cards: readonly Card[]): Card | undefined {
  return cards[cards.length - 1]
}

function emptyFoundations(): Card[][] {
  return [[], [], [], []]
}

function emptyTableau(): Card[][] {
  return Array.from({ length: TABLEAU_COLUMNS }, () => [])
}

export function freshDeck(): Card[] {
  const deck: Card[] = []
  SUITS.forEach((suit, suitIndex) => {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({
        id: suitIndex * 13 + (rank - 1),
        suit,
        rank: rank as Rank,
        faceUp: false,
      })
    }
  })
  return deck
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

/**
 * Giv et parti. Række n (0-indekseret) får n+1 kort, og kun det øverste ligger
 * med forsiden opad. De resterende 24 kort ligger i bunken.
 */
export function deal(drawCount: DrawCount, rng: Rng): GameState {
  const deck = shuffle(freshDeck(), rng)
  const tableau = emptyTableau()
  let cursor = 0
  for (let column = 0; column < TABLEAU_COLUMNS; column++) {
    for (let row = 0; row <= column; row++) {
      const card = deck[cursor++]
      tableau[column].push({ ...card, faceUp: row === column })
    }
  }
  const stock = deck.slice(cursor).map((card) => ({ ...card, faceUp: false }))
  return {
    status: 'playing',
    drawCount,
    tableau,
    foundations: emptyFoundations(),
    stock,
    waste: [],
    moves: 0,
    points: 0,
    history: [],
  }
}

function isSequence(cards: readonly Card[]): boolean {
  if (cards.length === 0) return false
  for (let i = 0; i < cards.length; i++) {
    if (!cards[i].faceUp) return false
    if (i === 0) continue
    const below = cards[i - 1]
    const above = cards[i]
    if (isRed(below.suit) === isRed(above.suit)) return false
    if (below.rank !== above.rank + 1) return false
  }
  return true
}

function canPlaceOnTableau(card: Card, target: Card | undefined): boolean {
  if (!target) return card.rank === 13
  return (
    isRed(card.suit) !== isRed(target.suit) && card.rank + 1 === target.rank
  )
}

function canPlaceOnFoundation(card: Card, pile: readonly Card[]): boolean {
  const top = topCard(pile)
  if (!top) return card.rank === 1
  return card.suit === top.suit && card.rank === top.rank + 1
}

function sameZone(a: Zone, b: Zone): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'tableau' && b.kind === 'tableau') return a.index === b.index
  if (a.kind === 'foundation' && b.kind === 'foundation') {
    return a.index === b.index
  }
  return true
}

/** Kortene, trækket løfter, læst fra toppen. `null`, hvis de ikke kan løftes. */
function liftedCards(state: GameState, move: Move): Card[] | null {
  const { from, count } = move
  if (from.kind === 'waste') {
    if (count !== 1 || state.waste.length === 0) return null
    const card = topCard(state.waste)
    return card ? [card] : null
  }
  if (from.kind === 'foundation') {
    if (count !== 1) return null
    const pile = state.foundations[from.index]
    const card = pile ? topCard(pile) : undefined
    return card ? [card] : null
  }
  if (from.kind === 'tableau') {
    const column = state.tableau[from.index]
    if (!column || count > column.length) return null
    const cards = column.slice(column.length - count)
    return isSequence(cards) ? cards : null
  }
  return null
}

function isDrawMove(move: Move): boolean {
  return move.from.kind === 'stock' && move.to.kind === 'waste'
}

function isRecycleMove(move: Move): boolean {
  return move.from.kind === 'waste' && move.to.kind === 'stock'
}

export function isLegal(state: GameState, move: Move): boolean {
  if (state.status !== 'playing' || move.count < 1) return false
  if (isDrawMove(move)) {
    return (
      state.stock.length > 0 &&
      move.count === Math.min(state.drawCount, state.stock.length)
    )
  }
  if (isRecycleMove(move)) {
    return state.stock.length === 0 && move.count === state.waste.length
  }
  if (sameZone(move.from, move.to)) return false

  const cards = liftedCards(state, move)
  if (!cards) return false
  const bottom = cards[0]

  if (move.to.kind === 'tableau') {
    const column = state.tableau[move.to.index]
    if (!column) return false
    return canPlaceOnTableau(bottom, topCard(column))
  }
  if (move.to.kind === 'foundation') {
    if (cards.length !== 1) return false
    const pile = state.foundations[move.to.index]
    if (!pile) return false
    return canPlaceOnFoundation(bottom, pile)
  }
  return false
}

/**
 * Kan kortet — eller serien fra `start` og op — løftes? Bagsiden kan ikke,
 * og en serie skal hænge sammen i skiftende farve.
 */
export function canLift(state: GameState, zone: Zone, start = 0): boolean {
  if (state.status !== 'playing') return false
  if (zone.kind === 'waste') return state.waste.length > 0 && start === 0
  if (zone.kind === 'foundation') {
    return state.foundations[zone.index]?.length > 0 && start === 0
  }
  if (zone.kind === 'tableau') {
    const column = state.tableau[zone.index]
    if (!column || start < 0 || start >= column.length) return false
    return isSequence(column.slice(start))
  }
  return false
}

/** Hvad et tryk på bunken gør lige nu. `null`, når der ikke er noget at vende. */
export function stockAction(state: GameState): 'draw' | 'recycle' | null {
  if (state.status !== 'playing') return null
  if (state.stock.length > 0) return 'draw'
  if (state.waste.length > 0) return 'recycle'
  return null
}

function movePoints(state: GameState, move: Move): number {
  if (isRecycleMove(move)) {
    return state.drawCount === 3 ? POINTS.recycleDraw3 : POINTS.recycleDraw1
  }
  if (move.to.kind === 'foundation') return POINTS.toFoundation
  if (move.from.kind === 'waste' && move.to.kind === 'tableau') {
    return POINTS.wasteToTableau
  }
  if (move.from.kind === 'foundation' && move.to.kind === 'tableau') {
    return POINTS.foundationToTableau
  }
  return 0
}

function snapshotOf(state: GameState): Snapshot {
  return {
    tableau: state.tableau,
    foundations: state.foundations,
    stock: state.stock,
    waste: state.waste,
    moves: state.moves,
    points: state.points,
  }
}

/**
 * Udfør et lovligt træk uden at lægge resten hjem og uden at røre historikken.
 * Giver `null`, når trækket ikke er lovligt. Pile deles, kortene muteres ikke.
 */
function applyRaw(state: GameState, move: Move): GameState | null {
  if (!isLegal(state, move)) return null

  const tableau = state.tableau.map((column) => column.slice())
  const foundations = state.foundations.map((pile) => pile.slice())
  let stock = state.stock.slice()
  let waste = state.waste.slice()
  let points = state.points + movePoints(state, move)

  if (isDrawMove(move)) {
    const drawn = stock.splice(stock.length - move.count, move.count).reverse()
    waste = waste.concat(drawn.map((card) => ({ ...card, faceUp: true })))
  } else if (isRecycleMove(move)) {
    stock = waste
      .slice()
      .reverse()
      .map((card) => ({ ...card, faceUp: false }))
    waste = []
  } else {
    const cards = removeLifted(tableau, foundations, waste, move)
    if (!cards) return null
    if (move.from.kind === 'waste') waste = cards.rest
    if (move.from.kind === 'tableau') {
      const column = tableau[move.from.index]
      const exposed = column[column.length - 1]
      if (exposed && !exposed.faceUp) {
        column[column.length - 1] = { ...exposed, faceUp: true }
        points += POINTS.flip
      }
    }
    putCards(tableau, foundations, cards.lifted, move.to)
  }

  return {
    ...state,
    tableau,
    foundations,
    stock,
    waste,
    points,
    moves: state.moves + 1,
  }
}

function removeLifted(
  tableau: Card[][],
  foundations: Card[][],
  waste: Card[],
  move: Move,
): { lifted: Card[]; rest: Card[] } | null {
  if (move.from.kind === 'waste') {
    const lifted = waste.slice(-move.count)
    return { lifted, rest: waste.slice(0, -move.count) }
  }
  if (move.from.kind === 'foundation') {
    const pile = foundations[move.from.index]
    const lifted = pile.slice(-move.count)
    foundations[move.from.index] = pile.slice(0, -move.count)
    return { lifted, rest: waste }
  }
  if (move.from.kind === 'tableau') {
    const column = tableau[move.from.index]
    const lifted = column.slice(-move.count)
    tableau[move.from.index] = column.slice(0, -move.count)
    return { lifted, rest: waste }
  }
  return null
}

function putCards(
  tableau: Card[][],
  foundations: Card[][],
  cards: Card[],
  to: Zone,
) {
  if (to.kind === 'tableau') {
    tableau[to.index] = tableau[to.index].concat(cards)
    return
  }
  if (to.kind === 'foundation') {
    foundations[to.index] = foundations[to.index].concat(cards)
  }
}

/** Udfør et træk og gem billedet, så det kan fortrydes. Uden auto-afslutning. */
export function applyMove(state: GameState, move: Move): GameState {
  const next = applyRaw(state, move)
  if (!next) return state
  return {
    ...next,
    history: [...state.history, snapshotOf(state)].slice(-MAX_HISTORY),
  }
}

export function isWon(state: GameState): boolean {
  return state.foundations.every((pile) => pile.length === 13)
}

/**
 * Alle 52 kort ligger med forsiden opad, og bunken er tom. Først da kan
 * resten lægges hjem, uden at man gætter på et lukket kort.
 */
export function allFaceUp(state: GameState): boolean {
  if (state.stock.length > 0) return false
  let count = state.waste.length
  for (const pile of state.foundations) count += pile.length
  for (const column of state.tableau) {
    for (const card of column) {
      if (!card.faceUp) return false
      count += 1
    }
  }
  return count === DECK_SIZE
}

function finishIfWon(state: GameState): GameState {
  if (!isWon(state) || state.status === 'won') return state
  return { ...state, status: 'won' }
}

function undo(state: GameState): GameState {
  const previous = state.history[state.history.length - 1]
  if (!previous || state.status === 'won') return state
  return {
    ...state,
    ...previous,
    status: 'playing',
    history: state.history.slice(0, -1),
  }
}

function drawMove(state: GameState): Move | null {
  const action = stockAction(state)
  if (action === 'draw') {
    return {
      from: { kind: 'stock' },
      to: { kind: 'waste' },
      count: Math.min(state.drawCount, state.stock.length),
    }
  }
  if (action === 'recycle') {
    return {
      from: { kind: 'waste' },
      to: { kind: 'stock' },
      count: state.waste.length,
    }
  }
  return null
}

/** Læg det øverste kort hjem. En serie kan ikke gå samlet på grundbunken. */
function foundationMoveFrom(state: GameState, from: Zone): Move | null {
  if (from.kind === 'stock') return null
  for (let index = 0; index < 4; index++) {
    const move: Move = { from, to: { kind: 'foundation', index }, count: 1 }
    if (isLegal(state, move)) return move
  }
  return null
}

/**
 * Ét træk. Et vundet parti står stille — også for fortryd — så et resultat på
 * listen ikke hører til et parti, der stadig kan spilles videre.
 */
export function reduce(state: GameState, action: Action): GameState {
  if (action.type === 'undo') return undo(state)
  if (state.status !== 'playing') return state

  if (action.type === 'draw') {
    const move = drawMove(state)
    return move ? commit(state, move) : state
  }
  if (action.type === 'toFoundation') {
    const move = foundationMoveFrom(state, action.from)
    return move ? commit(state, move) : state
  }
  return commit(state, action.move)
}

function commit(state: GameState, move: Move): GameState {
  const stepped = applyMove(state, move)
  if (stepped === state) return state
  if (!allFaceUp(stepped)) return finishIfWon(stepped)
  const finished = autoFinish(stepped)
  if (finished.status === 'won') {
    // Hele udlægningen er ét fortryd-skridt: billedet fra før spillerens træk.
    return { ...finished, history: stepped.history }
  }
  return finishIfWon(stepped)
}

/**
 * Læg resten hjem, når alle kort er vendt. Giver den samme tilstand tilbage,
 * hvis det ikke kan lade sig gøre — så står partiet, som spilleren forlod det.
 */
export function autoFinish(state: GameState): GameState {
  if (state.status === 'won') return state
  if (!allFaceUp(state)) return state
  if (isWon(state)) return { ...state, status: 'won' }
  const solved = runAuto(state)
  if (!solved || !isWon(solved)) return state
  return { ...solved, status: 'won', history: state.history }
}

interface Budget {
  nodes: number
}

function runAuto(state: GameState): GameState | null {
  let current = state
  const seen = new Set<string>()
  const budget: Budget = { nodes: 0 }
  let previous: Move | null = null
  for (let step = 0; step < AUTO_STEPS; step++) {
    if (isWon(current)) return current
    const key = positionKey(current)
    if (seen.has(key)) return null
    seen.add(key)
    const move = chooseAutoMove(current, budget, previous)
    if (!move) return null
    const next = applyRaw(current, move)
    if (!next || positionKey(next) === key) return null
    previous = move
    current = next
  }
  return isWon(current) ? current : null
}

function chooseAutoMove(
  state: GameState,
  budget: Budget,
  previous: Move | null,
): Move | null {
  const candidates = [
    lowestFoundationMove(state, true),
    uncoverNeeded(state),
    borrowParent(state),
    wasteToTableau(state),
    searchTowardFoundation(state, budget),
    lowestFoundationMove(state, false),
  ]
  for (const move of candidates) {
    if (!move) continue
    // Lige efter at en konge er lånt fra grundbunken, skal den ikke lægges
    // hjem igen, før det kort, den blev hentet til, er flyttet.
    if (previous && reverses(previous, move)) continue
    return move
  }
  return null
}

function reverses(previous: Move, next: Move): boolean {
  return (
    previous.count === next.count &&
    zoneKey(previous.from) === zoneKey(next.to) &&
    zoneKey(previous.to) === zoneKey(next.from)
  )
}

function zoneKey(zone: Zone): string {
  if (zone.kind === 'tableau' || zone.kind === 'foundation') {
    return `${zone.kind}:${zone.index}`
  }
  return zone.kind
}

function movedCard(state: GameState, move: Move): Card | null {
  return liftedCards(state, move)?.[0] ?? null
}

function lowestFoundationMove(
  state: GameState,
  safeOnly: boolean,
): Move | null {
  const candidates: Move[] = []
  const sources: Zone[] = []
  if (state.waste.length > 0) sources.push({ kind: 'waste' })
  state.tableau.forEach((column, index) => {
    if (column.length > 0) sources.push({ kind: 'tableau', index })
  })
  for (const from of sources) {
    for (let index = 0; index < 4; index++) {
      const move: Move = { from, to: { kind: 'foundation', index }, count: 1 }
      if (!isLegal(state, move)) continue
      if (safeOnly && !isSafeFoundation(state, move)) continue
      candidates.push(move)
    }
  }
  candidates.sort((a, b) => {
    const cardA = movedCard(state, a)
    const cardB = movedCard(state, b)
    const rankA = cardA?.rank ?? 99
    const rankB = cardB?.rank ?? 99
    if (rankA !== rankB) return rankA - rankB
    if (a.from.kind === b.from.kind) return 0
    return a.from.kind === 'waste' ? -1 : 1
  })
  return candidates[0] ?? null
}

function suitRank(state: GameState, suit: Suit): number {
  for (const pile of state.foundations) {
    const top = topCard(pile)
    if (top?.suit === suit) return top.rank
  }
  return 0
}

/**
 * Et kort må gerne hjem, når de modsatte kulører er mindst én under det.
 * Så mangler ingen en plads at bygge videre på i rækkerne. Es og toere er
 * altid sikre.
 */
function isSafeFoundation(state: GameState, move: Move): boolean {
  const card = movedCard(state, move)
  if (!card) return false
  if (card.rank <= 2) return true
  const opposite: Suit[] = isRed(card.suit)
    ? ['klør', 'spar']
    : ['hjerter', 'ruder']
  return opposite.every((suit) => suitRank(state, suit) >= card.rank - 1)
}

interface Located {
  zone: Zone
  /** Plads i bunken, regnet fra bunden. */
  index: number
  depth: number
}

function locate(state: GameState, suit: Suit, rank: Rank): Located | null {
  const wasteIndex = state.waste.findIndex(
    (card) => card.suit === suit && card.rank === rank,
  )
  if (wasteIndex >= 0) {
    return {
      zone: { kind: 'waste' },
      index: wasteIndex,
      depth: state.waste.length - 1 - wasteIndex,
    }
  }
  for (let column = 0; column < state.tableau.length; column++) {
    const index = state.tableau[column].findIndex(
      (card) => card.suit === suit && card.rank === rank,
    )
    if (index >= 0) {
      return {
        zone: { kind: 'tableau', index: column },
        index,
        depth: state.tableau[column].length - 1 - index,
      }
    }
  }
  return null
}

function neededTargets(state: GameState): { suit: Suit; rank: Rank }[] {
  const targets: { suit: Suit; rank: Rank }[] = []
  for (const suit of SUITS) {
    const rank = suitRank(state, suit) + 1
    if (rank <= 13) targets.push({ suit, rank: rank as Rank })
  }
  targets.sort((a, b) => a.rank - b.rank)
  return targets
}

function uncoverNeeded(state: GameState): Move | null {
  for (const target of neededTargets(state)) {
    const place = locate(state, target.suit, target.rank)
    if (!place || place.depth === 0 || place.zone.kind !== 'tableau') continue
    const move = moveOff(state, place.zone.index, place.index)
    if (move) return move
  }
  return null
}

/** Flyt det, der ligger over `buriedIndex`, hen et sted, det må ligge. */
function moveOff(
  state: GameState,
  columnIndex: number,
  buriedIndex: number,
): Move | null {
  const column = state.tableau[columnIndex]
  for (let start = buriedIndex + 1; start < column.length; start++) {
    const cards = column.slice(start)
    if (!isSequence(cards)) continue
    const destinations = tableauDestinations(state, cards[0], columnIndex)
    if (destinations.length === 0) continue
    return {
      from: { kind: 'tableau', index: columnIndex },
      to: { kind: 'tableau', index: destinations[0] },
      count: cards.length,
    }
  }
  return null
}

function tableauDestinations(
  state: GameState,
  card: Card,
  avoid: number | null,
): number[] {
  const filled: number[] = []
  const empty: number[] = []
  for (let index = 0; index < state.tableau.length; index++) {
    if (index === avoid) continue
    const column = state.tableau[index]
    const top = topCard(column)
    if (!canPlaceOnTableau(card, top)) continue
    if (column.length === 0) empty.push(index)
    else filled.push(index)
  }
  // En fyldt række først, så den sidste tomme række bliver fri til en konge.
  return filled.concat(empty)
}

/**
 * Det kort, der spærrer, har ingen plads i rækkerne. Hent dets forældre —
 * typisk en konge — ned fra en grundbunke, så serien kan flyttes.
 */
function borrowParent(state: GameState): Move | null {
  for (const target of neededTargets(state)) {
    const place = locate(state, target.suit, target.rank)
    if (!place || place.depth === 0 || place.zone.kind !== 'tableau') continue
    const column = state.tableau[place.zone.index]
    let start = column.length - 1
    while (start - 1 > place.index && isSequence(column.slice(start - 1))) {
      start -= 1
    }
    const blocker = column[start]
    if (!blocker) continue
    if (tableauDestinations(state, blocker, place.zone.index).length > 0) {
      continue
    }
    const borrowed = foundationParentMove(state, blocker)
    if (borrowed) return borrowed
  }
  return null
}

function foundationParentMove(state: GameState, card: Card): Move | null {
  const neededRank = card.rank + 1
  if (neededRank > 13) return null
  for (let index = 0; index < state.foundations.length; index++) {
    const top = topCard(state.foundations[index])
    if (!top || top.rank !== neededRank) continue
    if (isRed(top.suit) === isRed(card.suit)) continue
    const destinations = tableauDestinations(state, top, null)
    if (destinations.length === 0) continue
    const move: Move = {
      from: { kind: 'foundation', index },
      to: { kind: 'tableau', index: destinations[0] },
      count: 1,
    }
    if (isLegal(state, move)) return move
  }
  return null
}

function wasteToTableau(state: GameState): Move | null {
  const card = topCard(state.waste)
  if (!card) return null
  const destinations = tableauDestinations(state, card, null)
  if (destinations.length === 0) return null
  return {
    from: { kind: 'waste' },
    to: { kind: 'tableau', index: destinations[0] },
    count: 1,
  }
}

function positionKey(state: GameState): string {
  const pile = (cards: readonly Card[]) =>
    cards.map((card) => card.id).join('.')
  return [
    pile(state.stock),
    pile(state.waste),
    state.foundations.map(pile).join('/'),
    state.tableau.map(pile).join('/'),
  ].join('|')
}

function rearrangementMoves(state: GameState): Move[] {
  const moves: Move[] = []
  for (let from = 0; from < state.tableau.length; from++) {
    const column = state.tableau[from]
    for (let start = 0; start < column.length; start++) {
      const count = column.length - start
      for (let to = 0; to < state.tableau.length; to++) {
        if (to === from) continue
        const move: Move = {
          from: { kind: 'tableau', index: from },
          to: { kind: 'tableau', index: to },
          count,
        }
        if (isLegal(state, move)) moves.push(move)
      }
    }
  }
  if (state.waste.length > 0) {
    for (let to = 0; to < state.tableau.length; to++) {
      const move: Move = {
        from: { kind: 'waste' },
        to: { kind: 'tableau', index: to },
        count: 1,
      }
      if (isLegal(state, move)) moves.push(move)
    }
  }
  return moves
}

/**
 * Find det korteste skridt hen mod et sikkert kort, der må hjem. Bruges, når
 * det næste es eller den næste toer ligger begravet, og et enkelt løft ikke
 * rækker.
 */
function searchTowardFoundation(state: GameState, budget: Budget): Move | null {
  interface Node {
    state: GameState
    first: Move | null
  }
  const queue: Node[] = [{ state, first: null }]
  const seen = new Set<string>([positionKey(state)])
  let head = 0
  while (head < queue.length && budget.nodes < SEARCH_NODES) {
    const node = queue[head++]
    budget.nodes += 1
    for (const move of rearrangementMoves(node.state)) {
      const next = applyRaw(node.state, move)
      if (!next) continue
      const key = positionKey(next)
      if (seen.has(key)) continue
      seen.add(key)
      const first = node.first ?? move
      if (lowestFoundationMove(next, true)) return first
      queue.push({ state: next, first })
    }
  }
  return null
}

/**
 * Pointene, et vundet parti lægger på listen. Tids-tillægget falder med
 * sekunderne, træk 3 får et fast tillæg, og tallet klemmes ind i loftet.
 */
export function scoreFor(
  points: number,
  drawCount: DrawCount,
  durationSeconds: number,
): number {
  const timeBonus = Math.max(0, TIME_BONUS_START - Math.max(0, durationSeconds))
  const modeBonus = drawCount === 3 ? DRAW3_BONUS : 0
  const raw = points + timeBonus + modeBonus
  return Math.max(1, Math.min(SCORE_CAP, raw))
}
