import { useEffect, useState } from 'react'
import type React from 'react'
import { Minus, Minimize, Square, X } from 'lucide-react'

const ICON_SIZE = 16
const ICON_SIZE_VERTICAL = 20

/** Shared button classes for window controls */
const btn =
  'flex items-center h-full justify-center cursor-pointer transition-colors duration-[50ms]'

/** Standard toolbar button: black fill, white icon. Hover full inversion. */
const btnStandard = `${btn} hover:bg-black/5 hover:text-black`

/** Close button. Hover: error fill. */
const btnClose = `${btn}  hover:bg-error hover:text-white`

interface WindowControlsProps {
  /** Vertical layout for sidebar use (default: horizontal) */
  vertical?: boolean
}

export function WindowControls({ vertical = false }: WindowControlsProps): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // Get initial maximize state
    window.windowControls
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => {
        // Ignore — preload API always available in this context
      })

    // Listen for window resize events to keep the icon in sync
    const onResize = (): void => {
      window.windowControls
        .isMaximized()
        .then(setIsMaximized)
        .catch(() => {})
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const buttonSize = vertical ? 'w-12 h-12' : 'w-[46px] h-[34px]'
  const iconSize = vertical ? ICON_SIZE_VERTICAL : ICON_SIZE
  const MaximizeIcon = isMaximized ? Minimize : Square

  return (
    <div
      className={`flex ${vertical ? 'flex-col' : 'flex-row items-stretch'}`}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* Minimize */}
      <button
        onClick={() => window.windowControls.minimize()}
        title="Minimize"
        className={`${btnStandard} ${buttonSize}`}
      >
        <Minus size={iconSize} />
      </button>

      {/* Maximize / Restore */}
      <button
        onClick={() => window.windowControls.toggleMaximize()}
        title={isMaximized ? 'Restore' : 'Maximize'}
        className={`${btnStandard} ${buttonSize}${vertical ? ' mt-1' : ''}`}
      >
        <MaximizeIcon size={iconSize} />
      </button>

      {/* Close */}
      <button
        onClick={() => window.windowControls.close()}
        title="Close"
        className={`${btnClose} ${buttonSize}${vertical ? ' mt-1' : ''}`}
      >
        <X size={iconSize} />
      </button>
    </div>
  )
}
