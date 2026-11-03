export interface Platform {
  x: number
  y: number
  w: number
  h: number
}

export interface EnemySpawn {
  x: number
  y: number
  dir: 1 | -1
}

export interface LevelPlan {
  platforms: Platform[]
  enemies: EnemySpawn[]
}

export const WORLD_W = 320
export const WORLD_H = 200

const floor: Platform = { x: 0, y: 184, w: WORLD_W, h: 16 }

/** Tre baner, der gentages. Grafikken er vores egen, ikke en kopi. */
export const LEVELS: readonly LevelPlan[] = [
  {
    platforms: [
      floor,
      { x: 24, y: 142, w: 88, h: 8 },
      { x: 208, y: 142, w: 88, h: 8 },
      { x: 108, y: 96, w: 104, h: 8 },
      { x: 16, y: 52, w: 72, h: 8 },
      { x: 232, y: 52, w: 72, h: 8 },
    ],
    enemies: [
      { x: 48, y: 128, dir: 1 },
      { x: 228, y: 128, dir: -1 },
    ],
  },
  {
    platforms: [
      floor,
      { x: 16, y: 146, w: 64, h: 8 },
      { x: 128, y: 146, w: 64, h: 8 },
      { x: 240, y: 146, w: 64, h: 8 },
      { x: 64, y: 100, w: 72, h: 8 },
      { x: 184, y: 100, w: 72, h: 8 },
      { x: 112, y: 54, w: 96, h: 8 },
    ],
    enemies: [
      { x: 32, y: 132, dir: 1 },
      { x: 144, y: 132, dir: -1 },
      { x: 128, y: 40, dir: 1 },
    ],
  },
  {
    platforms: [
      floor,
      { x: 40, y: 150, w: 240, h: 8 },
      { x: 16, y: 108, w: 90, h: 8 },
      { x: 214, y: 108, w: 90, h: 8 },
      { x: 120, y: 66, w: 80, h: 8 },
    ],
    enemies: [
      { x: 56, y: 136, dir: 1 },
      { x: 200, y: 136, dir: -1 },
      { x: 36, y: 94, dir: 1 },
      { x: 230, y: 94, dir: -1 },
    ],
  },
]
