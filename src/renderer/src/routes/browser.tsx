import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/browser')({
  component: BrowserControl
})

function BrowserControl(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('https://example.com')
  const [width, setWidth] = useState(1024)
  const [height, setHeight] = useState(768)
  const [locked, setLocked] = useState(false)

  // Sync state from main process on mount
  useEffect(() => {
    void window.browserApi.getState().then((s) => {
      setOpen(s.open)
      setUrl(s.url)
      setWidth(s.width)
      setHeight(s.height)
      setLocked(s.locked)
    })

    const unsubscribe = window.browserApi.onStateChange((s) => {
      setOpen(s.open)
      setUrl(s.url)
      setWidth(s.width)
      setHeight(s.height)
      setLocked(s.locked)
    })

    return unsubscribe
  }, [])

  const handleToggleWindow = useCallback(() => {
    if (open) {
      void window.browserApi.close()
    } else {
      void window.browserApi.open()
    }
  }, [open])

  const handleNavigate = useCallback(() => {
    void window.browserApi.navigate(url)
  }, [url])

  const handleResize = useCallback(() => {
    void window.browserApi.resize(width, height)
  }, [width, height])

  const handleLockChange = useCallback((checked: boolean) => {
    setLocked(checked)
    void window.browserApi.setLock(checked)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleNavigate()
      }
    },
    [handleNavigate]
  )

  return (
    <div className="browser-control">
      <h1 className="browser-control-title">Browser Control</h1>

      {/* URL */}
      <div className="form-group">
        <label className="form-label" htmlFor="browser-url">
          URL
        </label>
        <div className="form-row">
          <input
            id="browser-url"
            className="form-input"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="btn btn-primary" onClick={handleNavigate}>
            Navigate
          </button>
        </div>
      </div>

      {/* Size */}
      <div className="form-group">
        <label className="form-label">Window Size</label>
        <div className="form-row">
          <input
            className="form-input form-input--small"
            type="number"
            min={100}
            max={3840}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
          <span className="form-separator">×</span>
          <input
            className="form-input form-input--small"
            type="number"
            min={100}
            max={2160}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
          />
          <button className="btn btn-primary" onClick={handleResize}>
            Apply
          </button>
        </div>
      </div>

      {/* Lock */}
      <div className="form-group">
        <label className="form-check">
          <input
            type="checkbox"
            checked={locked}
            onChange={(e) => handleLockChange(e.target.checked)}
          />
          <span>Lock window size</span>
        </label>
      </div>

      {/* Open / Close */}
      <div className="form-group">
        <button
          className={`btn btn-block ${open ? 'btn-danger' : 'btn-primary'}`}
          onClick={handleToggleWindow}
        >
          {open ? 'Close Browser Window' : 'Open Browser Window'}
        </button>
      </div>

      {/* Status bar */}
      <div className="status-bar">
        <div className="status-bar-row">
          <span className="status-dot" data-open={open ? 'true' : undefined}>
            ●
          </span>
          <span className="status-text">{open ? 'Online' : 'Offline'}</span>
        </div>
        <div className="status-bar-row">
          <span className="status-label">URL:</span>
          <span className="status-value">{url}</span>
        </div>
        <div className="status-bar-row">
          <span className="status-label">Size:</span>
          <span className="status-value">
            {width} × {height}
          </span>
        </div>
      </div>
    </div>
  )
}
