import {
  LEVELS,
  WORLD_H,
  WORLD_W,
  type LevelPlan,
  type Platform,
} from './levels'

const GRAVITY = 0.32
const MOVE = 1.8
const JUMP = -6.6
const MAX_FALL = 7
const PLAYER_W = 16
const PLAYER_H = 16
const ENEMY_W = 14
const ENEMY_H = 14
const SHOOT_COOLDOWN = 16
const BUBBLE_FLY = 22
const BUBBLE_HOLD = 220
const START_LIVES = 3

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Player extends Rect {
  vx: number
  vy: number
  facing: 1 | -1
  onGround: boolean
  cooldown: number
  hurt: number
}

export interface Enemy extends Rect {
  id: number
  vx: number
  dir: 1 | -1
  baseSpeed: number
  trapped: boolean
}

export interface Bubble {
  id: number
  x: number
  y: number
  r: number
  vx: number
  vy: number
  mode: 'fly' | 'float' | 'hold'
  life: number
  enemyId: number | null
}

export type BobleStatus = 'ready' | 'playing' | 'over'

export interface BobleState {
  status: BobleStatus
  level: number
  score: number
  lives: number
  player: Player
  enemies: Enemy[]
  bubbles: Bubble[]
  platforms: Platform[]
  nextId: number
}

export interface BobleInput {
  left: boolean
  right: boolean
  /** Sand kun i det billede, hoppet trykkes ned. */
  jumpPressed: boolean
  shootPressed: boolean
}

export function createBobleState(): BobleState {
  return loadLevel(
    {
      status: 'ready',
      level: 0,
      score: 0,
      lives: START_LIVES,
      player: spawnPlayer(),
      enemies: [],
      bubbles: [],
      platforms: [],
      nextId: 1,
    },
    0,
    'ready',
  )
}

export function startBoble(state: BobleState): BobleState {
  return loadLevel(
    { ...state, status: 'playing', score: 0, lives: START_LIVES, level: 0 },
    0,
    'playing',
  )
}

export function stepBoble(state: BobleState, input: BobleInput): BobleState {
  if (state.status !== 'playing') return state

  let next = {
    ...state,
    player: { ...state.player },
    enemies: state.enemies.map((enemy) => ({ ...enemy })),
    bubbles: state.bubbles.map((bubble) => ({ ...bubble })),
  }

  movePlayer(next, input)
  if (input.shootPressed) shoot(next)
  moveBubbles(next)
  trapEnemies(next)
  moveEnemies(next)
  popBubbles(next)
  next = hurtPlayer(next)

  if (next.enemies.length === 0) {
    return loadLevel(next, next.level + 1, 'playing')
  }
  return next
}

function spawnPlayer(): Player {
  return {
    x: 16,
    y: 168,
    w: PLAYER_W,
    h: PLAYER_H,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    cooldown: 0,
    hurt: 0,
  }
}

function loadLevel(
  state: BobleState,
  level: number,
  status: BobleStatus,
): BobleState {
  const plan = LEVELS[level % LEVELS.length] as LevelPlan
  const loop = Math.floor(level / LEVELS.length)
  const speed = 0.55 + loop * 0.18
  let nextId = state.nextId
  const enemies: Enemy[] = plan.enemies.map((spawn) => {
    const enemy: Enemy = {
      id: nextId++,
      x: spawn.x,
      y: spawn.y,
      w: ENEMY_W,
      h: ENEMY_H,
      vx: speed * spawn.dir,
      dir: spawn.dir,
      baseSpeed: speed,
      trapped: false,
    }
    return enemy
  })
  return {
    ...state,
    status,
    level,
    player: spawnPlayer(),
    enemies,
    bubbles: [],
    platforms: plan.platforms.map((platform) => ({ ...platform })),
    nextId,
  }
}

function movePlayer(state: BobleState, input: BobleInput) {
  const player = state.player
  if (player.cooldown > 0) player.cooldown -= 1
  if (player.hurt > 0) player.hurt -= 1

  if (input.left && !input.right) {
    player.vx = -MOVE
    player.facing = -1
  } else if (input.right && !input.left) {
    player.vx = MOVE
    player.facing = 1
  } else {
    player.vx = 0
  }

  if (input.jumpPressed && player.onGround) {
    player.vy = JUMP
    player.onGround = false
  }
  player.vy = Math.min(MAX_FALL, player.vy + GRAVITY)
  moveBody(player, state.platforms)
}

function shoot(state: BobleState) {
  const player = state.player
  if (player.cooldown > 0) return
  const flying = state.bubbles.filter((bubble) => bubble.mode !== 'hold').length
  if (flying >= 2) return
  player.cooldown = SHOOT_COOLDOWN
  const id = state.nextId++
  state.bubbles.push({
    id,
    x: player.x + player.w / 2 + player.facing * 12,
    y: player.y + 4,
    r: 7,
    vx: player.facing * 3.1,
    vy: 0,
    mode: 'fly',
    life: BUBBLE_FLY,
    enemyId: null,
  })
}

function moveBubbles(state: BobleState) {
  for (const bubble of state.bubbles) {
    bubble.life -= 1
    if (bubble.mode === 'fly') {
      bubble.x += bubble.vx
      if (bubble.life <= 0 || bubble.x < 8 || bubble.x > WORLD_W - 8) {
        bubble.mode = 'float'
        bubble.vx = 0
        bubble.vy = -0.45
        bubble.r = 11
        bubble.life = 80
      }
    } else if (bubble.mode === 'float') {
      bubble.y += bubble.vy
      if (bubble.y < 12) bubble.y = 12
    } else if (bubble.enemyId !== null) {
      const enemy = state.enemies.find((item) => item.id === bubble.enemyId)
      if (!enemy) continue
      bubble.y -= 0.28
      bubble.x = enemy.x + enemy.w / 2
      enemy.x = bubble.x - enemy.w / 2
      enemy.y = bubble.y - enemy.h / 2
      if (bubble.life <= 0) {
        enemy.trapped = false
        enemy.dir = enemy.dir === 1 ? -1 : 1
        enemy.vx = enemy.baseSpeed * enemy.dir
      }
    }
  }
  state.bubbles = state.bubbles.filter((bubble) => bubble.life > 0)
}

function trapEnemies(state: BobleState) {
  for (const bubble of state.bubbles) {
    if (bubble.mode === 'hold') continue
    for (const enemy of state.enemies) {
      if (enemy.trapped) continue
      if (!circleHitsRect(bubble.x, bubble.y, bubble.r, enemy)) continue
      enemy.trapped = true
      enemy.vx = 0
      bubble.mode = 'hold'
      bubble.enemyId = enemy.id
      bubble.vx = 0
      bubble.vy = 0
      bubble.r = 12
      bubble.life = BUBBLE_HOLD
      bubble.x = enemy.x + enemy.w / 2
      bubble.y = enemy.y + enemy.h / 2
      break
    }
  }
}

function moveEnemies(state: BobleState) {
  for (const enemy of state.enemies) {
    if (enemy.trapped) continue
    const ahead = enemy.x + (enemy.vx > 0 ? enemy.w + 1 : -1)
    const foot = enemy.y + enemy.h + 2
    const supported = state.platforms.some(
      (platform) =>
        ahead >= platform.x &&
        ahead <= platform.x + platform.w &&
        foot >= platform.y &&
        foot <= platform.y + platform.h + 3,
    )
    if (!supported || enemy.x <= 0 || enemy.x + enemy.w >= WORLD_W) {
      enemy.dir = enemy.dir === 1 ? -1 : 1
      enemy.vx = enemy.baseSpeed * enemy.dir
    }
    enemy.x += enemy.vx
    if (enemy.x < 0) enemy.x = 0
    if (enemy.x + enemy.w > WORLD_W) enemy.x = WORLD_W - enemy.w
  }
}

function popBubbles(state: BobleState) {
  const popped = new Set<number>()
  for (const bubble of state.bubbles) {
    if (bubble.mode !== 'hold' || bubble.enemyId === null) continue
    if (!circleHitsRect(bubble.x, bubble.y, bubble.r, state.player)) continue
    popped.add(bubble.id)
    state.enemies = state.enemies.filter((enemy) => enemy.id !== bubble.enemyId)
    const loop = Math.floor(state.level / LEVELS.length)
    state.score += 100 + loop * 50
  }
  if (popped.size > 0) {
    state.bubbles = state.bubbles.filter((bubble) => !popped.has(bubble.id))
  }
}

function hurtPlayer(state: BobleState): BobleState {
  const player = state.player
  if (player.hurt > 0) return state
  if (player.y > WORLD_H) return loseLife(state)
  const hit = state.enemies.some(
    (enemy) => !enemy.trapped && overlaps(player, enemy),
  )
  if (!hit) return state
  return loseLife(state)
}

function loseLife(state: BobleState): BobleState {
  const lives = state.lives - 1
  if (lives <= 0) {
    return { ...state, lives: 0, status: 'over', bubbles: [] }
  }
  return loadLevel({ ...state, lives }, state.level, 'playing')
}

function moveBody(body: Player, platforms: Platform[]) {
  body.x += body.vx
  for (const platform of platforms) {
    if (!overlaps(body, platform)) continue
    if (body.vx > 0) body.x = platform.x - body.w
    else if (body.vx < 0) body.x = platform.x + platform.w
    body.vx = 0
  }
  body.x = Math.max(0, Math.min(WORLD_W - body.w, body.x))

  body.y += body.vy
  body.onGround = false
  for (const platform of platforms) {
    if (!overlaps(body, platform)) continue
    if (body.vy >= 0 && body.y + body.h - body.vy <= platform.y + 2) {
      body.y = platform.y - body.h
      body.vy = 0
      body.onGround = true
    } else if (body.vy < 0) {
      body.y = platform.y + platform.h
      body.vy = 0
    }
  }
}

function overlaps(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  )
}

function circleHitsRect(cx: number, cy: number, r: number, rect: Rect) {
  const x = Math.max(rect.x, Math.min(cx, rect.x + rect.w))
  const y = Math.max(rect.y, Math.min(cy, rect.y + rect.h))
  const dx = cx - x
  const dy = cy - y
  return dx * dx + dy * dy <= r * r
}

export const BOBLE_WORLD = { w: WORLD_W, h: WORLD_H }
