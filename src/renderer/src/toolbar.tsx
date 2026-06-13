import './assets/main.css'

import React, { StrictMode, type JSX } from 'react'
import { createRoot } from 'react-dom/client'
import { Minimize2, Maximize2, X, Bug } from 'lucide-react'

const ICON_SIZE = 20

/** Shared button classes for the dark sidebar */
const btn =
  'w-12 h-12 flex items-center justify-center cursor-pointer transition-colors duration-[50ms]'

/** Standard toolbar button: black fill, white icon. Hover full inversion. */
const btnStandard = `${btn} bg-black text-white hover:bg-white hover:text-black`

/** Close button. Hover: error fill. */
const btnClose = `${btn} bg-black text-white hover:bg-error hover:text-white`

/** DevTools button. Hover: info fill. */
const btnDevTools = `${btn} bg-black text-white hover:bg-blue hover:text-white`

export function Toolbar(): JSX.Element {
  return (
    <div className="fixed inset-0 flex flex-col items-center bg-black select-none w-16">
      {/* Top drag area — 100px */}
      <div
        className="w-full h-[25px] shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Minimize */}
      <button
        onClick={() => window.browserControls.minimize()}
        title="Minimize"
        className={btnStandard}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Minimize2 size={ICON_SIZE} />
      </button>

      {/* Maximize */}
      <button
        onClick={() => window.browserControls.toggleMaximize()}
        title="Maximize"
        className={btnStandard.concat(' mt-1')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Maximize2 size={ICON_SIZE} />
      </button>

      {/* Close */}
      <button
        onClick={() => window.browserControls.close()}
        title="Close"
        className={btnClose.concat(' mt-1')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <X size={ICON_SIZE} />
      </button>

      {/* DevTools */}
      <button
        onClick={() => window.browserControls.openDevTools()}
        title="Open DevTools"
        className={btnDevTools.concat(' mt-1')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Bug size={ICON_SIZE} />
      </button>

      {/* Bottom spacer — fills remaining space */}
      <div className="flex-1 w-full" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')
createRoot(root).render(
  <StrictMode>
    <Toolbar />
  </StrictMode>
)
