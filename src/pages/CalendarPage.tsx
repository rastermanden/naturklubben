import { AuthStatusLink } from '../components/AuthStatusLink'

function CalendarPage() {
  return (
    <main className="relative p-6">
      <div className="absolute top-4 right-4">
        <AuthStatusLink />
      </div>
      <h1 className="text-2xl font-semibold text-green-900">Kalender</h1>
    </main>
  )
}

export default CalendarPage
