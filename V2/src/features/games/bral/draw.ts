import {
  BRAL_CANS_PER_COIN,
  BRAL_TABS_PER_COIN,
  BRAL_WORLD,
  OVEN_MAX_TEMP,
  OVEN_MIN_TEMP,
  OVEN_SWEET_MAX,
  OVEN_SWEET_MIN,
  OVEN_TARGET_TEMP,
  STRIKE_FEM_HALF_WIDTH,
  STRIKE_TI_HALF_WIDTH,
  ovenZone,
  type BralState,
  type FallingCan,
} from './engine'

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function drawCan(ctx: CanvasRenderingContext2D, can: FallingCan) {
  ctx.save()
  ctx.translate(can.x, can.y)
  ctx.rotate(can.tilt)

  ctx.beginPath()
  ctx.arc(0, 0, 22, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(226, 232, 240, 0.08)'
  ctx.fill()

  traceRoundedRect(ctx, -10, -15, 20, 30, 4)
  ctx.fillStyle = '#cbd5e1'
  ctx.fill()
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = '#15803d'
  ctx.fillRect(-9, -6, 18, 12)

  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(-7, -13, 3, 25)

  ctx.fillStyle = '#94a3b8'
  ctx.fillRect(-8, -16, 16, 3)
  ctx.fillRect(-3, -18, 6, 2)

  ctx.restore()
}

function drawPullTab(ctx: CanvasRenderingContext2D, tab: FallingCan) {
  ctx.save()
  ctx.translate(tab.x, tab.y)
  ctx.rotate(tab.tilt * 1.4)

  ctx.beginPath()
  ctx.arc(0, 0, 20, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(245, 158, 11, 0.16)'
  ctx.fill()

  traceRoundedRect(ctx, -8, -13, 16, 26, 7)
  ctx.fillStyle = '#e2e8f0'
  ctx.fill()
  ctx.strokeStyle = '#d97706'
  ctx.lineWidth = 1.6
  ctx.stroke()

  ctx.fillStyle = '#241c15'
  traceRoundedRect(ctx, -4, -9, 8, 7, 3)
  ctx.fill()
  traceRoundedRect(ctx, -4, 2, 8, 7, 3)
  ctx.fill()

  ctx.fillStyle = '#94a3b8'
  ctx.fillRect(-5, -1, 10, 2)

  ctx.restore()
}

function drawFurnaceCard(ctx: CanvasRenderingContext2D, state: BralState) {
  const x = 10
  const y = 178
  const w = 166
  const h = 74
  const zone = ovenZone(state.ovenTemp)

  traceRoundedRect(ctx, x, y, w, h, 8)
  ctx.fillStyle = '#0f1e24'
  ctx.fill()
  ctx.strokeStyle =
    zone === 'optimal' ? '#22c55e' : zone === 'hot' ? '#ef4444' : '#38bdf8'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.font = '600 11px sans-serif'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText('Ovn', x + 10, y + 8)

  const zoneText =
    zone === 'optimal' ? 'Smelter' : zone === 'hot' ? 'For varm!' : 'For kold'
  ctx.textAlign = 'right'
  ctx.fillStyle =
    zone === 'optimal' ? '#4ade80' : zone === 'hot' ? '#f87171' : '#7dd3fc'
  ctx.fillText(
    `${Math.round(state.ovenTemp)} °C · ${zoneText}`,
    x + w - 10,
    y + 8,
  )

  const barX = x + 10
  const barY = y + 32
  const barW = w - 20
  const barH = 16
  const span = OVEN_MAX_TEMP - OVEN_MIN_TEMP
  const sweetStart = ((OVEN_SWEET_MIN - OVEN_MIN_TEMP) / span) * barW
  const sweetEnd = ((OVEN_SWEET_MAX - OVEN_MIN_TEMP) / span) * barW
  const targetX = barX + ((OVEN_TARGET_TEMP - OVEN_MIN_TEMP) / span) * barW

  ctx.fillStyle = '#1e3a5f'
  ctx.fillRect(barX, barY, sweetStart, barH)
  ctx.fillStyle = '#15803d'
  ctx.fillRect(barX + sweetStart, barY, sweetEnd - sweetStart, barH)
  ctx.fillStyle = '#991b1b'
  ctx.fillRect(barX + sweetEnd, barY, barW - sweetEnd, barH)

  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 1
  ctx.strokeRect(barX, barY, barW, barH)

  ctx.strokeStyle = '#bbf7d0'
  ctx.beginPath()
  ctx.moveTo(targetX, barY - 2)
  ctx.lineTo(targetX, barY + barH + 2)
  ctx.stroke()

  const clampedTemp = Math.max(
    OVEN_MIN_TEMP,
    Math.min(OVEN_MAX_TEMP, state.ovenTemp),
  )
  const needleX = barX + ((clampedTemp - OVEN_MIN_TEMP) / span) * barW
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(needleX - 2, barY - 4, 4, barH + 8)

  ctx.font = '10px sans-serif'
  ctx.fillStyle = '#94a3b8'
  ctx.textAlign = 'center'
  ctx.fillText('660 °C', targetX, barY + barH + 5)
}

export function formatCanCount(cans: number): string {
  if (cans < 1e-6) return '0'
  const rounded = Math.round(cans)
  if (Math.abs(cans - rounded) < 0.05) return String(rounded)
  return cans.toFixed(1).replace('.', ',')
}

function drawCrucibleCard(ctx: CanvasRenderingContext2D, state: BralState) {
  const x = 184
  const y = 178
  const w = 166
  const h = 74
  const zone = ovenZone(state.ovenTemp)
  const readyCoins = Math.floor(state.molten / BRAL_CANS_PER_COIN)
  const coinProgress = Math.min(1, state.molten / BRAL_CANS_PER_COIN)

  traceRoundedRect(ctx, x, y, w, h, 8)
  ctx.fillStyle = zone === 'hot' ? '#241418' : '#0f1e24'
  ctx.fill()
  ctx.strokeStyle = readyCoins > 0 ? '#f59e0b' : '#334155'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.font = '600 11px sans-serif'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText('Digel', x + 10, y + 8)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#e2e8f0'
  ctx.fillText(
    `I kø: ${formatCanCount(Math.max(0, state.crucibleCans))}`,
    x + w - 10,
    y + 8,
  )

  const barX = x + 10
  const barY = y + 32
  const barW = w - 20
  const barH = 16

  ctx.fillStyle = '#1e293b'
  ctx.fillRect(barX, barY, barW, barH)

  ctx.fillStyle = readyCoins > 0 ? '#f59e0b' : '#94a3b8'
  ctx.fillRect(barX, barY, barW * coinProgress, barH)

  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 1
  for (let tick = 1; tick < BRAL_CANS_PER_COIN; tick += 1) {
    const tx = barX + (barW * tick) / BRAL_CANS_PER_COIN
    ctx.beginPath()
    ctx.moveTo(tx, barY)
    ctx.lineTo(tx, barY + barH)
    ctx.stroke()
  }
  ctx.strokeRect(barX, barY, barW, barH)

  ctx.font = '10px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle =
    zone === 'hot' ? '#fca5a5' : readyCoins > 0 ? '#fde68a' : '#94a3b8'
  const statusText =
    zone === 'hot'
      ? 'Metal fordamper!'
      : readyCoins > 0
        ? `Klar til ${readyCoins} ${readyCoins === 1 ? 'mønt' : 'mønter'}`
        : `${state.molten.toFixed(1).replace('.', ',')} / ${BRAL_CANS_PER_COIN} dåser smeltet`
  ctx.fillText(statusText, barX, barY + barH + 5)
}

function drawStrikeBar(ctx: CanvasRenderingContext2D, state: BralState) {
  const x = 10
  const y = 258
  const w = BRAL_WORLD.w - 20
  const h = 54
  const ready = state.molten >= BRAL_CANS_PER_COIN

  traceRoundedRect(ctx, x, y, w, h, 8)
  ctx.fillStyle = '#0f1e24'
  ctx.fill()
  ctx.strokeStyle = ready ? '#fbbf24' : '#334155'
  ctx.lineWidth = 1.5
  ctx.stroke()

  if (!ready) {
    ctx.font = '600 12px sans-serif'
    ctx.fillStyle = '#94a3b8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Smelt 4 dåser for at slå en mønt', x + w / 2, y + h / 2)
    return
  }

  const barX = x + 12
  const barY = y + 12
  const barW = w - 24
  const barH = 20

  ctx.fillStyle = '#334155'
  ctx.fillRect(barX, barY, barW, barH)

  const femStart = (0.5 - STRIKE_FEM_HALF_WIDTH) * barW
  const femW = STRIKE_FEM_HALF_WIDTH * 2 * barW
  ctx.fillStyle = '#b45309'
  ctx.fillRect(barX + femStart, barY, femW, barH)

  const tiStart = (0.5 - STRIKE_TI_HALF_WIDTH) * barW
  const tiW = STRIKE_TI_HALF_WIDTH * 2 * barW
  ctx.fillStyle = '#f59e0b'
  ctx.fillRect(barX + tiStart, barY, tiW, barH)

  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1
  ctx.strokeRect(barX, barY, barW, barH)

  const needleX = barX + state.markerPos * barW
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(needleX - 2.5, barY - 4, 5, barH + 8)

  ctx.font = '600 10px sans-serif'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText('1', barX + barW * 0.13, barY + barH + 4)
  ctx.fillText('5', barX + barW * 0.34, barY + barH + 4)
  ctx.fillStyle = '#fde68a'
  ctx.fillText('10', barX + barW * 0.5, barY + barH + 4)
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText('5', barX + barW * 0.66, barY + barH + 4)
  ctx.fillText('1', barX + barW * 0.87, barY + barH + 4)
}

function drawLastCoinBanner(ctx: CanvasRenderingContext2D, state: BralState) {
  if (!state.lastCoin) return
  const badgeW = 148
  const badgeH = 32
  const badgeX = (BRAL_WORLD.w - badgeW) / 2
  const badgeY = state.shortage === 'active' ? 112 : 14

  traceRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 16)
  ctx.fillStyle =
    state.lastCoin.denomination === 'ti'
      ? '#f59e0b'
      : state.lastCoin.denomination === 'fem'
        ? '#d97706'
        : '#cbd5e1'
  ctx.fill()
  ctx.strokeStyle = '#fef3c7'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.font = '700 13px sans-serif'
  ctx.fillStyle = '#0f172a'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    `${state.lastCoin.label} +${state.lastCoin.value}`,
    BRAL_WORLD.w / 2,
    badgeY + badgeH / 2,
  )
}

function drawShortageHud(ctx: CanvasRenderingContext2D, state: BralState) {
  if (state.shortage !== 'active') return
  const pillW = 94
  const pillH = 22
  const pillX = BRAL_WORLD.w - pillW - 10
  const pillY = 144

  traceRoundedRect(ctx, pillX, pillY, pillW, pillH, 6)
  ctx.fillStyle = 'rgba(28, 25, 23, 0.88)'
  ctx.fill()
  ctx.strokeStyle = '#d97706'
  ctx.lineWidth = 1.2
  ctx.stroke()

  ctx.font = '700 10px monospace'
  ctx.fillStyle = '#fde68a'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    `RINGTRÆK ${state.pullTabs}/${BRAL_TABS_PER_COIN}`,
    pillX + pillW / 2,
    pillY + pillH / 2,
  )
}

/** Tegner støberiet: faldende øldåser, ringtræk, ovn, digel og prægebjælke. */
export function drawBral(
  ctx: CanvasRenderingContext2D,
  state: BralState,
  scale = 2,
) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  const { w, h } = BRAL_WORLD

  const sky = ctx.createLinearGradient(0, 0, 0, 176)
  if (state.shortage === 'active') {
    sky.addColorStop(0, '#221a13')
    sky.addColorStop(1, '#2e2217')
  } else {
    sky.addColorStop(0, '#132329')
    sky.addColorStop(1, '#1b3138')
  }
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, 176)

  ctx.fillStyle = '#0c161a'
  ctx.fillRect(0, 172, w, h - 172)

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)'
  ctx.lineWidth = 1
  for (const guideX of [90, 180, 270]) {
    ctx.beginPath()
    ctx.moveTo(guideX, 12)
    ctx.lineTo(guideX, 166)
    ctx.stroke()
  }

  for (const item of state.cans) {
    if (item.kind === 'tab') {
      drawPullTab(ctx, item)
    } else {
      drawCan(ctx, item)
    }
  }

  drawShortageHud(ctx, state)
  drawLastCoinBanner(ctx, state)
  drawFurnaceCard(ctx, state)
  drawCrucibleCard(ctx, state)
  drawStrikeBar(ctx, state)
}
