import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
// import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

const navLink =
  'text-black text-sm tracking-widest uppercase px-4 py-3 transition-colors duration-[50ms] hover:underline'

const navLinkActive = 'bg-black text-white hover:underline'

export const Route = createRootRoute({
  component: () => (
    <>
      <nav className="fixed top-0 left-0 right-0 z-100 flex gap-0 bg-white border-b-[3px] border-black">
        <Link to="/" className={navLink} activeProps={{ className: navLinkActive }}>
          Home
        </Link>
        <Link to="/browser" className={navLink} activeProps={{ className: navLinkActive }}>
          Browser
        </Link>
        <Link to="/about" className={navLink} activeProps={{ className: navLinkActive }}>
          About
        </Link>
        <Link to="/settings" className={navLink} activeProps={{ className: navLinkActive }}>
          Settings
        </Link>
      </nav>
      <Outlet />
      {/*<TanStackRouterDevtools />*/}
    </>
  )
})
