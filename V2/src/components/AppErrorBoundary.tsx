import { Component, type ErrorInfo, type ReactNode } from 'react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  error: Error | null
}

/**
 * En fejl i én query må ikke tømme `#root`.
 *
 * Convex' `useQuery` kaster, når funktionen fejler. Uden en grænse her
 * afmonterer React hele træet, og gæsten står med en hvid side. Grænsen
 * lægges om banneret og om sidens indhold hver for sig, så menuen bliver
 * stående, når det kun er den ene del, der fejler.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Appen fangede en fejl', error, info.componentStack)
  }

  render() {
    if (this.state.error === null) return this.props.children

    return (
      <div
        role="alert"
        className="mx-auto w-full max-w-lg px-4 py-8 text-center"
      >
        <h1 className="text-xl font-semibold text-ink">
          Noget gik galt på denne side
        </h1>
        <p className="mt-2 text-ink-muted">
          Resten af appen virker stadig. Genindlæs, eller gå tilbage til
          forsiden.
        </p>
        <p className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded bg-accent px-4 py-2 text-white"
          >
            Genindlæs
          </button>
          <a
            href={import.meta.env.BASE_URL}
            className="min-h-11 py-2 underline"
          >
            Til forsiden
          </a>
        </p>
      </div>
    )
  }
}
