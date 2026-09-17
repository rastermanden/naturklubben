// Den ventende besked i chatten (#219).
//
// Den ligner afsenderens egen boble, men er ikke en `MessageBubble`: der er
// ingen serverrække bag den, ingen reaktioner, afstemning eller svar-knap, og
// den skal vise noget, en rigtig besked ikke har -- at den stadig venter, og
// hvad man kan gøre ved det. Tiden er det tidspunkt, brugeren skrev beskeden;
// serverens tidspunkt kender vi først, når den er sendt.
import { Avatar } from '../../components/Avatar'
import { readableTextColor } from '../../lib/colorContrast'
import { formatRelativeTime } from './formatRelativeTime'
import type { QueuedMessage, QueuedMessageStatus } from './offlineQueue'
import type { Message } from './useMessages'
import type { ProfileSummary } from './useProfilesMap'

const QUEUED_STATUS_TEXT: Record<QueuedMessageStatus, string> = {
  queued: 'Sendes, når du er online',
  sending: 'Sender …',
  failed: 'Kunne ikke sendes',
}

const BUTTON_CLASS =
  'min-h-11 rounded px-2 text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-current disabled:opacity-50'

export function PendingMessage({
  entry,
  author,
  replyTo,
  replyToName,
  onRetry,
  onDiscard,
}: {
  entry: QueuedMessage
  author: ProfileSummary | undefined
  /** Beskeden, der svares på, hvis den findes i historikken. */
  replyTo?: Message | null
  replyToName?: string | null
  onRetry: (clientId: string) => void
  onDiscard: (clientId: string) => void
}) {
  const name = author?.full_name ?? 'Du'
  const color = author?.chat_color ?? '#16a34a'
  const textColor = readableTextColor(color)
  const timestamp = new Date(entry.writtenAt).toLocaleString('da-DK')
  const excerpt =
    entry.content.length > 40 ? `${entry.content.slice(0, 40)}…` : entry.content

  return (
    <li
      data-message-id={entry.clientId}
      data-queue-status={entry.status}
      className="flex items-end gap-2 flex-row-reverse"
    >
      <Avatar
        name={name}
        avatarUrl={author?.avatar_url ?? null}
        color={color}
        size="md"
        decorative
      />
      <div
        className="max-w-[75%] rounded-2xl px-3 py-1.5"
        style={{ backgroundColor: color, color: textColor }}
      >
        <div className="mb-0.5 flex flex-wrap items-center justify-end gap-x-1.5 text-xs">
          <span className="font-medium">{name}</span>
          <time dateTime={entry.writtenAt} title={timestamp}>
            {formatRelativeTime(entry.writtenAt)}
          </time>
          <span
            className="font-semibold"
            title={
              entry.status === 'failed'
                ? (entry.lastError ?? undefined)
                : undefined
            }
          >
            {QUEUED_STATUS_TEXT[entry.status]}
          </span>
        </div>
        {replyTo && (
          <blockquote className="mb-2 rounded-lg border-l-4 border-quote-own-line bg-quote-own px-3 py-2 text-sm">
            <p className="text-xs font-semibold">
              {replyToName ? `Svarer ${replyToName}` : 'Svar'}
            </p>
            <p className="line-clamp-2 opacity-80">{replyTo.content}</p>
          </blockquote>
        )}
        <p className="whitespace-pre-wrap break-words">{entry.content}</p>
        <div className="mt-1 flex flex-wrap items-center justify-end gap-x-2 text-xs">
          <button
            type="button"
            onClick={() => onRetry(entry.clientId)}
            disabled={entry.status === 'sending'}
            aria-label={`Prøv igen med beskeden "${excerpt}"`}
            className={BUTTON_CLASS}
          >
            Prøv igen
          </button>
          <button
            type="button"
            onClick={() => onDiscard(entry.clientId)}
            aria-label={`Slet beskeden "${excerpt}", der venter`}
            className={BUTTON_CLASS}
          >
            Slet
          </button>
        </div>
      </div>
    </li>
  )
}
