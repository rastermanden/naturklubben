import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './features/theme/ThemeProvider'
import { convex } from './lib/convexClient'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { installInstallPromptCapture } from './features/pwa/installPrompt'
import { isPreviewDeployment } from './features/pwa/previewInstall'
import { clearStalePreviewServiceWorker } from './lib/previewServiceWorker'
import { restoreSpaRedirect } from './lib/spaRedirect'

// Skal ske før React Router læser adressen -- ellers ser den rod-ruten i
// stedet for den sti, brugeren faktisk bad om (se lib/spaRedirect.ts).
restoreSpaRedirect()
// Et ældre preview kan have den selvafmeldende sw.js på samme sti. Den ryddes
// først, og derefter registreres sw-prod.js. Rækkefølgen betyder noget: en
// oprydning, der løber samtidig med registreringen, kan afmelde den worker,
// push skal bruge.
// "Installér app" slås fra i preview, se previewInstall.ts.
void (async () => {
  await clearStalePreviewServiceWorker()
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw-prod.js`,
      )
    } catch {
      // Uden worker kan notifikationer ikke slås til. Knappen siger det selv.
    }
  }
})()
if (!isPreviewDeployment()) {
  installInstallPromptCapture()
  const manifest = document.createElement('link')
  manifest.rel = 'manifest'
  manifest.href = `${import.meta.env.BASE_URL}manifest.webmanifest`
  document.head.appendChild(manifest)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ConvexAuthProvider er både auth- og dataprovider: der er ingen separat
        QueryClient her, fordi Convex-abonnementer er reaktive i sig selv.
        ThemeProvider ligger uden om alt, fordi temaet også gælder
        login-siderne -- og fordi `useTheme` kaster uden den. */}
    <ThemeProvider>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </BrowserRouter>
      </ConvexAuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
