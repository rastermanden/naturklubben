import type { ReactNode } from 'react'

/**
 * Fælles kort om en admin-sektion. Sektionerne havde tidligere hver sin
 * indpakning — nogle med grøn baggrund, andre helt uden ramme — hvilket fik
 * lige vigtige ting til at se forskellige ud. Ét kort giver dem samme vægt.
 */
export function AdminSection({
  title,
  description,
  count,
  children,
}: {
  title: string
  description?: ReactNode
  /** Vises i parentes efter titlen, når der er noget at tælle. */
  count?: number
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <h2 className="font-medium text-ink-body">
        {title}
        {count !== undefined && count > 0 && ` (${count})`}
      </h2>
      {description && (
        <p className="mt-1 text-sm text-ink-subtle">{description}</p>
      )}
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  )
}
