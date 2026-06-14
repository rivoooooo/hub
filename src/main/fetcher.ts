import { HttpsProxyAgent } from 'https-proxy-agent'
import { HttpProxyAgent } from 'http-proxy-agent'
import * as http from 'http'
import * as https from 'https'
import * as settings from './settings-store'
import { getLogger } from './logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FetchTextResult {
  text: string
  status: number
  statusText: string
  contentType: string
}

export interface FetchTextOptions {
  /** Timeout in ms (default 15 000) */
  timeout?: number
  /** Extra headers to send */
  headers?: Record<string, string>
  /** Proxy URL override. If not set, falls back to settings-store. */
  proxyUrl?: string
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a URL as text, respecting proxy settings from the app settings-store.
 *
 * Proxy routing:
 *   - HTTPS target + proxy → `HttpsProxyAgent` (CONNECT tunnel + TLS)
 *   - HTTP  target + proxy → `HttpProxyAgent`  (forward proxy)
 *   - No proxy             → plain Node http/https request
 *
 * This runs in the main (Node) process so it never hits CORS errors.
 */
export async function fetchText(url: string, opts?: FetchTextOptions): Promise<FetchTextResult> {
  const timeout = opts?.timeout ?? 15_000
  const headers = opts?.headers ?? {}

  // Resolve proxy — explicit arg > settings-store
  let proxyUrl: string | undefined = opts?.proxyUrl
  if (!proxyUrl) {
    const proxySettings = { enabled: settings.get('proxyEnabled'), url: settings.get('proxyUrl') }
    if (proxySettings.enabled && proxySettings.url) {
      proxyUrl = proxySettings.url
    }
  }

  // Normalise proxy URL — add scheme if missing
  if (proxyUrl && !/^https?:\/\//i.test(proxyUrl)) {
    proxyUrl = 'http://' + proxyUrl
  }

  if (proxyUrl) {
    getLogger().debug(`Using proxy: ${proxyUrl} → ${url}`, { proxy: proxyUrl, target: url })
  } else {
    getLogger().debug(`Direct request (no proxy): ${url}`, { target: url })
  }

  return new Promise<FetchTextResult>((resolve, reject) => {
    const parsed = new URL(url)
    const isHttpsTarget = parsed.protocol === 'https:'
    const mod = isHttpsTarget ? https : http
    const defaultPort = isHttpsTarget ? 443 : 80

    const reqOpts: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : defaultPort,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DevBrowser/1.0)',
        Accept: '*/*',
        ...headers
      },
      timeout
    }

    // Attach proxy agent if configured — choose the correct type
    if (proxyUrl) {
      try {
        const parsedProxy = new URL(proxyUrl)
        const isHttpsProxy = parsedProxy.protocol === 'https:'
        // Use HttpsProxyAgent when either the proxy itself is HTTPS
        // or the target is HTTPS (need CONNECT tunnel + TLS).
        reqOpts.agent =
          isHttpsTarget || isHttpsProxy
            ? new HttpsProxyAgent(proxyUrl)
            : new HttpProxyAgent(proxyUrl)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return reject(new Error(`[fetcher] Failed to create proxy agent for "${proxyUrl}": ${msg}`))
      }
    }

    const req = mod.request(reqOpts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8')
        resolve({
          text,
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? '',
          contentType: (res.headers['content-type'] as string) ?? ''
        })
      })
      res.on('error', (err) => {
        reject(
          new Error(
            `[fetcher] Response stream error for ${url}${proxyUrl ? ` via proxy ${proxyUrl}` : ''}: ${err.message}`
          )
        )
      })
    })

    req.on('timeout', () => {
      req.destroy()
      reject(
        new Error(
          `[fetcher] Request timeout after ${timeout}ms for ${url}${proxyUrl ? ` via proxy ${proxyUrl}` : ''}`
        )
      )
    })

    req.on('error', (err) => {
      // Wrap TLS / socket errors with proxy context for easier debugging
      const ctx = proxyUrl ? ` via proxy ${proxyUrl}` : ''
      reject(new Error(`[fetcher] ${err.message} (${url}${ctx})`))
    })

    req.end()
  })
}
