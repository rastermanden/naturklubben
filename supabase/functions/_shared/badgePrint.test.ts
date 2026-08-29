import { strict as assert } from 'node:assert'
import {
  badgePrintGeometry,
  MAX_PRINT_PX,
  printSideMm,
  recommendedCropSizePx,
} from './badgePrint.ts'

Deno.test('badgePrintGeometry: bleed lægges uden om den synlige cirkel', () => {
  // 58 mm badge med 5 mm bleed = 68 mm trykfil ved 300 dpi.
  const geometry = badgePrintGeometry({
    imageWidth: 2000,
    imageHeight: 2000,
    cropX: 400,
    cropY: 400,
    cropSize: 1000,
    diameterMm: 58,
    bleedMm: 5,
  })

  assert.equal(printSideMm(58, 5), 68)
  assert.equal(geometry.printPx, Math.round((68 / 25.4) * 300))

  // Udsnittet vokser med bleed'en i originalens egen skala: 1000 px svarer til
  // 58 mm, så 5 mm bleed er 86,2 px i hver side.
  assert.equal(geometry.canvasSize, Math.round(1000 + 2 * (5 * (1000 / 58))))
  assert.equal(geometry.needsEdgeFill, false)
  assert.equal(geometry.offsetX, 0)
  assert.equal(geometry.offsetY, 0)
  assert.equal(geometry.regionWidth, geometry.canvasSize)

  // Skærelinjen skal ligge, hvor de 58 mm slutter -- ikke ved kanten af filen.
  assert.equal(
    Math.round(geometry.cutRadiusPx),
    Math.round((geometry.printPx * (58 / 68)) / 2),
  )
})

Deno.test(
  'badgePrintGeometry: bleed uden for originalen skal fyldes ud',
  () => {
    // Udsnittet fylder hele billedet, så der er intet billede tilbage til bleed.
    const geometry = badgePrintGeometry({
      imageWidth: 1000,
      imageHeight: 1000,
      cropX: 0,
      cropY: 0,
      cropSize: 1000,
      diameterMm: 58,
      bleedMm: 5,
    })

    assert.equal(geometry.needsEdgeFill, true)
    assert.equal(geometry.regionX, 0)
    assert.equal(geometry.regionY, 0)
    assert.equal(geometry.regionWidth, 1000)
    assert.equal(geometry.regionHeight, 1000)
    // Udsnittet placeres inde på canvas'et, så der er plads til bleed i toppen
    // og til venstre.
    assert.ok(geometry.offsetX > 0)
    assert.ok(geometry.offsetY > 0)
  },
)

Deno.test('badgePrintGeometry: en urimelig diameter rammer loftet', () => {
  // Databasen tillader højst 200 mm + 20 mm bleed (= 2835 px), så loftet er
  // rent en sikkerhedsventil, hvis functionen nogensinde kaldes med tal, der
  // ikke kom fra badges-rækken.
  const geometry = badgePrintGeometry({
    imageWidth: 6000,
    imageHeight: 6000,
    cropX: 0,
    cropY: 0,
    cropSize: 6000,
    diameterMm: 500,
    bleedMm: 20,
  })

  assert.equal(geometry.printPx, MAX_PRINT_PX)
  assert.ok(
    badgePrintGeometry({
      imageWidth: 6000,
      imageHeight: 6000,
      cropX: 0,
      cropY: 0,
      cropSize: 6000,
      diameterMm: 200,
      bleedMm: 20,
    }).printPx < MAX_PRINT_PX,
  )
})

Deno.test('badgePrintGeometry: ugyldige mål afvises', () => {
  assert.throws(() =>
    badgePrintGeometry({
      imageWidth: 1000,
      imageHeight: 1000,
      cropX: 0,
      cropY: 0,
      cropSize: 0,
      diameterMm: 58,
      bleedMm: 5,
    }),
  )
})

Deno.test('recommendedCropSizePx: 300 dpi på den synlige cirkel', () => {
  assert.equal(recommendedCropSizePx(58), Math.ceil((58 / 25.4) * 300))
  // ~685 px for et 58 mm badge -- derfor er anbefalingen om mindst 1000x1000
  // px i UI'et rigelig, også med bleed.
  assert.ok(recommendedCropSizePx(58) < 1000)
})

Deno.test(
  'badgePrintGeometry: renderingen holder sig i trykfilens opløsning',
  () => {
    // Et helt almindeligt telefonbillede: 4032x3024 med et stort udsnit.
    // Uden nedskaleringen ville renderingen allokere flere buffere på
    // canvasSize x canvasSize (~3000 px) -- mere end Edge-runtimen har.
    const geometry = badgePrintGeometry({
      imageWidth: 4032,
      imageHeight: 3024,
      cropX: 800,
      cropY: 300,
      cropSize: 2400,
      diameterMm: 58,
      bleedMm: 5,
    })

    assert.ok(geometry.canvasSize > geometry.printPx)
    assert.equal(geometry.renderScale, geometry.printPx / geometry.canvasSize)
    // Udsnittet dækker hele canvas'et, så det skaleres præcis ned til filens
    // kant -- ingen hvid strimmel af afrunding.
    assert.equal(geometry.needsEdgeFill, false)
    assert.equal(geometry.scaledRegionWidth, geometry.printPx)
    assert.equal(geometry.scaledRegionHeight, geometry.printPx)
    assert.equal(geometry.scaledOffsetX, 0)
    assert.equal(geometry.scaledOffsetY, 0)
  },
)

Deno.test(
  'badgePrintGeometry: det skalerede udsnit kan ikke lande uden for filen',
  () => {
    // Udsnittet rører alle fire kanter, så bleed'en mangler billede hele vejen
    // rundt. Afrundingen af både størrelse og placering skal stadig holde sig
    // inden for printPx -- imagescript kaster på en composite uden for kanten.
    const geometry = badgePrintGeometry({
      imageWidth: 1001,
      imageHeight: 1001,
      cropX: 0,
      cropY: 0,
      cropSize: 1001,
      diameterMm: 37,
      bleedMm: 3,
    })

    assert.equal(geometry.needsEdgeFill, true)
    assert.ok(geometry.scaledOffsetX > 0)
    assert.ok(geometry.scaledOffsetY > 0)
    assert.ok(
      geometry.scaledOffsetX + geometry.scaledRegionWidth <= geometry.printPx,
    )
    assert.ok(
      geometry.scaledOffsetY + geometry.scaledRegionHeight <= geometry.printPx,
    )
  },
)

Deno.test(
  'badgePrintGeometry: en original mindre end trykfilen skaleres op',
  () => {
    // 300 dpi kræver ~685 px for et 58 mm badge. Er originalen mindre, må
    // renderingen skalere op -- men stadig kun én gang, til printPx.
    const geometry = badgePrintGeometry({
      imageWidth: 400,
      imageHeight: 400,
      cropX: 50,
      cropY: 50,
      cropSize: 300,
      diameterMm: 58,
      bleedMm: 5,
    })

    assert.ok(geometry.renderScale > 1)
    assert.ok(geometry.effectiveDpi < 300)
    assert.ok(geometry.scaledRegionWidth <= geometry.printPx)
    assert.ok(geometry.scaledRegionHeight <= geometry.printPx)
  },
)
