import { createFileRoute, Outlet } from '@tanstack/react-router'

// ---------------------------------------------------------------------------
// Minimal layout — no nav bar, only macOS traffic-light padding
// ---------------------------------------------------------------------------

const isMac = /mac/i.test(navigator.platform ?? '')

export const Route = createFileRoute('/_bare')({
  component: function BareLayout(): React.JSX.Element {
    return (
      <div className="h-screen bg-white" style={{ paddingTop: isMac ? 38 : 0 }}>
        <Outlet />
      </div>
    )
  }
})
