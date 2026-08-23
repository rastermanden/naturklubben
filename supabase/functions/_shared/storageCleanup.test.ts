// Enhedstests for removeAllUnderPrefix (#86). Kør med
// `deno test supabase/functions`.
//
// Bruger en minimal fake i stedet for en rigtig SupabaseClient/Storage-
// forbindelse (som ville kræve et rigtigt Supabase-projekt) -- kun de to
// metoder, removeAllUnderPrefix rent faktisk kalder (list/remove), er
// implementeret. `as unknown as SupabaseClient` er bevidst: faken
// implementerer med vilje kun den delmængde af klientens overflade, funktionen
// bruger, ikke hele SDK'ets type.

import { strict as assert } from 'node:assert'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3'
import { removeAllUnderPrefix } from './storageCleanup.ts'

interface FakeEntry {
  name: string
  id: string | null
}

interface ListCall {
  bucket: string
  prefix: string
  limit: number
  offset: number
}

interface RemoveCall {
  bucket: string
  paths: string[]
}

function makeFakeStorage(options: {
  /** Samlet antal "objekter" i bucketten, til at teste paginering. */
  totalEntries?: number
  listError?: { message: string }
  /** Fejler remove(), når et af disse paths indgår i batchen. */
  removeErrorForPaths?: Set<string>
  listCalls: ListCall[]
  removeCalls: RemoveCall[]
}) {
  const {
    totalEntries = 0,
    listError,
    removeErrorForPaths,
    listCalls,
    removeCalls,
  } = options

  const remainingEntries = Array.from(
    { length: totalEntries },
    (_, i) => `object-${i}.jpg`,
  )

  return {
    storage: {
      from(bucket: string) {
        return {
          list(
            prefix: string,
            { limit, offset }: { limit: number; offset: number },
          ) {
            listCalls.push({ bucket, prefix, limit, offset })
            if (listError) {
              return Promise.resolve({ data: null, error: listError })
            }
            const entries: FakeEntry[] = remainingEntries
              .slice(offset, offset + limit)
              .map((name) => ({ name, id: `id-${name}` }))
            return Promise.resolve({ data: entries, error: null })
          },
          remove(paths: string[]) {
            removeCalls.push({ bucket, paths })
            if (removeErrorForPaths) {
              const hit = paths.find((p) => removeErrorForPaths.has(p))
              if (hit) {
                return Promise.resolve({
                  data: null,
                  error: { message: `objekt ${hit} kunne ikke slettes` },
                })
              }
            }
            const names = new Set(
              paths.map((path) => path.slice(path.lastIndexOf('/') + 1)),
            )
            for (let i = remainingEntries.length - 1; i >= 0; i -= 1) {
              if (names.has(remainingEntries[i]!)) remainingEntries.splice(i, 1)
            }
            return Promise.resolve({ data: paths, error: null })
          },
        }
      },
    },
  }
}

Deno.test(
  'removeAllUnderPrefix: tomt præfiks laver ingen remove-kald',
  async () => {
    const listCalls: ListCall[] = []
    const removeCalls: RemoveCall[] = []
    const fake = makeFakeStorage({ totalEntries: 0, listCalls, removeCalls })

    await removeAllUnderPrefix(
      fake as unknown as SupabaseClient,
      'avatars',
      'user-1',
    )

    assert.equal(listCalls.length, 1)
    assert.equal(removeCalls.length, 0)
  },
)

Deno.test(
  'removeAllUnderPrefix: en tom mappe-placeholder afslutter uden loop',
  async () => {
    const listCalls: ListCall[] = []
    const removeCalls: RemoveCall[] = []
    const fake = {
      storage: {
        from() {
          return {
            list(
              _prefix: string,
              { limit, offset }: { limit: number; offset: number },
            ) {
              listCalls.push({
                bucket: 'avatars',
                prefix: 'user-1',
                limit,
                offset,
              })
              return Promise.resolve({
                data: [{ name: '', id: null }],
                error: null,
              })
            },
            remove(paths: string[]) {
              removeCalls.push({ bucket: 'avatars', paths })
              return Promise.resolve({ data: paths, error: null })
            },
          }
        },
      },
    }

    await removeAllUnderPrefix(
      fake as unknown as SupabaseClient,
      'avatars',
      'user-1',
    )

    assert.equal(listCalls.length, 1)
    assert.equal(removeCalls.length, 0)
  },
)

Deno.test(
  'removeAllUnderPrefix: rydder virtuelle undermapper rekursivt',
  async () => {
    const listCalls: ListCall[] = []
    const removeCalls: RemoveCall[] = []
    let nestedFileExists = true
    const fake = {
      storage: {
        from(bucket: string) {
          return {
            list(
              prefix: string,
              { limit, offset }: { limit: number; offset: number },
            ) {
              listCalls.push({ bucket, prefix, limit, offset })
              if (prefix === 'user-1/nested') {
                return Promise.resolve({
                  data: nestedFileExists
                    ? [{ name: 'photo.jpg', id: 'photo-id' }]
                    : [],
                  error: null,
                })
              }
              return Promise.resolve({
                data: nestedFileExists ? [{ name: 'nested', id: null }] : [],
                error: null,
              })
            },
            remove(paths: string[]) {
              removeCalls.push({ bucket, paths })
              nestedFileExists = false
              return Promise.resolve({ data: paths, error: null })
            },
          }
        },
      },
    }

    await removeAllUnderPrefix(
      fake as unknown as SupabaseClient,
      'avatars',
      'user-1',
    )

    assert.equal(removeCalls.length, 1)
    assert.deepEqual(removeCalls[0].paths, ['user-1/nested/photo.jpg'])
    assert.equal(
      listCalls.some((call) => call.prefix === 'user-1/nested'),
      true,
    )
  },
)

Deno.test(
  'removeAllUnderPrefix: afbryder med fejl, hvis remove ikke gør fremdrift',
  async () => {
    const fake = {
      storage: {
        from() {
          return {
            list() {
              return Promise.resolve({
                data: [{ name: 'stuck.jpg', id: 'stuck-id' }],
                error: null,
              })
            },
            remove(paths: string[]) {
              return Promise.resolve({ data: paths, error: null })
            },
          }
        },
      },
    }

    await assert.rejects(
      () =>
        removeAllUnderPrefix(
          fake as unknown as SupabaseClient,
          'photos-original',
          'user-1',
        ),
      /ingen fremdrift/,
    )
  },
)

Deno.test(
  'removeAllUnderPrefix: paginerer, indtil bucketten er udtømt',
  async () => {
    const listCalls: ListCall[] = []
    const removeCalls: RemoveCall[] = []
    // Efter hver sletning rykker de resterende objekter frem. Derfor læses
    // altid offset 0: tre fyldte/sidste sider og til sidst en tom side.
    const fake = makeFakeStorage({ totalEntries: 250, listCalls, removeCalls })

    await removeAllUnderPrefix(
      fake as unknown as SupabaseClient,
      'photos-original',
      'user-42',
    )

    assert.deepEqual(
      listCalls.map((c) => c.offset),
      [0, 0, 0, 0],
    )
    assert.equal(removeCalls.length, 3)
    assert.equal(removeCalls[0].paths.length, 100)
    assert.equal(removeCalls[1].paths.length, 100)
    assert.equal(removeCalls[2].paths.length, 50)

    const allRemovedPaths = removeCalls.flatMap((c) => c.paths)
    assert.equal(allRemovedPaths.length, 250)
    assert.equal(allRemovedPaths[0], 'user-42/object-0.jpg')
    assert.equal(allRemovedPaths[249], 'user-42/object-249.jpg')
  },
)

Deno.test(
  'removeAllUnderPrefix: en fejlende list() propagerer som fejl',
  async () => {
    const listCalls: ListCall[] = []
    const removeCalls: RemoveCall[] = []
    const fake = makeFakeStorage({
      listError: { message: 'network boom' },
      listCalls,
      removeCalls,
    })

    await assert.rejects(
      () =>
        removeAllUnderPrefix(
          fake as unknown as SupabaseClient,
          'avatars',
          'user-1',
        ),
      /network boom/,
    )
    assert.equal(removeCalls.length, 0)
  },
)

Deno.test(
  'removeAllUnderPrefix: en fejlende remove() propagerer som fejl (delvis fremskridt bevares)',
  async () => {
    const listCalls: ListCall[] = []
    const removeCalls: RemoveCall[] = []
    // 150 objekter: første batch (objekt 0-99) lykkes. Næste list fra offset 0
    // finder de resterende 100-149, hvor et objekt fejler at slette -- simulerer
    // en delvist fejlet oprydning, som et genforsøg senere skal kunne fuldføre.
    const fake = makeFakeStorage({
      totalEntries: 150,
      removeErrorForPaths: new Set(['user-1/object-120.jpg']),
      listCalls,
      removeCalls,
    })

    await assert.rejects(
      () =>
        removeAllUnderPrefix(
          fake as unknown as SupabaseClient,
          'photos-optimized',
          'user-1',
        ),
      /object-120\.jpg kunne ikke slettes/,
    )
    // Første batch (100 objekter) blev forsøgt slettet, før anden batch fejlede.
    assert.equal(removeCalls.length, 2)
    assert.equal(removeCalls[0].paths.length, 100)
  },
)

Deno.test(
  'removeAllUnderPrefix: genforsøg efter delvis fejl fuldfører resten (idempotent)',
  async () => {
    // Simulerer et gentaget kald, hvor bucketten kun indeholder de resterende 50.
    const listCalls: ListCall[] = []
    const removeCalls: RemoveCall[] = []
    const fake = makeFakeStorage({ totalEntries: 50, listCalls, removeCalls })

    await removeAllUnderPrefix(
      fake as unknown as SupabaseClient,
      'photos-optimized',
      'user-1',
    )

    assert.equal(removeCalls.length, 1)
    assert.equal(removeCalls[0].paths.length, 50)
  },
)
