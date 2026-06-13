import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <nav className="nav-bar">
        <Link to="/" className="nav-link" activeProps={{ className: 'nav-link--active' }}>
          Home
        </Link>
        <Link to="/browser" className="nav-link" activeProps={{ className: 'nav-link--active' }}>
          Browser
        </Link>
        <Link to="/about" className="nav-link" activeProps={{ className: 'nav-link--active' }}>
          About
        </Link>
        <Link to="/settings" className="nav-link" activeProps={{ className: 'nav-link--active' }}>
          Settings
        </Link>
      </nav>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  )
})
