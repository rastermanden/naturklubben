import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './features/theme/ThemeProvider'
import { convex } from './lib/convexClient'
import { restoreSpaRedirect } from './lib/spaRedirect'

// Skal ske før React Router læser adressen -- ellers ser den rod-ruten i
// stedet for den sti, brugeren faktisk bad om (se lib/spaRedirect.ts).
restoreSpaRedirect()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ConvexAuthProvider er både auth- og dataprovider: der er ingen separat
        QueryClient her, fordi Convex-abonnementer er reaktive i sig selv.
        ThemeProvider ligger uden om alt, fordi temaet også gælder
        login-siderne -- og fordi `useTheme` kaster uden den. */}
    <ThemeProvider>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
      </ConvexAuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
