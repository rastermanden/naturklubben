import { Component, type ErrorInfo, type ReactNode } from 'react'
import {
  reportClientError,
  type ClientErrorSource,
} from '../lib/errorReporting'
import { clearCachedAppAndReload } from '../lib/appRecovery'

interface ErrorBoundaryProps {
  children: ReactNode
  variant: 'app' | 'route'
  reportSource: ClientErrorSource
}

interface ErrorBoundaryState {
  error: Error | null
  recoveryError: boolean
  recovering: boolean
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    error: null,
    recoveryError: false,
    recovering: false,
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(error, {
      source: this.props.reportSource,
      componentStack: info.componentStack ?? undefined,
    })
  }

  private reload = () => {
    window.location.reload()
  }

  private clearCache = async () => {
    this.setState({ recovering: true, recoveryError: false })
    try {
      await clearCachedAppAndReload()
    } catch (error) {
      console.error('Kunne ikke rydde appens cache', error)
      this.setState({ recovering: false, recoveryError: true })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    const isGlobal = this.props.variant === 'app'

    return (
      <main
        id={isGlobal ? 'main-content' : undefined}
        role="alert"
        className="flex min-h-[60svh] items-center justify-center bg-surface-sunken px-4 py-12"
      >
        <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 text-center shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-ink">
            {isGlobal
              ? 'Naturklubben kunne ikke starte'
              : 'Noget gik galt på denne side'}
          </h1>
          <p className="mt-3 text-ink-body">
            {isGlobal
              ? 'Prøv at genindlæse appen. Hvis fejlen bliver ved, kan du rydde den gemte version og starte igen.'
              : 'Resten af appen virker stadig. Genindlæs siden, eller brug menuen til at gå et andet sted hen.'}
          </p>

          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={this.reload}
              className="rounded-lg bg-accent px-5 py-3 font-medium text-white hover:bg-accent-hover"
            >
              Genindlæs siden
            </button>
            {isGlobal && (
              <button
                type="button"
                onClick={() => void this.clearCache()}
                disabled={this.state.recovering}
                className="rounded-lg border border-accent-soft px-5 py-3 font-medium text-ink-body hover:bg-surface-raised disabled:cursor-wait disabled:opacity-60"
              >
                {this.state.recovering
                  ? 'Rydder cache…'
                  : 'Ryd cache og genstart'}
              </button>
            )}
          </div>

          {this.state.recoveryError && (
            <p className="mt-4 text-sm font-medium text-danger-strong">
              Cachen kunne ikke ryddes automatisk. Luk appen helt, og prøv igen.
            </p>
          )}
        </div>
      </main>
    )
  }
}
