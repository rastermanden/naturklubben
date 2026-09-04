import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { queryClient } from './lib/queryClient'
import { restoreSpaRedirect } from './lib/spaRedirect'
import { AuthProvider } from './features/auth/AuthProvider'
import { ThemeProvider } from './features/theme/ThemeProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installGlobalErrorReporting } from './lib/errorReporting'

// Skal ske før React Router læser adressen -- ellers ser den rod-ruten i
// stedet for den sti, brugeren faktisk bad om (se lib/spaRedirect.ts).
installGlobalErrorReporting()
restoreSpaRedirect()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary variant="app" reportSource="react-global">
        <QueryClientProvider client={queryClient}>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
)
