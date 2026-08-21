import { useInstallPrompt } from '../features/pwa/useInstallPrompt'

export function InstallAppButton({ className }: { className: string }) {
  const { canInstall, promptInstall } = useInstallPrompt()
  if (!canInstall) return null

  return (
    <button type="button" onClick={promptInstall} className={className}>
      Installér app
    </button>
  )
}
