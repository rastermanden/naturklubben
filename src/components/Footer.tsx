import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="border-t border-green-100 px-4 py-6 text-center text-sm text-green-700">
      <p>© {new Date().getFullYear()} Naturklubben</p>
      <Link to="/datapolitik" className="mt-1 inline-block underline">
        Politik for dataopbevaring
      </Link>
    </footer>
  )
}
