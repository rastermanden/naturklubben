import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { appRoutes } from './routes'

/**
 * Ruterne kommer fra `src/routes.tsx`, ikke herfra. Grunden er praktisk: hver
 * feature tilføjer sin egen rute-fil, og `routes.tsx` er det ene sted, de
 * samles -- så to features kan bygges samtidigt uden at skrive i samme fil.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {appRoutes.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}
      </Route>
    </Routes>
  )
}
