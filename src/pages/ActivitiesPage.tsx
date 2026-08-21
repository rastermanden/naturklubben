import { AuthStatusLink } from '../components/AuthStatusLink'

function ActivitiesPage() {
  return (
    <main className="relative p-6">
      <div className="absolute top-4 right-4">
        <AuthStatusLink />
      </div>
      <h1 className="text-2xl font-semibold text-green-900">Aktiviteter</h1>
    </main>
  )
}

export default ActivitiesPage
