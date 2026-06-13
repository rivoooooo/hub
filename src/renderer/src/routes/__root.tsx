import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { m } from '../paraglide/messages.js'
import { useLocale } from '../useLocale'
// import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

const isMac = /mac/i.test(navigator.platform ?? '')

const navLink =
  'text-black text-sm tracking-widest uppercase px-4 py-3 transition-colors duration-[50ms] hover:underline'

const navLinkActive = 'bg-black text-white hover:underline'

export const Route = createRootRoute({
  component: function Root(): React.JSX.Element {
    const { locale } = useLocale()

    useEffect(() => {
      document.documentElement.lang = locale
      document.title = m.home_title()
    }, [locale])

    return (
      <>
        <nav
          className="fixed top-0 left-0 right-0 z-100 flex gap-0 bg-white border-b-[3px] border-black"
          style={
            {
              WebkitAppRegion: 'drag',
              paddingLeft: isMac ? 100 : 0
            } as React.CSSProperties
          }
        >
          <Link
            to="/"
            className={navLink}
            activeProps={{ className: navLinkActive }}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {m.nav_home()}
          </Link>
          <Link
            to="/browser"
            className={navLink}
            activeProps={{ className: navLinkActive }}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {m.nav_browser()}
          </Link>
          <Link
            to="/settings"
            className={navLink}
            activeProps={{ className: navLinkActive }}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {m.nav_settings()}
          </Link>
          <div className="flex-1" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
        </nav>
        <Outlet />
        {/*<TanStackRouterDevtools />*/}
      </>
    )
  }
})
