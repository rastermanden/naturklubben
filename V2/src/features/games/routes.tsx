import type { AppRoute } from '../../routes'
import FugletraekPage from '../../pages/FugletraekPage'
import GamesPage from '../../pages/GamesPage'
import KaperPage from '../../pages/KaperPage'
import NaturlogPage from '../../pages/NaturlogPage'
import NaturquizPage from '../../pages/NaturquizPage'
import StiPage from '../../pages/StiPage'
import TetrisPage from '../../pages/TetrisPage'
import TournamentPage from '../../pages/TournamentPage'
import TwentyFortyEightPage from '../../pages/TwentyFortyEightPage'
import { ProtectedRoute } from '../auth/ProtectedRoute'

/**
 * Ruterne for spil, turnering og naturlog.
 *
 * Alt her er bag `ProtectedRoute`: spillene lægger resultater på klubbens liste,
 * turneringen er for medlemmer, og naturloggen viser hvem der har set hvad.
 * Der er ingen offentlig side i dette domæne -- til forskel fra fx kalenderens
 * offentlige feed.
 *
 * Rækkefølgen betyder noget: `/spil` står før `/spil/tetris`, så den statiske
 * forside ikke bliver slugt af en dynamisk søskende, hvis der senere kommer en.
 * `routes.tsx` lægger listen ind i appens fælles `Routes`.
 */
export const gameRoutes: AppRoute[] = [
  {
    path: '/spil',
    element: (
      <ProtectedRoute>
        <GamesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/spil/tetris',
    element: (
      <ProtectedRoute>
        <TetrisPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/spil/kaper',
    element: (
      <ProtectedRoute>
        <KaperPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/spil/2048',
    element: (
      <ProtectedRoute>
        <TwentyFortyEightPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/spil/naturquiz',
    element: (
      <ProtectedRoute>
        <NaturquizPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/spil/sti',
    element: (
      <ProtectedRoute>
        <StiPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/spil/fugletraek',
    element: (
      <ProtectedRoute>
        <FugletraekPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/aktiviteter/btg-turnering',
    element: (
      <ProtectedRoute>
        <TournamentPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/naturlog',
    element: (
      <ProtectedRoute>
        <NaturlogPage />
      </ProtectedRoute>
    ),
  },
]
