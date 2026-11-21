/**
 * Logger ind på et V2-preview og lægger et Bral-resultat via den samme
 * mutation, spillet kalder (`games:submit`). Bagefter skal listen på siden
 * vise det. Hemmeligheder skrives ikke ud.
 */
import { createRequire } from 'node:module'

function normalizePreviewEmail(value) {
  return value
    .replace(/[\r\n]/g, '')
    .trim()
    .toLowerCase()
}

function normalizePreviewPassword(value) {
  return value.replace(/[\r\n]+$/g, '')
}

const email = normalizePreviewEmail(process.env.PREVIEW_TEST_EMAIL ?? '')
const password = normalizePreviewPassword(
  process.env.PREVIEW_TEST_PASSWORD ?? '',
)
const previewPath = process.env.PREVIEW_PATH ?? ''

if (!email || !password || !previewPath.startsWith('/pr-preview/')) {
  console.error(
    'Mangler PREVIEW_TEST_EMAIL, PREVIEW_TEST_PASSWORD eller PREVIEW_PATH.',
  )
  process.exit(1)
}

const require = createRequire(
  process.env.PUPPETEER_REQUIRE_FROM ?? import.meta.url,
)
const puppeteer = require('puppeteer')

function redact(value) {
  return String(value)
    .split(email)
    .join('[redacted]')
    .split(password)
    .join('[redacted]')
}

const origin = 'https://naturklubben.dk'
const base =
  origin + (previewPath.endsWith('/') ? previewPath : `${previewPath}/`)

async function setField(page, selector, value) {
  await page.waitForSelector(selector)
  await page.evaluate(
    (sel, next) => {
      const field = document.querySelector(sel)
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      ).set
      setter.call(field, next)
      field.dispatchEvent(new Event('input', { bubbles: true }))
      field.dispatchEvent(new Event('change', { bubbles: true }))
    },
    selector,
    value,
  )
}

async function runOnce() {
  const hosts = new Set()
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(20000)
    await page.setCacheEnabled(false)
    await page.setViewport({ width: 1280, height: 800 })
    page.on('request', (request) => {
      try {
        const url = new URL(request.url())
        if (url.hostname.endsWith('.convex.cloud')) hosts.add(url.hostname)
      } catch {
        // Ugyldige URL'er er ikke Convex-værter.
      }
    })
    page.on('pageerror', (error) => {
      console.error(`pageerror: ${redact(error.message)}`)
    })

    await page.goto(`${base}login?cb=${Date.now()}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await setField(page, '#login-email', email)
    await setField(page, '#login-password', password)
    await page.click('button[type="submit"]')
    await page.waitForFunction(
      () => document.body?.innerText?.includes('Gå til kalender'),
      { timeout: 30000 },
    )

    const token = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((name) =>
        name.startsWith('__convexAuthJWT'),
      )
      return key ? localStorage.getItem(key) : null
    })
    if (!token) throw new Error('Manglede sessionstoken')
    const host = [...hosts].find((name) => name.endsWith('.convex.cloud'))
    if (!host) throw new Error('Ingen Convex-vært')
    if (host.includes('quaint-parakeet-652')) {
      throw new Error('Login ramte produktions-deploymentet')
    }

    function isPlausibleBralScore(score, lines) {
      if (lines < 0 || lines > 23) return false
      for (let ti = 0; ti <= lines; ti += 1) {
        const restCoins = lines - ti
        const restScore = score - ti * 10
        if (restScore < 0) break
        const diff = restScore - restCoins
        if (diff >= 0 && diff % 4 === 0 && diff / 4 <= restCoins) return true
      }
      return false
    }

    function minCoinsForScore(score) {
      return Math.floor(score / 10) + Math.floor((score % 10) / 5) + (score % 5)
    }

    async function queryConvex(path, args) {
      const queryRes = await fetch(`https://${host}/api/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path, args, format: 'json' }),
      })
      if (!queryRes.ok) {
        throw new Error(`${path} svarede ${queryRes.status}`)
      }
      const data = await queryRes.json()
      if (data.status && data.status !== 'success') {
        throw new Error(
          `${path} fejlede: ${redact(JSON.stringify(data)).slice(0, 180)}`,
        )
      }
      return data.value
    }

    const personalBest = await queryConvex('games:personalBest', {
      game: 'bral',
    })
    const bestScore =
      typeof personalBest?.score === 'number' ? personalBest.score : 0
    const initialFloor = 26 + (Math.floor(Date.now() / 1000) % 30)

    let target = null
    for (
      let candidate = Math.max(initialFloor, bestScore + 1);
      candidate <= 230;
      candidate += 1
    ) {
      const lines = minCoinsForScore(candidate)
      if (isPlausibleBralScore(candidate, lines)) {
        target = { score: candidate, lines }
        break
      }
    }

    let expectOnOverview = true
    if (!target) {
      expectOnOverview = false
      const recent = await queryConvex('games:recent', { game: 'bral' })
      const recentScores = new Set(
        Array.isArray(recent) ? recent.map((row) => row.score) : [],
      )
      for (let candidate = 225; candidate >= 25; candidate -= 1) {
        const lines = minCoinsForScore(candidate)
        if (
          !recentScores.has(candidate) &&
          isPlausibleBralScore(candidate, lines)
        ) {
          target = { score: candidate, lines }
          break
        }
      }
      if (!target) {
        target = { score: 225, lines: minCoinsForScore(225) }
      }
    }

    const response = await fetch(`https://${host}/api/mutation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: 'games:submit',
        args: {
          game: 'bral',
          score: target.score,
          lines: target.lines,
          level: 1,
          durationSeconds: 60,
        },
        format: 'json',
      }),
    })
    const raw = await response.text()
    if (!response.ok) {
      throw new Error(
        `games:submit svarede ${response.status}: ${redact(raw).slice(0, 180)}`,
      )
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('games:submit gav ikke JSON')
    }
    if (parsed.status && parsed.status !== 'success') {
      throw new Error(
        `games:submit afvist: ${redact(JSON.stringify(parsed)).slice(0, 180)}`,
      )
    }
    console.log(`Bral-resultatet (${target.score}) blev gemt.`)

    // Ny fane: den åbne Convex-websocket kan hænge navigationen.
    async function open(route, ready, arg) {
      const next = await browser.newPage()
      await next.setViewport({ width: 1280, height: 800 })
      const response = await next.goto(`${base}${route}?cb=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      if (response !== null && response.status() >= 400) {
        throw new Error(`HTTP ${response.status()} på /${route}`)
      }
      await next.waitForFunction(ready, { timeout: 30000 }, arg)
      await next.close()
    }

    const expectedCoins = `${target.lines} ${target.lines === 1 ? 'mønt' : 'mønter'}`
    await open(
      'spil/bral',
      (expected) => {
        const text = document.body?.innerText ?? ''
        const hasScore = new RegExp(`\\b${expected.score}\\b`).test(text)
        return (
          text.includes('Resultatliste') &&
          text.includes('Seneste spil') &&
          text.includes('Preview-tester') &&
          text.includes('dig') &&
          text.includes(expected.coins) &&
          hasScore
        )
      },
      { score: target.score, coins: expectedCoins },
    )
    console.log(
      `Resultatlisten på /spil/bral viser ${target.score} point (${expectedCoins}).`,
    )

    const overviewScore = expectOnOverview ? target.score : bestScore
    await open(
      'spil',
      (expectedScore) => {
        const text = document.body?.innerText ?? ''
        const hasScore = new RegExp(`\\b${expectedScore}\\b`).test(text)
        return (
          text.includes('Bral smeltning — de bedste') &&
          text.includes('Preview-tester') &&
          hasScore
        )
      },
      overviewScore,
    )
    console.log('Oversigten under Spil viser det samme resultat.')
  } finally {
    await browser.close()
  }
}

const attempts = 4
let lastError = 'ukendt'
for (let attempt = 1; attempt <= attempts; attempt++) {
  try {
    await runOnce()
    console.log(`Bral-resultatlisten bestod (forsøg ${attempt}).`)
    process.exit(0)
  } catch (error) {
    lastError = redact(
      error instanceof Error ? (error.stack ?? error.message) : error,
    )
    console.error(
      `Forsøg ${attempt}/${attempts} fejlede: ${lastError.split('\n')[0]}`,
    )
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 8000))
    }
  }
}
console.error(lastError)
process.exit(1)
