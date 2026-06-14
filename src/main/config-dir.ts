import { app } from 'electron'
import { join } from 'path'

let _configDir: string | null = null

/**
 * Return the path to the config directory (~/.rivo).
 * This is used for user configuration files (settings, apps, bridge),
 * distinct from the system data directory used for operational records.
 */
export function getConfigDir(): string {
  if (!_configDir) {
    _configDir = join(app.getPath('home'), '.rivo')
  }
  return _configDir
}
