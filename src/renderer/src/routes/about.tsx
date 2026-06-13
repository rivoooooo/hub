import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: () => (
    <div className="page">
      <h1>About</h1>
      <p className="page-desc">This is the About page, powered by TanStack Router.</p>
      <Link to="/" className="back-link">
        ← Back to Home
      </Link>
    </div>
  )
})
