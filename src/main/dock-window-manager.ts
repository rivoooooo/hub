import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { DockApp } from './apps-store'

/**
 * Manages lifecycle of independent dock app windows.
 * Each app is launched as a separate Electron child process so that it
 * gets its own OS-level dock / taskbar entry.
 */
export class DockWindowManager {
  /** Map of app id → ChildProcess for all running dock apps */
  private processes = new Map<string, ChildProcess>()

  /** Set of app ids that have signaled 'ready' */
  private readyApps = new Set<string>()

  /** Callbacks for running-state changes (renderer notification) */
  private stateChangeListeners: Array<(runningIds: string[]) => void> = []

  /**
   * Launch (or focus) an independent window for the given dock app.
   * Instead of creating a BrowserWindow in-process, we spawn a child
   * Electron process that runs the app-runner entry.
   */
  launch(dockApp: DockApp): void {
    // If already running, skip (the child process handles itself)
    if (this.processes.has(dockApp.id)) {
      return
    }

    // Path to the app-runner entry
    // In dev mode the runner is at __dirname/app-runner.js
    // In prod mode it's the same layout
    const runnerPath = join(__dirname, 'app-runner.js')

    const childEnv = { ...process.env }
    // Ensure it runs as Electron, not Node
    delete childEnv.ELECTRON_RUN_AS_NODE
    childEnv.ELECTRON_IS_DEV = is.dev ? '1' : '0'

    const child = spawn(
      process.execPath,
      [
        runnerPath,
        '--app-runner',
        '--app-id',
        dockApp.id,
        '--app-name',
        dockApp.name,
        '--user-data-path',
        app.getPath('userData')
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        // On Windows, detach so the child process is fully independent
        windowsHide: false,
        env: childEnv
      }
    )

    // Track the process
    this.processes.set(dockApp.id, child)

    // Listen for JSON-line messages on stdout
    let buffer = ''
    child.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // keep partial line in buffer
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const msg = JSON.parse(trimmed)
          if (msg.type === 'ready' && msg.appId === dockApp.id) {
            this.readyApps.add(dockApp.id)
            this.notifyStateChange()
          } else if (msg.type === 'closed' && msg.appId === dockApp.id) {
            this.readyApps.delete(dockApp.id)
            this.processes.delete(dockApp.id)
            this.notifyStateChange()
          }
        } catch {
          // not JSON — ignore (might be Electron logs)
        }
      }
    })

    // Forward stderr for debugging
    child.stderr?.on('data', (data: Buffer) => {
      // In dev mode, let the user see child process errors
      if (is.dev) {
        process.stderr.write(`[app-runner:${dockApp.id}] ${data.toString()}`)
      }
    })

    // Clean up on unexpected exit
    child.on('exit', (code) => {
      this.readyApps.delete(dockApp.id)
      if (this.processes.get(dockApp.id) === child) {
        this.processes.delete(dockApp.id)
      }
      this.notifyStateChange()
      if (code !== 0 && is.dev) {
        console.log(`[dock] app ${dockApp.id} exited with code ${code}`)
      }
    })

    child.on('error', (err) => {
      console.error(`[dock] failed to launch app ${dockApp.id}:`, err.message)
      this.readyApps.delete(dockApp.id)
      this.processes.delete(dockApp.id)
      this.notifyStateChange()
    })
  }

  /**
   * Close a specific dock app window by terminating its child process.
   */
  close(id: string): void {
    const child = this.processes.get(id)
    if (!child) return

    // Try graceful shutdown via SIGTERM, then force kill after timeout
    child.kill('SIGTERM')
    // On Windows SIGTERM is not supported — use taskkill as fallback
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'])
      } catch {
        // best-effort
      }
    }

    // Remove immediately so the UI reflects the change
    this.readyApps.delete(id)
    this.processes.delete(id)
    this.notifyStateChange()
  }

  /**
   * Close all open dock app windows.
   */
  closeAll(): void {
    for (const [id] of this.processes) {
      this.close(id)
    }
    this.processes.clear()
    this.readyApps.clear()
    this.notifyStateChange()
  }

  /**
   * Get the IDs of all running dock apps.
   */
  getRunningIds(): string[] {
    return [...new Set([...this.processes.keys(), ...this.readyApps])].filter((id) =>
      this.processes.has(id)
    )
  }

  /**
   * Check if a specific app is running (i.e., has signaled 'ready').
   */
  isRunning(id: string): boolean {
    return this.readyApps.has(id) && this.processes.has(id)
  }

  /**
   * Subscribe to running-state changes. Returns an unsubscribe function.
   */
  onStateChange(callback: (runningIds: string[]) => void): () => void {
    this.stateChangeListeners.push(callback)
    return () => {
      const idx = this.stateChangeListeners.indexOf(callback)
      if (idx !== -1) this.stateChangeListeners.splice(idx, 1)
    }
  }

  /**
   * Notify all state-change listeners.
   */
  private notifyStateChange(): void {
    const runningIds = this.getRunningIds()
    for (const cb of this.stateChangeListeners) {
      try {
        cb(runningIds)
      } catch {
        // listener error — don't break the chain
      }
    }
  }
}
