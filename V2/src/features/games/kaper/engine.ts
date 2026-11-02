/**
 * Kaptajn Kaper i Kattegat -- reglerne.
 *
 * Spillet er en genskrivning af P.O. Frederiksens GW-BASIC-spil fra 1980'erne
 * (version 1, release 4), som forfatteren selv erklærede public domain. Tallene
 * her -- hvad en fregat har af kanoner, hvor meget en salve koster, hvornår
 * fjenden stryger flaget -- er skrevet af efter den oprindelige kode, linje
 * for linje, så spillet føles, som det gjorde dengang. Hvor originalen havde en
 * åbenlys tastefejl, er den rettet; hvor den havde en særhed, er den bevaret.
 *
 * Som i Tetris er alt her rene funktioner: `reduce(state, action, rng)` tager
 * en tilstand og giver en ny. Terningen kommer udefra, så et helt parti --
 * en kanonduel, en havneindsejling, en forfremmelse -- kan spilles igennem i
 * en test uden at gætte på et kast.
 */

import {
  CLEARED,
  COPENHAGEN,
  LAND,
  MAX_X,
  MAX_Y,
  MIN_X,
  MIN_Y,
  SEA,
  START_POSITION,
  createMap,
  isPortCell,
  portById,
} from './map'
import { ENEMY_TYPES, enemyLabel, enemyNoun, type EnemyType } from './ships'

export type Rng = () => number

/** Hvad man stævner ud med. */
export const START_SHIP = {
  men: 200,
  repair: 200,
  taels: 600,
  cannon: 20,
  grain: 30,
} as const

/** Mere end det kan skibet ikke bære -- så synker det. */
export const MAX_MEN = 500
export const MAX_CANNON = 150
export const MAX_GRAIN = 700
export const MAX_TAELS = 30000

/** Chancen for at møde noget på et frit havfelt. */
export const ENCOUNTER_CHANCE = 0.25

/** Sværhedsgraden går 2, 4, 6, 8 -- og ved 10 er spillet vundet. */
export const FIRST_DIFFICULTY = 2
export const FINAL_DIFFICULTY = 10

export const AIM_MAX_ELEVATION = 30
export const AIM_MAX_SIDE = 50

/** Indsejlingen: 18 skridt ned mod molen, styrende mellem søjle 3 og 28. */
export const HARBOUR_STEPS = 18
export const HARBOUR_MIN_X = 3
export const HARBOUR_MAX_X = 28
export const HARBOUR_START_X = 15

/** Rangen følger sværhedsgraden: matros ved 2, kaptajn ved 4 ... */
export const RANKS = [
  'matros',
  'kaptajn',
  'kaptajnløjtnant',
  'kommandør',
  'admiral',
] as const

/** ... og adelstitlen, kongen giver med i købet. */
export const TITLES = [
  'borger',
  'baron',
  'greve',
  'lensgreve',
  'kongelig arving',
] as const

export const COMTESSE = 'komtesse Grevinde Fejlfuld af Møggård'
export const RIVAL = 'den skumle sir Nølebund af Gærdesgaard'

export interface Enemy {
  type: EnemyType
  taels: number
  distance: number
  repair: number
  guns: number
  men: number
  grain: number
}

export interface Wind {
  /** Sidevind: -10, 0 eller 10. Positiv driver kuglen mod venstre. */
  side: number
  /** Medvind (positiv) eller modvind (negativ): -10, 0 eller 10. */
  range: number
  /** 0..10. Er der ingen vind, er styrken 0. */
  strength: number
}

export interface Aim {
  /** Højere sigte, længere skud. -30..30. */
  elevation: number
  /** -50..50, positiv til højre. */
  side: number
}

export type ShotOutcome = 'left' | 'right' | 'short' | 'long' | 'hit'

/** Hvad der skete, da man fyrede -- inklusive fjendens svar. */
export interface ShotResult {
  outcome: ShotOutcome
  repairLost: number
  menLost: number
  cannonLost: boolean
}

export interface HarbourState {
  x: number
  /** Hvor mange skridt der er taget. Ved 18 er man ved molen. */
  row: number
  /** Skibene, der ligger for anker: (x, række). */
  ships: readonly (readonly [number, number])[]
  gapStart: number
  gapWidth: number
  /** Retningen et vindstød skubber i. */
  windDirection: -1 | 1
  lastEvent: 'hit' | 'gust' | null
}

export interface Prices {
  men: number
  repair: number
  cannon: number
  grain: number
  jewels: number
}

export type BuyItem = 'men' | 'repair' | 'cannon' | 'grain'
export type SellItem = 'cannon' | 'grain' | 'jewels'

export type Screen =
  | { kind: 'map' }
  | { kind: 'encounter'; enemy: Enemy; preface: string | null }
  | { kind: 'attack'; enemy: Enemy }
  | {
      kind: 'cannon'
      enemy: Enemy
      aim: Aim
      wind: Wind
      shot: ShotResult | null
    }
  | { kind: 'boarding'; enemy: Enemy; enemyDead: number; ownDead: number }
  | {
      kind: 'surrender'
      enemy: Enemy
      survivors: number
      grain: number
      prizeCrew: number
    }
  | { kind: 'mist' }
  | { kind: 'harbourIntro'; port: number; windDirection: -1 | 1 }
  | { kind: 'harbour'; port: number; harbour: HarbourState }
  | {
      kind: 'port'
      port: number
      prices: Prices
      arrival: string[] | null
      notice: string | null
    }
  | { kind: 'report'; title: string; lines: string[] }
  | { kind: 'over'; title: string; lines: string[] }

export type GameStatus = 'idle' | 'running' | 'over'

export interface KaperState {
  status: GameStatus
  captain: string
  x: number
  y: number
  map: readonly (readonly number[])[]
  men: number
  repair: number
  taels: number
  cannon: number
  /** Kornet spises i brøkdele af sække pr. træk, så det er ikke et heltal. */
  grain: number
  jewels: number
  points: number
  moves: number
  difficulty: number
  moveLimit: number
  pointGoal: number
  /** Antal møder og antal flugter. Forholdet er besætningens moral. */
  fights: number
  flights: number
  /** Prisemandskab og prisepenge, der er på vej til København. */
  prizeMen: number
  prizeTaels: number
  /** En linje til kortet: "Grundstødning!" og den slags. */
  notice: string | null
  screen: Screen
  /** Hvordan spillet endte -- til resultatlisten og til teksten. */
  outcome: 'won' | 'lost' | null
}

export type Action =
  | { type: 'move'; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  | { type: 'attack' }
  | { type: 'flee' }
  | { type: 'board' }
  | { type: 'shoot' }
  | { type: 'aim'; elevation: number; side: number }
  | { type: 'setAim'; elevation: number; side: number }
  | { type: 'fire' }
  | { type: 'dismissShot' }
  | { type: 'withdraw' }
  | { type: 'retreat' }
  | { type: 'sink' }
  | { type: 'prize' }
  | { type: 'investigate' }
  | { type: 'ignore' }
  | { type: 'continue' }
  | { type: 'steer'; dx: -1 | 1 }
  | { type: 'harbourTick' }
  | { type: 'buy'; item: BuyItem; amount: number }
  | { type: 'sell'; item: SellItem; amount: number }
  | { type: 'leave' }

export function rankName(level: number): string {
  return RANKS[Math.min(RANKS.length, Math.max(1, level)) - 1]
}

export function titleName(level: number): string {
  return TITLES[Math.min(TITLES.length, Math.max(1, level)) - 1]
}

/** Niveauet, som resultatlisten viser det: 1 for matros ... 5 for admiral. */
export function levelOf(state: KaperState): number {
  return state.difficulty / 2
}

/** Antal træk man har til at nå målet, regnet fra nu af. */
function movesForDifficulty(difficulty: number): number {
  return 325 - 12.5 * difficulty
}

function pointsForDifficulty(difficulty: number): number {
  return 500 + 250 * difficulty
}

export function createGame(): KaperState {
  return {
    status: 'idle',
    captain: '',
    x: START_POSITION.x,
    y: START_POSITION.y,
    map: createMap(),
    men: START_SHIP.men,
    repair: START_SHIP.repair,
    taels: START_SHIP.taels,
    cannon: START_SHIP.cannon,
    grain: START_SHIP.grain,
    jewels: 0,
    points: 0,
    moves: 0,
    difficulty: FIRST_DIFFICULTY,
    moveLimit: movesForDifficulty(FIRST_DIFFICULTY),
    pointGoal: pointsForDifficulty(FIRST_DIFFICULTY),
    fights: 2,
    flights: 1,
    prizeMen: 0,
    prizeTaels: 0,
    notice: null,
    screen: { kind: 'map' },
    outcome: null,
  }
}

export function startGame(captain: string): KaperState {
  return {
    ...createGame(),
    status: 'running',
    captain: captain.trim() || 'kaptajn',
  }
}

// ---------------------------------------------------------------------------
// Små hjælpere

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Sunket, når skibet er for medtaget eller besætningen for lille til at sejle det. */
function isWrecked(state: KaperState): boolean {
  return !(state.repair > 20 && state.men > 10)
}

function gameOver(
  state: KaperState,
  outcome: 'won' | 'lost',
  title: string,
  lines: string[],
): KaperState {
  return {
    ...state,
    status: 'over',
    outcome,
    notice: null,
    screen: { kind: 'over', title, lines },
  }
}

/** "Sorry! Your ship went down with all hands!" */
function goDown(state: KaperState, cause: string | null): KaperState {
  const sunk = {
    ...state,
    repair: Math.max(0, state.repair),
    men: Math.max(0, state.men),
  }
  return gameOver(sunk, 'lost', 'Beklager!', [
    ...(cause ? [cause] : []),
    'Dit skib gik ned med mand og mus!',
    `Du fik ${sunk.points} point og havde ${sunk.taels} bral.`,
    `Du endte med ${sunk.men} mand og ${sunk.repair} reparationspoint.`,
  ])
}

/** Den enkelte ændring efterfulgt af spørgsmålet: flyder vi stadig? */
function afterDamage(state: KaperState, cause: string | null): KaperState {
  return isWrecked(state) ? goDown(state, cause) : state
}

function morale(state: KaperState): number {
  return (state.fights + state.flights) / state.fights
}

function clearCell(state: KaperState): KaperState {
  const map = state.map.map((row) => [...row])
  map[state.y][state.x] = CLEARED
  return { ...state, map }
}

function report(state: KaperState, title: string, lines: string[]): KaperState {
  return { ...state, screen: { kind: 'report', title, lines } }
}

// ---------------------------------------------------------------------------
// Kortet

/**
 * Tilbage til kortet efter en havn, en kamp eller en tåge. Her afgøres det, om
 * lasten er blevet for tung, og om pointene rækker til en forfremmelse -- det
 * er de to ting, der kan ske "mellem" trækkene.
 */
function returnToMap(state: KaperState): KaperState {
  if (state.taels > MAX_TAELS) {
    return goDown(state, 'Vægten af alle dine penge sænker skibet!')
  }
  if (state.men > MAX_MEN) {
    return goDown(state, 'Vægten af alle dine mænd sænker skibet!')
  }
  if (state.cannon > MAX_CANNON) {
    return goDown(state, 'Vægten af alle dine kanoner sænker skibet!')
  }
  if (state.grain > MAX_GRAIN) {
    return goDown(state, 'Vægten af alt dit korn sænker skibet!')
  }
  if (state.points >= state.pointGoal) return promote(state)
  return { ...state, screen: { kind: 'map' } }
}

function promote(state: KaperState): KaperState {
  const difficulty = state.difficulty + 2
  const promoted: KaperState = {
    ...state,
    difficulty,
    moveLimit: state.moves + movesForDifficulty(difficulty),
    pointGoal: state.points + pointsForDifficulty(difficulty),
  }
  const level = levelOf(promoted)
  if (difficulty >= FINAL_DIFFICULTY) {
    return gameOver(promoted, 'won', 'Du har klaret det hele!', [
      'Tillykke! Du har netop modtaget din forfremmelse med flaskepost.',
      `${COMTESSE} venter med længsel -- og du får det halve kongerige oveni.`,
      `Længe leve ${titleName(level)} ${promoted.captain}!`,
    ])
  }
  return report(promoted, 'Tillykke!', [
    'Du har netop modtaget din forfremmelse med flaskepost.',
    `${COMTESSE} venter med længsel!`,
    `Lad os se dig nå det næste mål, ${titleName(level)} ${promoted.captain}: ${promoted.pointGoal} point inden træk ${promoted.moveLimit}.`,
  ])
}

function move(
  state: KaperState,
  dx: -1 | 0 | 1,
  dy: -1 | 0 | 1,
  rng: Rng,
): KaperState {
  if (dx === 0 && dy === 0) return state

  const moves = state.moves + 1
  if (moves >= state.moveLimit) {
    return gameOver({ ...state, moves }, 'lost', 'Sørgelig nyhed', [
      `Vi må med sorg meddele, at ${COMTESSE} i dag er blevet gift med ${RIVAL}.`,
      'I fortvivlelse tager du den lange svømmetur!',
      `Du fik ${state.points} point.`,
    ])
  }

  // Besætningen spiser af kornet for hvert træk. Løber det tør, sulter de.
  let next: KaperState = {
    ...state,
    moves,
    notice: null,
    grain: state.grain - state.men * (state.difficulty / 800),
  }
  if (next.grain < 0) {
    next = { ...next, grain: 0, men: Math.floor(0.9 * next.men) }
    next = {
      ...next,
      notice: 'Kornet er sluppet op. Besætningen sulter!',
    }
    if (isWrecked(next)) return goDown(next, 'Besætningen sultede ihjel.')
  }

  const x = clamp(state.x + dx, MIN_X, MAX_X)
  const y = clamp(state.y + dy, MIN_Y, MAX_Y)
  const cell = next.map[y][x]

  if (cell === LAND) {
    next = { ...next, repair: next.repair - 3 }
    next = {
      ...next,
      notice: 'Grundstødning! Skibet tog skade, og du blev, hvor du var.',
    }
    return afterDamage(next, 'Du sejlede på grund én gang for meget.')
  }

  next = { ...next, x, y }

  if (isPortCell(cell)) {
    return {
      ...next,
      screen: {
        kind: 'harbourIntro',
        port: cell,
        windDirection: 2 * rng() < 1 ? -1 : 1,
      },
    }
  }

  if (cell === SEA && rng() < ENCOUNTER_CHANCE) {
    return encounter(next, rng, null)
  }

  return next
}

// ---------------------------------------------------------------------------
// Møder på havet

function createEnemy(type: EnemyType, rng: Rng): Enemy {
  return {
    type,
    taels: type.taels,
    distance: 500 + Math.floor(rng() * 500),
    repair: 100 + Math.floor(rng() * 50),
    guns: type.guns,
    men: type.men,
    grain: 1 + Math.floor(rng() * type.maxGrain),
  }
}

/** Udkiggen råber. Otte af ti gange er det et skib, to gange en sær tåge. */
function encounter(
  state: KaperState,
  rng: Rng,
  preface: string | null,
): KaperState {
  const roll = 1 + Math.floor(10 * rng())
  if (roll > 8) {
    return { ...state, fights: state.fights + 1, screen: { kind: 'mist' } }
  }
  return sighting(state, ENEMY_TYPES[roll - 1], rng, preface)
}

function sighting(
  state: KaperState,
  type: EnemyType,
  rng: Rng,
  preface: string | null,
): KaperState {
  return {
    ...state,
    fights: state.fights + 1,
    screen: { kind: 'encounter', enemy: createEnemy(type, rng), preface },
  }
}

function withdraw(state: KaperState, enemy: Enemy, rng: Rng): KaperState {
  return {
    ...state,
    screen: {
      kind: 'encounter',
      enemy: { ...enemy, distance: 500 + Math.floor(rng() * 500) },
      preface: null,
    },
  }
}

function openFire(state: KaperState, enemy: Enemy, rng: Rng): KaperState {
  const side = 10 * (Math.floor(3 * rng()) - 1)
  const range = 10 * (Math.floor(3 * rng()) - 1)
  const strength = side === 0 && range === 0 ? 0 : 1 + Math.floor(rng() * 10)
  return {
    ...state,
    screen: {
      kind: 'cannon',
      enemy,
      aim: { elevation: 0, side: 0 },
      wind: { side, range, strength },
      shot: null,
    },
  }
}

function clampAim(aim: Aim): Aim {
  return {
    elevation: clamp(
      Math.round(aim.elevation),
      -AIM_MAX_ELEVATION,
      AIM_MAX_ELEVATION,
    ),
    side: clamp(Math.round(aim.side), -AIM_MAX_SIDE, AIM_MAX_SIDE),
  }
}

/** Hvor mange enheders sidevindsafdrift der stadig rammer. Sværere med rangen. */
function driftTolerance(difficulty: number): number {
  if (difficulty > 6) return 0
  if (difficulty > 4) return 1
  return 2
}

/**
 * En salve. Først svarer fjenden -- de skyder samtidig -- og så afgøres det,
 * hvor ens egen kugle landede: forbi til siden, for kort, for langt eller i
 * skroget. Rammer man, mister fjenden reparationspoint, kanoner og mænd, og
 * er hun medtaget nok, stryger hun flaget eller går ned.
 */
function fire(
  state: KaperState,
  screen: Extract<Screen, { kind: 'cannon' }>,
  rng: Rng,
): KaperState {
  const { aim, wind } = screen
  const enemy = { ...screen.enemy }
  const spirit = morale(state)
  let next: KaperState = { ...state }

  let repairLost = 0
  let menLost = 0
  let cannonLost = false
  if (rng() > 0.4) {
    repairLost =
      Math.floor((enemy.guns / 1.3) * spirit) +
      Math.floor(state.difficulty * rng() * 0.5)
    next = { ...next, repair: next.repair - repairLost }
    if (isWrecked(next))
      return goDown(
        next,
        `Bredsiden fra ${enemyNoun(enemy.type)} var for meget.`,
      )
  }
  if (rng() > 0.4) {
    menLost =
      Math.floor((enemy.guns / 1.4) * spirit) +
      Math.floor(state.difficulty * rng() * 0.5)
    next = { ...next, men: next.men - menLost }
    if (isWrecked(next))
      return goDown(
        next,
        `Bredsiden fra ${enemyNoun(enemy.type)} var for meget.`,
      )
  }
  if (100 * rng() < state.difficulty + enemy.guns / 5) {
    cannonLost = next.cannon > 1
    next = { ...next, cannon: Math.max(1, next.cannon - 1) }
  }

  // Afdriften til siden: vinden skubber, sigtet trækker den anden vej.
  let drift =
    Math.floor(wind.strength * wind.side * 0.1) +
    Math.floor(wind.side * 0.2 * rng() - 0.2 * aim.side)
  drift = clamp(drift, -20, 20)

  // Længden: hvor langt forbi (negativt) eller foran (positivt) fjenden.
  const overshoot =
    enemy.distance -
    (700 +
      wind.strength * wind.range -
      10 * aim.elevation +
      Math.floor(50 * rng()) -
      Math.floor(50 * rng()))

  const result = (outcome: ShotOutcome): ShotResult => ({
    outcome,
    repairLost,
    menLost,
    cannonLost,
  })
  const showShot = (outcome: ShotOutcome, hit: Enemy): KaperState => ({
    ...next,
    screen: { ...screen, enemy: hit, shot: result(outcome) },
  })

  const tolerance = driftTolerance(state.difficulty)
  if (drift > tolerance) return showShot('left', enemy)
  if (drift < -tolerance) return showShot('right', enemy)
  if (overshoot > 0) return showShot('short', enemy)
  if (overshoot < -50) return showShot('long', enemy)

  enemy.repair =
    enemy.repair - Math.floor((2 * next.cannon) / state.difficulty) + overshoot
  enemy.guns -= Math.floor((rng() * 10) / state.difficulty)
  if (enemy.guns < 1) return surrender(next, enemy)
  if (enemy.repair < 15) return enemySinks(next, enemy)
  if (enemy.repair < 40 - state.difficulty) return surrender(next, enemy)

  const remaining =
    enemy.men -
    Math.floor(
      (0.9 * enemy.men * (next.cannon + overshoot / 5 + 10 * rng())) / 100,
    )
  if (remaining < enemy.men) {
    enemy.men = remaining
    if (enemy.men < 20) return surrender(next, enemy)
  }
  return showShot('hit', enemy)
}

/**
 * Entring. Begge sider mister folk; hvor mange afhænger af moralen og af
 * styrkeforholdet. Er der under tyve tilbage hos fjenden, overgiver de sig.
 */
function board(state: KaperState, enemy: Enemy, rng: Rng): KaperState {
  const spirit = morale(state)
  const ratio = clamp(
    (enemy.men / state.men) * spirit * (state.difficulty / 10),
    0.6,
    1.2,
  )
  const ownDead = Math.floor(
    state.men * spirit * ((state.difficulty * rng()) / 30),
  )
  const next: KaperState = { ...state, men: state.men - ownDead }
  if (isWrecked(next)) {
    return goDown(
      next,
      `Entringen af ${enemyNoun(enemy.type)} kostede for mange mænd.`,
    )
  }

  let enemyDead = Math.floor(ownDead / ratio)
  if (enemyDead < enemy.men / 10) enemyDead = Math.floor(enemy.men / 10)
  const hit: Enemy = {
    ...enemy,
    men: enemyDead < enemy.men ? enemy.men - enemyDead : 0,
  }
  if (hit.men < 20) return surrender(next, hit)

  return {
    ...next,
    screen: {
      kind: 'boarding',
      enemy: hit,
      // Originalen rapporterer aldrig færre end syv faldne -- det lyder bedre.
      enemyDead: Math.max(7, enemyDead),
      ownDead,
    },
  }
}

/** "They surrender!!" -- pengene og kornet tages med det samme. */
function surrender(state: KaperState, enemy: Enemy): KaperState {
  const survivors = Math.max(0, enemy.men)
  const grain = Math.max(2, enemy.grain)
  const next = clearCell({
    ...state,
    taels: state.taels + enemy.taels,
    points: state.points + Math.floor(enemy.taels / 10),
    grain: state.grain + grain,
  })
  return {
    ...next,
    screen: {
      kind: 'surrender',
      enemy: { ...enemy, men: survivors },
      survivors,
      grain,
      prizeCrew: 5 + Math.floor(survivors / 2),
    },
  }
}

/**
 * Prisen sendes hjem, eller hun sænkes. Sænker man hende, går de overlevende
 * med om bord -- og som i originalen tæller sænkningen point endnu en gang.
 */
function shipVanishes(state: KaperState, enemy: Enemy): KaperState {
  let next = clearCell({
    ...state,
    points: state.points + Math.floor(enemy.taels / 10),
  })
  const lines = ['Hun forsvandt sporløst!']
  if (next.men > MAX_MEN) {
    lines.push(
      `Du smider ${next.men - MAX_MEN} mand til hajerne for at holde skibet flydende.`,
    )
    next = { ...next, men: MAX_MEN }
  }
  return report(next, 'Skibet sank', lines)
}

function enemySinks(state: KaperState, enemy: Enemy): KaperState {
  return shipVanishes(state, enemy)
}

function sinkPrize(
  state: KaperState,
  screen: Extract<Screen, { kind: 'surrender' }>,
): KaperState {
  return shipVanishes(
    { ...state, men: state.men + screen.survivors },
    screen.enemy,
  )
}

function takePrize(
  state: KaperState,
  screen: Extract<Screen, { kind: 'surrender' }>,
  rng: Rng,
): KaperState {
  const next: KaperState = { ...state, men: state.men - screen.prizeCrew }
  if (isWrecked(next)) {
    return goDown(next, 'Prisemandskabet efterlod for få til at sejle skibet.')
  }
  // Prisen når ikke altid frem. Om den gør, får man først at vide i København.
  const arrives = state.difficulty < Math.floor(rng() * 16)
  return report(
    arrives
      ? {
          ...next,
          prizeMen: next.prizeMen + screen.prizeCrew,
          prizeTaels: next.prizeTaels + screen.enemy.taels,
        }
      : next,
    'Prisen sendes hjem',
    [
      `${screen.prizeCrew} mand går om bord som prisemandskab.`,
      'Godt, så er de på vej mod København.',
    ],
  )
}

// ---------------------------------------------------------------------------
// Tågen

function investigate(state: KaperState, rng: Rng): KaperState {
  const roll = Math.floor(10 * rng())
  switch (roll) {
    case 0:
    case 1: {
      const type = ENEMY_TYPES[Math.floor(rng() * 8)]
      return sighting(
        state,
        type,
        rng,
        'Ud af den urgamle tåge dukker et frygtindgydende skib op!',
      )
    }
    case 2: {
      const bral = 300 * roll
      return report({ ...state, taels: state.taels + bral }, 'En ø!', [
        `Du finder en ø med en skattekiste, der indeholder ${bral} bral!`,
      ])
    }
    case 3: {
      const jewels = 2 + Math.floor(6 * rng())
      return report({ ...state, jewels: state.jewels + jewels }, 'En ø!', [
        `Du finder en ø med ${jewels} juveler!`,
      ])
    }
    case 4:
      return report({ ...state, cannon: state.cannon + 1 }, 'En ø!', [
        'Du finder en ø med en efterladt kanon, som du tager om bord!',
      ])
    case 5: {
      const men = 9 + Math.floor(rng() * 40)
      return report({ ...state, men: state.men + men }, 'En ø!', [
        `Du finder en ø med en skibbruden besætning på ${men} mand. De går med om bord!`,
      ])
    }
    case 8: {
      const grain = 2 + Math.floor(6 * rng())
      return report({ ...state, grain: state.grain + grain }, 'En ø!', [
        `Du finder en ø med ${grain} sække korn!`,
      ])
    }
    case 9: {
      const next = { ...state, men: state.men - Math.floor(state.men / 3) }
      const lines = [
        'Du finder en ø med en skibbruden pestsyg!',
        'Besætningen får pesten, og en tredjedel omkommer.',
        'Resten er ikke imponerede over din ledelse!',
      ]
      return isWrecked(next)
        ? goDown(next, lines.join(' '))
        : report(next, 'Pest!', lines)
    }
    default:
      return report(state, 'Nå!', ['Det var så sandelig ingenting alligevel.'])
  }
}

// ---------------------------------------------------------------------------
// Havnen

function createHarbour(
  state: KaperState,
  windDirection: -1 | 1,
  rng: Rng,
): HarbourState {
  const ships: [number, number][] = []
  for (let index = 0; index <= state.difficulty * 5; index += 1) {
    ships.push([
      HARBOUR_MIN_X + Math.floor(rng() * (HARBOUR_MAX_X - HARBOUR_MIN_X + 1)),
      1 + Math.floor(rng() * HARBOUR_STEPS),
    ])
  }
  const gapWidth = Math.max(1, 6 - state.difficulty / 2)
  const gapStart = clamp(
    12 - state.difficulty + 1 + Math.floor(rng() * (6 + 2 * state.difficulty)),
    HARBOUR_MIN_X,
    HARBOUR_MAX_X - gapWidth + 1,
  )
  return {
    x: HARBOUR_START_X,
    row: 0,
    ships,
    gapStart,
    gapWidth,
    windDirection,
    lastEvent: null,
  }
}

export function inHarbourGap(harbour: HarbourState, x: number): boolean {
  return x >= harbour.gapStart && x < harbour.gapStart + harbour.gapWidth
}

function harbourTick(
  state: KaperState,
  screen: Extract<Screen, { kind: 'harbour' }>,
  rng: Rng,
): KaperState {
  let { x } = screen.harbour
  let lastEvent: HarbourState['lastEvent'] = null
  if (rng() < state.difficulty / 18) {
    x = clamp(x + screen.harbour.windDirection, HARBOUR_MIN_X, HARBOUR_MAX_X)
    lastEvent = 'gust'
  }
  const row = screen.harbour.row + 1
  let next: KaperState = state
  if (screen.harbour.ships.some(([sx, sy]) => sx === x && sy === row)) {
    next = { ...next, repair: next.repair - 15 * state.difficulty }
    lastEvent = 'hit'
    if (isWrecked(next)) {
      return goDown(next, 'Du sejlede ind i et af skibene på reden.')
    }
  }
  const harbour: HarbourState = { ...screen.harbour, x, row, lastEvent }
  if (row < HARBOUR_STEPS) {
    return { ...next, screen: { ...screen, harbour } }
  }
  if (!inHarbourGap(harbour, x)) {
    return gameOver(next, 'lost', 'Dit skib er færdigt', [
      'Du ramte havnemolen -- og det var det for både skib og kaptajn!',
      `Du fik ${next.points} point.`,
    ])
  }
  return arriveInPort(
    { ...next, screen: { ...screen, harbour } },
    screen.port,
    rng,
  )
}

function rollPrices(rng: Rng): Prices {
  const price = (base: number) => Math.round(base * (0.8 + rng()))
  return {
    men: price(10),
    repair: price(8),
    cannon: price(100),
    grain: price(5),
    jewels: price(50),
  }
}

function arriveInPort(state: KaperState, port: number, rng: Rng): KaperState {
  const prices = rollPrices(rng)
  let next = state
  let arrival: string[] | null = null
  if (port === COPENHAGEN && (state.prizeMen > 0 || state.prizeTaels > 0)) {
    arrival = [
      `Storartet! Her i København venter dine ${state.prizeMen} tapre mænd på dig.`,
      `De har ${state.prizeTaels} bral i prisepenge med til dig!`,
    ]
    next = {
      ...next,
      points: next.points + Math.floor(next.prizeTaels / 10),
      men: next.men + next.prizeMen,
      // Originalen ville sætte et loft her, men skrev variabelnavnet forkert.
      taels: Math.min(MAX_TAELS, next.taels + next.prizeTaels),
      prizeMen: 0,
      prizeTaels: 0,
    }
  }
  return {
    ...next,
    screen: { kind: 'port', port, prices, arrival, notice: null },
  }
}

const ITEM_NAMES: Record<BuyItem | SellItem, string> = {
  men: 'mand',
  repair: 'reparationspoint',
  cannon: 'kanoner',
  grain: 'sække korn',
  jewels: 'juveler',
}

function buy(
  state: KaperState,
  screen: Extract<Screen, { kind: 'port' }>,
  item: BuyItem,
  amount: number,
): KaperState {
  const notice = (text: string): KaperState => ({
    ...state,
    screen: { ...screen, arrival: null, notice: text },
  })
  if (!Number.isInteger(amount) || amount <= 0) return state
  const cost = amount * screen.prices[item]
  if (cost > state.taels) return notice('Det har du ikke råd til!')
  if (item === 'cannon' && state.cannon + amount >= MAX_CANNON) {
    return notice('Det er for meget! Skibet kan ikke bære det.')
  }
  if (item === 'men' && state.men + amount >= MAX_MEN) {
    return notice('Det er for meget! Skibet kan ikke bære det.')
  }
  if (item === 'grain' && state.grain + amount >= MAX_GRAIN) {
    return notice('Det er for meget! Skibet kan ikke bære det.')
  }
  return {
    ...state,
    taels: state.taels - cost,
    [item]: state[item] + amount,
    screen: {
      ...screen,
      arrival: null,
      notice: `Du købte ${amount} ${ITEM_NAMES[item]} for ${cost} bral.`,
    },
  }
}

function sell(
  state: KaperState,
  screen: Extract<Screen, { kind: 'port' }>,
  item: SellItem,
  amount: number,
): KaperState {
  if (!Number.isInteger(amount) || amount <= 0) return state
  if (amount > state[item]) {
    return {
      ...state,
      screen: { ...screen, arrival: null, notice: 'Så mange har du ikke!' },
    }
  }
  const income = amount * screen.prices[item]
  return {
    ...state,
    taels: state.taels + income,
    [item]: state[item] - amount,
    screen: {
      ...screen,
      arrival: null,
      notice: `Du solgte ${amount} ${ITEM_NAMES[item]} for ${income} bral.`,
    },
  }
}

// ---------------------------------------------------------------------------

export function reduce(
  state: KaperState,
  action: Action,
  rng: Rng,
): KaperState {
  if (state.status !== 'running') return state
  const { screen } = state

  switch (action.type) {
    case 'move':
      return screen.kind === 'map'
        ? move(state, action.dx, action.dy, rng)
        : state

    case 'attack':
      return screen.kind === 'encounter'
        ? { ...state, screen: { kind: 'attack', enemy: screen.enemy } }
        : state

    case 'flee':
      return screen.kind === 'encounter'
        ? returnToMap({ ...state, flights: state.flights + 1 })
        : state

    case 'board':
      return screen.kind === 'attack' || screen.kind === 'boarding'
        ? board(state, screen.enemy, rng)
        : state

    case 'shoot':
      return screen.kind === 'attack'
        ? openFire(state, screen.enemy, rng)
        : state

    case 'aim':
      return screen.kind === 'cannon' && !screen.shot
        ? {
            ...state,
            screen: {
              ...screen,
              aim: clampAim({
                elevation: screen.aim.elevation + action.elevation,
                side: screen.aim.side + action.side,
              }),
            },
          }
        : state

    case 'setAim':
      return screen.kind === 'cannon' && !screen.shot
        ? {
            ...state,
            screen: {
              ...screen,
              aim: clampAim({ elevation: action.elevation, side: action.side }),
            },
          }
        : state

    case 'fire':
      return screen.kind === 'cannon' && !screen.shot
        ? fire(state, screen, rng)
        : state

    case 'dismissShot':
      return screen.kind === 'cannon' && screen.shot
        ? { ...state, screen: { ...screen, shot: null } }
        : state

    case 'withdraw':
      return screen.kind === 'cannon' && !screen.shot
        ? withdraw(state, screen.enemy, rng)
        : state

    case 'retreat':
      return screen.kind === 'boarding'
        ? {
            ...state,
            screen: { kind: 'encounter', enemy: screen.enemy, preface: null },
          }
        : state

    case 'sink':
      return screen.kind === 'surrender' ? sinkPrize(state, screen) : state

    case 'prize':
      return screen.kind === 'surrender' ? takePrize(state, screen, rng) : state

    case 'investigate':
      return screen.kind === 'mist' ? investigate(state, rng) : state

    case 'ignore':
      return screen.kind === 'mist' ? returnToMap(state) : state

    case 'continue':
      if (screen.kind === 'report') return returnToMap(state)
      if (screen.kind === 'harbourIntro') {
        return {
          ...state,
          screen: {
            kind: 'harbour',
            port: screen.port,
            harbour: createHarbour(state, screen.windDirection, rng),
          },
        }
      }
      return state

    case 'steer':
      return screen.kind === 'harbour'
        ? {
            ...state,
            screen: {
              ...screen,
              harbour: {
                ...screen.harbour,
                x: clamp(
                  screen.harbour.x + action.dx,
                  HARBOUR_MIN_X,
                  HARBOUR_MAX_X,
                ),
              },
            },
          }
        : state

    case 'harbourTick':
      return screen.kind === 'harbour' ? harbourTick(state, screen, rng) : state

    case 'buy':
      return screen.kind === 'port'
        ? buy(state, screen, action.item, action.amount)
        : state

    case 'sell':
      return screen.kind === 'port'
        ? sell(state, screen, action.item, action.amount)
        : state

    case 'leave':
      return screen.kind === 'port' ? returnToMap(state) : state

    default:
      return state
  }
}

/** Navnet på havnen, man ligger i -- til overskrifter. */
export function portName(id: number): string {
  return portById(id)?.name ?? 'havnen'
}

export { enemyLabel, enemyNoun }
