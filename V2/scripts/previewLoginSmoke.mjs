/**
 * Logger ind på et V2-preview med testbrugeren og tjekker, at forsiden,
 * aktiviteterne og den offentlige tur svarer. Hemmeligheder skrives ikke ud.
 *
 * Køres fra pr-preview-v2.yml. Puppeteer resolves via PUPPETEER_REQUIRE_FROM,
 * så pakken ikke skal ligge i appens egne dependencies.
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

const hosts = new Set()

async function assertText(page, text, timeout = 20000) {
  await page.waitForFunction(
    (expected) => document.body?.innerText?.includes(expected),
    { timeout },
    text,
  )
}

async function open(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
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
  hosts.clear()
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
    const document404s = []
    page.on('response', (response) => {
      if (
        response.request().resourceType() === 'document' &&
        response.status() === 404
      ) {
        document404s.push(response.url())
      }
    })
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) console.log(`frame ${frame.url()}`)
    })
    page.on('pageerror', (error) => {
      console.error(`pageerror: ${redact(error.message)}`)
    })

    // Index-filen findes. Dybe links går gennem rodens 404, så vi klikker os
    // rundt i appen i stedet.
    // Uden et unikt query-parameter kan Pages' CDN blive ved med at svare
    // med et op til ti minutter gammelt index.
    await open(page, `${base}?cb=${Date.now()}`)
    await assertText(page, 'V2 ·', 8000)
    await clickText(page, 'Se aktiviteter')
    await assertText(page, 'Skovtur')
    await clickText(page, 'Naturklubben')
    await clickText(page, 'Se åbne ture')
    await assertText(page, 'Preview-tur')
    await clickText(page, 'Log ind')
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

    await clickText(page, 'Min profil')
    await page.waitForSelector('#fullName', { timeout: 20000 })
    const name = await page.$eval('#fullName', (input) => input.value)
    if (name !== 'Preview-tester') {
      throw new Error(`Profilnavn var ${JSON.stringify(redact(name))}`)
    }

    // Direkte indlæsning, ikke et klik: GitHub Pages skal svare 200, og
    // sessionen skal stadig være der bagefter.
    const reloads = [
      ['', 'Kalenderen, aktiviteterne og de andre medlemmer er åbne for dig.'],
      ['kalender', 'Preview-tur'],
      ['aktiviteter', 'Skovtur'],
      ['spil', '7-kabale'],
      ['spil/kabale', 'Sådan spiller du'],
      ['billeder', 'Uden begivenhed'],
      ['naturlog', 'Rød ræv'],
      ['chat', 'Hej fra previewet. Skoven er grøn i dag.'],
      ['profil', 'Min profil'],
      ['medlemmer', 'Medlemmer'],
      [
        'login',
        'Kalenderen, aktiviteterne og de andre medlemmer er åbne for dig.',
      ],
    ]
    try {
      for (const [route, text] of reloads) {
        console.log(`genindlæser /${route}`)
        // Ny fane i samme browser: localStorage (sessionen) følger med,
        // uden at den åbne Convex-websocket kan hænge navigationen.
        const next = await browser.newPage()
        await next.setViewport({ width: 1280, height: 800 })
        const response = await next.goto(`${base}${route}`, {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        })
        if (response !== null && response.status() >= 400) {
          throw new Error(`HTTP ${response.status()} på /${route}`)
        }
        await assertText(next, text)
        if (route === 'aktiviteter') {
          await assertText(next, 'Naturlog')
          await assertText(next, 'Spil')
        }
        if (route === 'profil') {
          await next.waitForSelector('#fullName', { timeout: 20000 })
          const name = await next.$eval('#fullName', (input) => input.value)
          if (name !== 'Preview-tester') {
            throw new Error(`Profilnavn var ${JSON.stringify(redact(name))}`)
          }
          await next.waitForFunction(
            () => {
              const image = document.querySelector('img[alt="Preview-tester"]')
              return (
                image instanceof HTMLImageElement &&
                image.complete &&
                image.naturalWidth > 0
              )
            },
            { timeout: 20000 },
          )
        }
        const loggedOut = await next.evaluate(
          () =>
            document.body?.innerText.includes('Log ind for at se kalender') ??
            false,
        )
        if (loggedOut) {
          throw new Error(`Sessionen manglede efter genindlæs af /${route}`)
        }
        await next.close()
      }
    } catch (error) {
      if (error && typeof error === 'object') error.fatal = true
      throw error
    }
    if (document404s.length > 0) {
      throw new Error(`Dokument-404: ${document404s.join(', ')}`)
    }

    for (const host of hosts) {
      if (host.includes('quaint-parakeet-652')) {
        throw new Error(`Previewet taler med produktion: ${host}`)
      }
    }
    if (hosts.size === 0) {
      throw new Error('Ingen forbindelse til et Convex-deployment.')
    }
    console.log(`Convex-værter: ${[...hosts].join(', ')}`)
  } finally {
    await browser.close()
  }
}

const attempts = 18
let lastError = 'ukendt'
for (let attempt = 1; attempt <= attempts; attempt++) {
  try {
    await runOnce()
    console.log(`Login-smoke bestod (forsøg ${attempt}).`)
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
