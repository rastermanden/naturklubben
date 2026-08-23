// Fælles hjælpefunktion til at tømme et bruger-præfiks i en Storage-bucket
// (#86: kontosletning). Bruges af delete-account, som skal rydde hele
// `${userId}/`-mappen i avatars, photos-original og photos-optimized -- ikke
// kun de filer, der (stadig) har en tilhørende photos-metadata-række, så et
// tidligere delvist fejlet upload eller en tidligere fejlet sletning ikke
// efterlader forældreløse objekter.
//
// Lister med paginering, indtil bucketten er udtømt for det præfiks, og
// sletter i bidder -- storage.remove() tager en liste af paths, og et enkelt
// list-kald returnerer højst `limit` objekter ad gangen.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LIST_PAGE_SIZE = 100
const REMOVE_BATCH_SIZE = 100

/**
 * Sletter alle objekter under `prefix` i `bucket`. Idempotent: et objekt der
 * allerede er væk er ikke en fejl (samme S3-lignende semantik som Supabase
 * Storage bruger), så et gentaget kald efter en tidligere delvis fejl er
 * harmløst.
 */
export async function removeAllUnderPrefix(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<void> {
  let previousSignature: string | null = null

  for (;;) {
    const { data: entries, error: listError } = await supabase.storage
      .from(bucket)
      // Sletning får den næste side til at rykke frem. Læs derfor altid fra
      // offset 0, indtil præfikset er tomt; et stigende offset ville springe
      // objekter over efter første batch.
      .list(prefix, { limit: LIST_PAGE_SIZE, offset: 0 })

    if (listError) {
      throw new Error(
        `Kunne ikke liste ${bucket}/${prefix}: ${listError.message}`,
      )
    }
    if (!entries || entries.length === 0) break

    const actionableEntries = entries.filter((entry) => entry.name)
    if (actionableEntries.length === 0) break

    const signature = actionableEntries
      .map((entry) => `${entry.id ?? 'folder'}:${entry.name}`)
      .sort()
      .join('|')
    if (signature === previousSignature) {
      throw new Error(
        `Storage-oprydningen gjorde ingen fremdrift i ${bucket}/${prefix}`,
      )
    }
    previousSignature = signature

    const paths = actionableEntries
      // Supabase markerer virtuelle undermapper med id = null. De er ikke
      // objekter, som remove() kan slette, og håndteres rekursivt nedenfor.
      .filter((entry) => entry.id !== null)
      .map((entry) => `${prefix}/${entry.name}`)

    for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
      const batch = paths.slice(i, i + REMOVE_BATCH_SIZE)
      const { error: removeError } = await supabase.storage
        .from(bucket)
        .remove(batch)
      if (removeError) {
        throw new Error(
          `Kunne ikke slette ${batch.length} objekt(er) fra ${bucket}/${prefix}: ${removeError.message}`,
        )
      }
    }

    const folders = actionableEntries.filter((entry) => entry.id === null)
    for (const folder of folders) {
      await removeAllUnderPrefix(supabase, bucket, `${prefix}/${folder.name}`)
    }

    // Fortsæt også efter en kort side: et samtidigt upload kan være landet,
    // mens batchen blev slettet. Først en tom list() afslutter oprydningen.
  }
}
