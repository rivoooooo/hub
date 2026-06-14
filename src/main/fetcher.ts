import { HttpsProxyAgent } from 'https-proxy-agent'
import * as http from 'http'
import * as https from 'https'
import * as settings from './settings-store'

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
 * When a proxy is configured and enabled, the request is tunnelled through it
 * via HttpsProxyAgent.  Otherwise a plain Node http/https request is used.
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

  return new Promise<FetchTextResult>((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === 'https:' ? https : http
    const defaultPort = parsed.protocol === 'https:' ? 443 : 80

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

    // Attach proxy agent if configured
    if (proxyUrl) {
      reqOpts.agent = new HttpsProxyAgent(proxyUrl)
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
      res.on('error', reject)
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error(`Request timeout after ${timeout}ms`))
    })
    req.on('error', reject)
    req.end()
  })
}
