import type { BobleState } from './engine'
import { BOBLE_WORLD } from './engine'

/** Tegner banen med enkle former. Ingen figurer fra det gamle arkadespil. */
export function drawBoble(ctx: CanvasRenderingContext2D, state: BobleState) {
  const { w, h } = BOBLE_WORLD
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#14343c')
  sky.addColorStop(1, '#1f6a62')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  for (const platform of state.platforms) {
    ctx.fillStyle = '#6f8f62'
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h)
    ctx.fillStyle = '#d7e7a8'
    ctx.fillRect(platform.x, platform.y, platform.w, 2)
  }

  for (const bubble of state.bubbles) {
    ctx.beginPath()
    ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2)
    ctx.fillStyle =
      bubble.mode === 'hold'
        ? 'rgba(186, 240, 255, 0.45)'
        : 'rgba(210, 248, 255, 0.28)'
    ctx.fill()
    ctx.strokeStyle = '#e8fbff'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  for (const enemy of state.enemies) {
    drawBlob(
      ctx,
      enemy.x + enemy.w / 2,
      enemy.y + enemy.h / 2,
      '#f0a04a',
      '#8a3d12',
    )
  }

  const player = state.player
  if (player.hurt % 8 < 5) {
    drawBlob(
      ctx,
      player.x + player.w / 2,
      player.y + player.h / 2,
      '#3dce78',
      '#145c34',
    )
    ctx.fillStyle = '#143026'
    const eyeX = player.x + player.w / 2 + player.facing * 3
    ctx.fillRect(eyeX, player.y + 4, 2, 2)
  }
}

function drawBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: string,
  stroke: string,
) {
  ctx.beginPath()
  ctx.ellipse(x, y, 8, 7, 0, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.5
  ctx.stroke()
}
