import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({
  component: () => (
    <div className="page">
      <h1>Settings</h1>
      <p className="page-desc">This is the Settings page. Nothing to configure yet.</p>
      <Link to="/" className="back-link">
        ← Back to Home
      </Link>
    </div>
  )
})
