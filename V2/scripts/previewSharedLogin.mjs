/**
 * Logger ind på et V2-preview som Martin med den fælles adgangskode og
 * tjekker, at medlemslisten har de seedede navne. Hemmeligheden skrives ikke ud.
 *
 * Køres fra pr-preview-v2.yml. Springer over, når adgangskoden mangler.
 * Puppeteer resolves via PUPPETEER_REQUIRE_FROM.
 */
import { createRequire } from 'node:module'

function normalizePreviewPassword(value) {
  return value.replace(/[\r\n]+$/g, '')
}

const email = 'martin.martinjensen@gmail.com'
const password = normalizePreviewPassword(
  process.env.PREVIEW_SHARED_PASSWORD ?? '',
)
const previewPath = process.env.PREVIEW_PATH ?? ''
const expectName = 'Martin'

if (!previewPath.startsWith('/pr-preview/')) {
  console.error('Mangler PREVIEW_PATH.')
  process.exit(1)
}

if (password.length < 6) {
  console.log(
    'PREVIEW_SHARED_PASSWORD mangler -- fælles preview-login springes over.',
  )
  process.exit(0)
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
const names = [
  'Martin',
  'Kasper (test)',
  'Kasper',
  'Troels',
  'Mikkel',
  'Uffe',
  'Grok Bot',
  'Preview-tester',
]

async function assertText(page, text, timeout = 20000) {
  await page.waitForFunction(
    (expected) => document.body?.innerText?.includes(expected),
    { timeout },
    text,
  )
}

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

async function clickText(page, text) {
  await page.waitForFunction(
    (label) =>
      [...document.querySelectorAll('a,button')].some((el) =>
        el.textContent?.includes(label),
      ),
    { timeout: 20000 },
    text,
  )
  await page.evaluate((label) => {
    const el = [...document.querySelectorAll('a,button')].find((node) =>
      node.textContent?.includes(label),
    )
    el?.click()
  }, text)
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
    await new Promise((resolve, reject) => {
      let settled = false
      page
        .waitForFunction(
          () => document.body?.innerText?.includes('Gå til kalender'),
          { timeout: 30000 },
        )
        .then(() => {
          settled = true
          resolve()
        }, reject)
      page.waitForSelector('#login-error', { timeout: 30000 }).then(
        async () => {
          if (settled) return
          const text = await page.$eval('#login-error', (el) => {
            const code = el.getAttribute('data-code') ?? ''
            return `${code}: ${el.textContent ?? ''}`
          })
          const loginError = new Error(`Login afvist: ${redact(text)}`)
          loginError.fatal = true
          reject(loginError)
        },
        () => {
          // Selektor-timeout er i orden, når login lykkes uden fejltekst.
        },
      )
    })

    await clickText(page, 'Profil')
    await page.waitForSelector('#fullName', { timeout: 20000 })
    const name = await page.$eval('#fullName', (input) => input.value)
    if (name !== expectName) {
      throw new Error(`Profilnavn var ${JSON.stringify(redact(name))}`)
    }

    await clickText(page, 'Medlemmer')
    await assertText(page, 'Grok Bot')
    const headings = await page.$$eval('h2', (nodes) =>
      nodes.map((node) =>
        (node.textContent ?? '')
          .replace(/\s+/g, ' ')
          .replace(/\s*\(dig\)\s*$/, '')
          .trim(),
      ),
    )
    const missing = names.filter((memberName) => !headings.includes(memberName))
    if (missing.length > 0) {
      throw new Error(`Medlemslisten mangler: ${missing.join(', ')}`)
    }
    await assertText(page, 'Administrator')

    const hostList = [...hosts]
    if (hostList.length === 0) throw new Error('Ingen Convex-vært ved login')
    if (hostList.some((host) => host.includes('quaint-parakeet-652'))) {
      throw new Error('Login ramte produktions-deploymentet')
    }
    console.log(`Fælles login bestod mod ${hostList.join(', ')}.`)
  } finally {
    await browser.close()
  }
}

const attempts = 6
let lastError = 'ukendt'
for (let attempt = 1; attempt <= attempts; attempt++) {
  try {
    await runOnce()
    console.log(`Fælles preview-login bestod (forsøg ${attempt}).`)
    process.exit(0)
  } catch (error) {
    lastError = redact(
      error instanceof Error ? (error.stack ?? error.message) : error,
    )
    console.error(
      `Forsøg ${attempt}/${attempts} fejlede: ${lastError.split('\n')[0]}`,
    )
    if (error && error.fatal) break
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 10000))
    }
  }
}
console.error(lastError)
process.exit(1)
