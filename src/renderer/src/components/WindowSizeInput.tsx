import { useCallback, useEffect, useRef, useState } from 'react'
import { m } from '../paraglide/messages.js'

const inputCls =
  'font-mono text-[15px] leading-[1.5] py-[10px] px-[12px] border-[3px] border-black bg-surface-sunken text-black outline-none transition-colors duration-[50ms] hover:bg-[#e8e8e8] focus:border-[5px] focus:bg-white'

interface Preset {
  label: string
  width: number
  height: number
}

interface PresetCategory {
  nameKey: keyof typeof categoryNameFns
  presets: Preset[]
}

const categoryNameFns = {
  desktop: () => m.preset_category_desktop(),
  laptop: () => m.preset_category_laptop(),
  tablet: () => m.preset_category_tablet(),
  phone: () => m.preset_category_phone()
}

const PRESET_CATEGORIES: PresetCategory[] = [
  {
    nameKey: 'desktop',
    presets: [
      { label: '1080p', width: 1920, height: 1080 },
      { label: '1440p (QHD)', width: 2560, height: 1440 },
      { label: '4K (UHD)', width: 3840, height: 2160 },
      { label: '720p', width: 1280, height: 720 }
    ]
  },
  {
    nameKey: 'laptop',
    presets: [
      { label: 'MacBook 16"', width: 1728, height: 1117 },
      { label: 'MacBook 14"', width: 1512, height: 982 },
      { label: 'MacBook 13"', width: 1440, height: 900 },
      { label: 'Budget Laptop', width: 1366, height: 768 }
    ]
  },
  {
    nameKey: 'tablet',
    presets: [
      { label: 'iPad Landscape', width: 1024, height: 768 },
      { label: 'iPad Portrait', width: 768, height: 1024 },
      { label: 'iPad Mini', width: 744, height: 1133 }
    ]
  },
  {
    nameKey: 'phone',
    presets: [
      { label: 'iPhone 16 Pro Max', width: 440, height: 956 },
      { label: 'iPhone 14/15', width: 390, height: 844 },
      { label: 'iPhone SE', width: 375, height: 667 },
      { label: 'Pixel 9 Pro', width: 412, height: 915 },
      { label: 'Galaxy S24', width: 360, height: 780 }
    ]
  }
]

export interface WindowSizeInputProps {
  width: number
  height: number
  onWidthChange: (w: number) => void
  onHeightChange: (h: number) => void
  onApply: (w: number, h: number) => void
}

export default function WindowSizeInput({
  width,
  height,
  onWidthChange,
  onHeightChange,
  onApply
}: WindowSizeInputProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Apply immediately with explicit values — no stale closure.
  const selectPreset = useCallback(
    (preset: Preset) => {
      onWidthChange(preset.width)
      onHeightChange(preset.height)
      onApply(preset.width, preset.height)
      setOpen(false)
    },
    [onWidthChange, onHeightChange, onApply]
  )

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const categoryBase =
    'font-headline text-[11px] uppercase tracking-[3px] text-black bg-surface-sunken py-[8px] px-[12px] border-b-[3px] border-black'

  const presetBtn =
    'text-left font-mono text-[13px] leading-[1.4] py-[10px] px-[12px] bg-white text-black cursor-pointer transition-colors duration-[50ms] hover:bg-black hover:text-white'

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex gap-[8px] items-center">
        <input
          className={`flex-[0_1_100px] min-w-[80px] ${inputCls}`}
          type="number"
          min={100}
          max={3840}
          value={width}
          onChange={(e) => onWidthChange(Number(e.target.value))}
        />
        <span className="font-mono text-[15px] text-black font-semibold">×</span>
        <input
          className={`flex-[0_1_100px] min-w-[80px] ${inputCls}`}
          type="number"
          min={100}
          max={2160}
          value={height}
          onChange={(e) => onHeightChange(Number(e.target.value))}
        />
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="font-body text-[14px] font-semibold uppercase tracking-[2px] py-[10px] px-[24px] border-[3px] border-black bg-white text-black cursor-pointer transition-colors duration-[50ms] hover:bg-black hover:text-white active:border-[5px]"
        >
          {m.window_size_presets()}
        </button>
        <button
          type="button"
          onClick={() => onApply(width, height)}
          className="font-body text-[14px] font-semibold uppercase tracking-[2px] py-[10px] px-[24px] border-[3px] border-black bg-black text-white cursor-pointer transition-colors duration-[50ms] hover:bg-white hover:text-black active:border-[5px] active:bg-black active:text-white"
        >
          {m.window_size_apply()}
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-[100%] mt-[0px] z-50 w-full border-[3px] border-black bg-white max-h-[400px] overflow-y-auto">
          {PRESET_CATEGORIES.map((cat) => (
            <div key={cat.nameKey}>
              <div className={categoryBase}>{categoryNameFns[cat.nameKey]()}</div>
              <div className="grid grid-cols-2">
                {cat.presets.map((preset, i) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => selectPreset(preset)}
                    className={`${presetBtn} border-b-[3px] border-black ${i % 2 === 0 ? 'border-r-[3px]' : ''}`}
                  >
                    <span className="block font-semibold">{preset.label}</span>
                    <span className="block text-[12px] opacity-60">
                      {preset.width} × {preset.height}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
