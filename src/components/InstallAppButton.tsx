import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useInstallPrompt } from '../features/pwa/useInstallPrompt'
import { useDialogFocus } from '../hooks/useDialogFocus'

const guides = {
  ios: {
    title: 'Installér appen på din iPhone',
    steps: [
      'Åbn naturklubben.dk i Safari.',
      'Tryk på Del-knappen (firkanten med pilen op) nederst eller øverst på skærmen.',
      'Vælg "Føj til hjemmeskærm" -- rul lidt ned i listen, hvis du ikke kan se den.',
      'Tryk "Tilføj". Naturklubben ligger nu på din hjemmeskærm.',
    ],
  },
  android: {
    title: 'Installér appen på din telefon',
    steps: [
      'Tryk på browserens menu (de tre prikker ⋮ øverst til højre).',
      'Vælg "Installér app" eller "Føj til startskærm".',
      'Bekræft. Naturklubben ligger nu på din startskærm.',
      'Kan du ikke se punktet lige efter, at du har afinstalleret appen, så genindlæs siden og prøv igen om lidt.',
    ],
  },
} as const

function InstallGuide({
  kind,
  onClose,
}: {
  kind: keyof typeof guides
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogFocus<HTMLDivElement>({
    onClose,
    initialFocusRef: closeRef,
  })
  const guide = guides[kind]

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-guide-title"
        tabIndex={-1}
        className="w-full rounded-t-xl bg-surface p-6 shadow-xl sm:max-w-md sm:rounded-xl"
      >
        <h2
          id="install-guide-title"
          className="text-lg font-semibold text-ink-body"
        >
          {guide.title}
        </h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-ink">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="mt-6 flex justify-end">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-11 rounded bg-accent px-5 py-2 font-medium text-white"
          >
            Forstået
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * "Installér app" (#291): browserens egen installationsdialog, hvor den
 * findes, og ellers en kort vejledning på iPhone og Android. Vises ikke,
 * når appen allerede kører fra hjemmeskærmen, eller på en computer, hvor
 * browseren ikke kan installere den.
 */
export function InstallAppButton({ className }: { className: string }) {
  const { method, promptInstall } = useInstallPrompt()
  const [guideOpen, setGuideOpen] = useState(false)
  if (!method) return null

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (method === 'prompt') void promptInstall()
          else setGuideOpen(true)
        }}
        className={className}
      >
        Installér app
      </button>
      {guideOpen && method !== 'prompt' && (
        <InstallGuide kind={method} onClose={() => setGuideOpen(false)} />
      )}
    </>
  )
}
