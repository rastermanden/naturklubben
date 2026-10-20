import { speciesBank } from './bank'

/**
 * Kildeangivelsen: hvem der har taget billederne, og under hvilken licens.
 * Vist samlet ét sted, uanset hvilken runde man lige har spillet -- det er
 * det, licenserne kræver, og det spoiler ikke den runde, man er i gang med,
 * mere end en hvilken som helst feltguide ville gøre.
 */
export function Sources() {
  return (
    <details className="rounded-xl border border-line-soft bg-surface p-4 text-sm text-ink-muted">
      <summary className="cursor-pointer font-medium text-ink-body">
        Kilder til billederne
      </summary>
      <ul className="mt-3 flex flex-col gap-2">
        {speciesBank.map((species) => (
          <li key={species.id}>
            <span className="text-ink-body">{species.name}</span>{' '}
            <span className="italic">({species.scientificName})</span>:{' '}
            {species.attribution.author}, {species.attribution.licence}.{' '}
            <a
              href={species.attribution.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Se billedet på Wikimedia Commons
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}
