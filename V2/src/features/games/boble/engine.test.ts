import { describe, expect, it } from 'vitest'
import {
  createBobleState,
  startBoble,
  stepBoble,
  type BobleInput,
} from './engine'

const idle: BobleInput = {
  left: false,
  right: false,
  jumpPressed: false,
  shootPressed: false,
}

describe('boble-motor', () => {
  it('hopper, når man står på gulvet', () => {
    let state = startBoble(createBobleState())
    for (let i = 0; i < 30; i++) state = stepBoble(state, idle)
    expect(state.player.onGround).toBe(true)
    const jumped = stepBoble(state, { ...idle, jumpPressed: true })
    expect(jumped.player.vy).toBeLessThan(0)
    expect(jumped.player.onGround).toBe(false)
  })

  it('skyder en boble, der fanger en modstander', () => {
    let state = startBoble(createBobleState())
    state = {
      ...state,
      player: { ...state.player, x: 40, y: 120, facing: 1, onGround: true },
      enemies: [
        {
          id: 99,
          x: 70,
          y: 120,
          w: 14,
          h: 14,
          vx: 0.5,
          dir: 1,
          baseSpeed: 0.5,
          trapped: false,
        },
      ],
    }
    state = stepBoble(state, { ...idle, shootPressed: true })
    expect(state.bubbles.length).toBe(1)
    let trapped = false
    for (let i = 0; i < 12; i++) {
      state = stepBoble(state, idle)
      trapped = state.enemies.some((enemy) => enemy.trapped)
      if (trapped) break
    }
    expect(trapped).toBe(true)
  })

  it('giver point, når en fanget boble punkteres', () => {
    let state = startBoble(createBobleState())
    state = {
      ...state,
      score: 0,
      player: { ...state.player, x: 40, y: 120 },
      enemies: [
        {
          id: 7,
          x: 40,
          y: 120,
          w: 14,
          h: 14,
          vx: 0,
          dir: 1,
          baseSpeed: 0.5,
          trapped: true,
        },
      ],
      bubbles: [
        {
          id: 8,
          x: 47,
          y: 127,
          r: 16,
          vx: 0,
          vy: 0,
          mode: 'hold',
          life: 100,
          enemyId: 7,
        },
      ],
    }
    state = stepBoble(state, idle)
    expect(state.score).toBeGreaterThan(0)
    expect(state.level).toBe(1)
  })

  it('mister et liv, når man rører en fri modstander', () => {
    let state = startBoble(createBobleState())
    const lives = state.lives
    state = {
      ...state,
      player: { ...state.player, x: 50, y: 120, hurt: 0 },
      enemies: [
        {
          id: 3,
          x: 50,
          y: 120,
          w: 14,
          h: 14,
          vx: 0,
          dir: 1,
          baseSpeed: 0.5,
          trapped: false,
        },
      ],
    }
    state = stepBoble(state, idle)
    expect(state.lives).toBe(lives - 1)
    expect(state.status).toBe('playing')
  })

  it('slutter, når det sidste liv er væk', () => {
    let state = startBoble(createBobleState())
    state = {
      ...state,
      lives: 1,
      player: { ...state.player, x: 50, y: 120, hurt: 0 },
      enemies: [
        {
          id: 3,
          x: 50,
          y: 120,
          w: 14,
          h: 14,
          vx: 0,
          dir: 1,
          baseSpeed: 0.5,
          trapped: false,
        },
      ],
    }
    state = stepBoble(state, idle)
    expect(state.status).toBe('over')
    expect(state.lives).toBe(0)
  })

  it('går videre til næste bane, når alle er punkteret', () => {
    let state = startBoble(createBobleState())
    state = { ...state, level: 0, enemies: [], bubbles: [] }
    state = stepBoble(state, idle)
    expect(state.level).toBe(1)
    expect(state.enemies.length).toBeGreaterThan(0)
  })
})
