/**
 * Naturquizzens spørgsmålsbank -- et startsæt af danske arter med et billede,
 * en kildeangivelse og den kategori (fugl, plante, spor), de skal genkendes
 * fra. Billederne hentes fra Wikimedia Commons og ligger ikke i repoet: kun
 * URL'en gemmes her, så en runde ikke gør andre sider tungere at hente.
 *
 * Strukturen er bevidst enkel -- en flad liste af `Species` -- så en senere
 * kilde (Naturklubbens egne observationer fra Naturlog, se `#221`) kan bygge
 * sin egen liste af samme form og lægges sammen med denne, uden at
 * spillogikken i `engine.ts` skal ændres.
 */

export type SpeciesCategory = 'fugl' | 'plante' | 'spor'

export interface Species {
  /** Stabilt id, uafhængigt af navnet -- til brug i tests og som React-key. */
  id: string
  category: SpeciesCategory
  /** Det danske navn: både det, spilleren skal genkende, og svarknappens tekst. */
  name: string
  /** Det videnskabelige navn, vist i "Kilder"-sektionen. */
  scientificName: string
  image: {
    /** Hentes direkte fra Wikimedia Commons -- ikke lagt i repoet. */
    url: string
    /** Dansk alternativtekst: beskriver kun det, billedet viser -- aldrig
     *  artens navn. Ellers får en, der bruger skærmlæser, svaret foræret,
     *  hvor en seende selv skal genkende det. */
    alt: string
  }
  attribution: {
    /** Ophavsmand, som Commons-filsiden angiver det. */
    author: string
    /** F.eks. "CC BY-SA 4.0" eller "Public domain". */
    licence: string
    /** Filsiden på Wikimedia Commons, til efterprøvning af kilde og licens. */
    sourceUrl: string
  }
}

function commonsFilePath(filename: string, width = 480): string {
  const encoded = encodeURIComponent(filename.replaceAll(' ', '_'))
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=${width}`
}

function commonsSourceUrl(filename: string): string {
  const encoded = encodeURIComponent(filename.replaceAll(' ', '_'))
  return `https://commons.wikimedia.org/wiki/File:${encoded}`
}

interface SpeciesSeed {
  id: string
  category: SpeciesCategory
  name: string
  scientificName: string
  alt: string
  file: string
  author: string
  licence: string
}

/** Rå data: filnavnet på Commons er nok til at udlede både billed-URL og kilde-URL. */
const seeds: readonly SpeciesSeed[] = [
  // -- Fugle -----------------------------------------------------------
  {
    id: 'blaamejse',
    category: 'fugl',
    name: 'Blåmejse',
    scientificName: 'Cyanistes caeruleus',
    alt: 'Lille fugl med blå isse, hvide kinder og gule underdele, siddende på en gren',
    file: 'Cyanistes caeruleus 3 Luc Viatour.jpg',
    author: 'Luc Viatour',
    licence: 'CC BY-SA 3.0',
  },
  {
    id: 'musvit',
    category: 'fugl',
    name: 'Musvit',
    scientificName: 'Parus major',
    alt: 'Fugl med sort hoved, hvide kinder, gul bug og en sort stribe ned over brystet',
    file: 'Parus major m.jpg',
    author: 'Sławek Staszczuk',
    licence: 'CC BY-SA 3.0',
  },
  {
    id: 'roedhals',
    category: 'fugl',
    name: 'Rødhals',
    scientificName: 'Erithacus rubecula',
    alt: 'Lille brun fugl med orange bryst og ansigt',
    file: 'Erithacus rubecula profile.jpg',
    author: 'C-M',
    licence: 'CC BY-SA 4.0',
  },
  {
    id: 'bogfinke',
    category: 'fugl',
    name: 'Bogfinke',
    scientificName: 'Fringilla coelebs',
    alt: 'Fugl med blågråt hoved, rødbrunt bryst og hvide vingebånd',
    file: 'Fringilla coelebs chaffinch male edit2.jpg',
    author: 'MichaelMaggs (redigeret af Arad)',
    licence: 'CC BY-SA 2.5',
  },
  {
    id: 'solsort',
    category: 'fugl',
    name: 'Solsort',
    scientificName: 'Turdus merula',
    alt: 'Helsort fugl med gul næb og gul ring om øjet',
    file: 'Common Blackbird.jpg',
    author: 'Andreas Trepte',
    licence: 'CC BY-SA 2.5',
  },
  {
    id: 'graaspurv',
    category: 'fugl',
    name: 'Gråspurv',
    scientificName: 'Passer domesticus',
    alt: 'Fugl med grå isse, brune vinger og sort hage',
    file: 'House sparrow male in Prospect Park (53532).jpg',
    author: 'Rhododendrites',
    licence: 'CC BY-SA 4.0',
  },
  {
    id: 'stor-flagspaette',
    category: 'fugl',
    name: 'Stor flagspætte',
    scientificName: 'Dendrocopos major',
    alt: 'Sort-hvid fugl med store hvide skulderpletter og rød underhale, siddende på en stamme',
    file: 'Dendrocopos major MHNT 232.jpg',
    author: 'Didier Descouens',
    licence: 'CC BY-SA 4.0',
  },
  {
    id: 'taarnfalk',
    category: 'fugl',
    name: 'Tårnfalk',
    scientificName: 'Falco tinnunculus',
    alt: 'Rovfugl med rødbrune, sortplettede vinger, siddende på udkig',
    file: 'Common kestrel falco tinnunculus.jpg',
    author: 'Andreas Trepte',
    licence: 'CC BY-SA 2.5',
  },
  {
    id: 'knopsvane',
    category: 'fugl',
    name: 'Knopsvane',
    scientificName: 'Cygnus olor',
    alt: 'Stor, hvid svane med orange næb og sort knop ved næbroden, svømmende på vand',
    file: 'Höckerschwan Cygnus olor 7b Richard Bartz.jpg',
    author: 'Richard Bartz',
    licence: 'CC BY-SA 2.5',
  },

  // -- Planter -----------------------------------------------------------
  {
    id: 'maelkeboette',
    category: 'plante',
    name: 'Mælkebøtte',
    scientificName: 'Taraxacum officinale',
    alt: 'Gul, tæt pakket blomst med mange smalle kroneblade, i nærbillede',
    file: 'Dandelion flower macro taraxacum officinale.jpg',
    author: 'Ryan Hagerty, U.S. Fish and Wildlife Service',
    licence: 'Public domain',
  },
  {
    id: 'braendenaelde',
    category: 'plante',
    name: 'Brændenælde',
    scientificName: 'Urtica dioica',
    alt: 'Plante med modstillede, tandede blade og små brænde-hår på stænglen',
    file: 'Brandnetel, Urtica dioica, Locatie, Famberhorst.jpg',
    author: 'Dominicus Johannes Bergsma',
    licence: 'CC BY-SA 4.0',
  },
  {
    id: 'hvid-anemone',
    category: 'plante',
    name: 'Hvid anemone',
    scientificName: 'Anemone nemorosa',
    alt: 'Hvid blomst med seks-syv kroneblade og gule støvdragere, i nærbillede',
    file: 'Anemone nemorosa close up.jpg',
    author: 'Pierre-Jacques Despa',
    licence: 'CC BY-SA 4.0',
  },
  {
    id: 'roellike',
    category: 'plante',
    name: 'Røllike',
    scientificName: 'Achillea millefolium',
    alt: 'Plante med fjerlignende blade og flade, hvide blomsterskærme',
    file: 'Yarrow (Achillea millefolium).jpg',
    author: 'Petar Milošević',
    licence: 'CC BY-SA 4.0',
  },
  {
    id: 'skvalderkaal',
    category: 'plante',
    name: 'Skvalderkål',
    scientificName: 'Aegopodium podagraria',
    alt: 'Plante med hvide blomsterskærme og trekantede, tredelte blade',
    file: 'Ground elder (Aegopodium podagraria).jpg',
    author: 'Beko',
    licence: 'CC BY-SA 4.0',
  },
  {
    id: 'mjoedurt',
    category: 'plante',
    name: 'Mjødurt',
    scientificName: 'Filipendula ulmaria',
    alt: 'Plante med tætte, cremehvide, duftende blomsterklaser',
    file: 'Filipendula ulmaria detail.jpg',
    author: 'Marterum',
    licence: 'CC0',
  },
  {
    id: 'roed-kloever',
    category: 'plante',
    name: 'Rød kløver',
    scientificName: 'Trifolium pratense',
    alt: 'Plante med rundt, rødlilla blomsterhoved og trekoblede blade',
    file: 'Trifolium pratense - Keila2.jpg',
    author: 'Ivar Leidus',
    licence: 'CC BY-SA 4.0',
  },
  {
    id: 'kodriver',
    category: 'plante',
    name: 'Kodriver',
    scientificName: 'Primula veris',
    alt: 'Plante med gule, klokkeformede blomster samlet i en ensidig skærm',
    file: 'Primula veris flowers.jpg',
    author: 'Горбунова М.С.',
    licence: 'CC BY-SA 4.0',
  },
  {
    id: 'vild-koervel',
    category: 'plante',
    name: 'Vild kørvel',
    scientificName: 'Anthriscus sylvestris',
    alt: 'Høj plante med fint fligede blade og hvide blomsterskærme på en eng',
    file: 'Fluitenkruid (Anthriscus sylvestris) in bloemenweide. Locatie, Natuurterrein De Famberhorst 02.jpg',
    author: 'Dominicus Johannes Bergsma',
    licence: 'CC BY-SA 4.0',
  },

  // -- Spor ----------------------------------------------------------
  {
    id: 'raevespor',
    category: 'spor',
    name: 'Rævespor',
    scientificName: 'Vulpes vulpes',
    alt: 'Dyrespor i sne, aftegnet i en næsten lige linje efter hinanden',
    file: 'Fox Tracks in the Snow (51861791568).jpg',
    author: 'ShenandoahNPS',
    licence: 'Public domain',
  },
  {
    id: 'raadyrspor',
    category: 'spor',
    name: 'Rådyrspor',
    scientificName: 'Capreolus capreolus',
    alt: 'Sporaftryk af to spidse, hjerteformede klove i jorden',
    file: 'Roe deer track01.jpg',
    author: 'Tomasz Kuran',
    licence: 'CC BY 2.5',
  },
  {
    id: 'graevlingespor',
    category: 'spor',
    name: 'Grævlingespor',
    scientificName: 'Meles meles',
    alt: 'Bredt sporaftryk med fem tæer og lange klomærker i sne',
    file: 'Badger footprint in snow - geograph.org.uk - 2804639.jpg',
    author: 'Stefan Czapski',
    licence: 'CC BY-SA 2.0',
  },
  {
    id: 'egernspor',
    category: 'spor',
    name: 'Egernspor',
    scientificName: 'Sciurus vulgaris',
    alt: 'Små sporaftryk i sne, med et par mindre og et par større fodaftryk',
    file: 'Red Squirrel Tracks in Snow.jpg',
    author: 'Born of Iron',
    licence: 'CC BY-SA 4.0',
  },
  {
    id: 'harespor',
    category: 'spor',
    name: 'Harespor',
    scientificName: 'Lepus europaeus',
    alt: 'Sporaftryk i sne, hvor et par lange aftryk springer langt foran et par korte',
    file: 'Hare tracks on snow in forest Laajasalo Helsinki.jpg',
    author: 'Pöllö',
    licence: 'CC BY 3.0',
  },
  {
    id: 'vildsvinespor',
    category: 'spor',
    name: 'Vildsvinespor',
    scientificName: 'Sus scrofa',
    alt: 'Sporaftryk af to brede klove og to mindre bitæer i mudder',
    file: 'Impronta di un cinghiale.jpg',
    author: 'Albarubescens',
    licence: 'CC BY-SA 4.0',
  },
  {
    id: 'odderspor',
    category: 'spor',
    name: 'Odderspor',
    scientificName: 'Lutra lutra',
    alt: 'Sporaftryk med fem tæer og antydning af svømmehud ved bredden af et vandløb',
    file: 'Footprints of the otter - panoramio.jpg',
    author: 'toomas.liivamagi',
    licence: 'CC BY-SA 3.0',
  },
]

export const speciesBank: readonly Species[] = seeds.map((seed) => ({
  id: seed.id,
  category: seed.category,
  name: seed.name,
  scientificName: seed.scientificName,
  image: {
    url: commonsFilePath(seed.file),
    alt: seed.alt,
  },
  attribution: {
    author: seed.author,
    licence: seed.licence,
    sourceUrl: commonsSourceUrl(seed.file),
  },
}))

export function speciesByCategory(category: SpeciesCategory): Species[] {
  return speciesBank.filter((species) => species.category === category)
}
