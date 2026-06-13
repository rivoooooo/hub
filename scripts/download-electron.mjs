#!/usr/bin/env node

/**
 * download-electron.mjs
 *
 * Manually download the Electron binary into node_modules/electron/dist/.
 * Use this when the automatic postinstall script fails (e.g. network issues,
 * pnpm strict module resolution, or proxy problems).
 *
 * Usage:
 *   node scripts/download-electron.mjs
 *
 * With a mirror (recommended in China / restricted networks):
 *   ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node scripts/download-electron.mjs
 *
 * Or via npm script:
 *   npm run download-electron
 *   ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm run download-electron
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  createWriteStream
} from 'fs'
import { join, resolve } from 'path'
import { get } from 'https'
import { get as httpGet } from 'http'
import { execSync, spawnSync } from 'child_process'
import { URL } from 'url'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')

// ---- helpers ----

function resolveElectronDir() {
  // Resolve the real path of node_modules/electron (handles pnpm symlinks)
  const projectRoot = resolve(__dirname, '..')
  const electronDir = join(projectRoot, 'node_modules', 'electron')
  const real = realpathSync(electronDir)
  console.log(`[download-electron] Electron package: ${real}`)
  return real
}

function readElectronVersion(electronDir) {
  const pkg = JSON.parse(readFileSync(join(electronDir, 'package.json'), 'utf-8'))
  return pkg.version
}

function getPlatformArch() {
  const platform = process.platform // darwin, win32, linux
  const arch = process.arch // x64, arm64

  let osName
  switch (platform) {
    case 'darwin':
      osName = 'darwin'
      break
    case 'win32':
      osName = 'win32'
      break
    case 'linux':
      osName = 'linux'
      break
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }

  let archName
  switch (arch) {
    case 'x64':
      archName = 'x64'
      break
    case 'arm64':
      archName = 'arm64'
      break
    case 'ia32':
      archName = 'ia32'
      break
    default:
      throw new Error(`Unsupported architecture: ${arch}`)
  }

  // Rosetta detection on macOS
  if (platform === 'darwin' && arch === 'x64' && process.arch === 'x64') {
    try {
      const out = execSync('sysctl -in sysctl.proc_translated', { encoding: 'utf-8' }).trim()
      if (out === '1') {
        console.log('[download-electron] Running under Rosetta, downloading arm64 binary')
        archName = 'arm64'
      }
    } catch {
      // ignore
    }
  }

  return { os: osName, arch: archName }
}

function getRelativeBinaryPath(os) {
  // The binary name / path inside dist/ for path.txt
  switch (os) {
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron'
    case 'win32':
      return 'electron.exe'
    case 'linux':
      return 'electron'
    default:
      throw new Error(`Unknown OS: ${os}`)
  }
}

// ---- download ----

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const httpMod = parsed.protocol === 'https:' ? get : httpGet

    console.log(`[download-electron] Downloading:\n  ${url}`)
    console.log(`[download-electron] To: ${destPath}`)

    const file = createWriteStream(destPath)

    httpMod
      .get(url, { headers: { 'User-Agent': 'electron-download-script' } }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close()
          unlinkSync(destPath)
          console.log(`[download-electron] Redirecting to ${res.headers.location}`)
          return resolve(downloadFile(res.headers.location, destPath))
        }

        if (res.statusCode !== 200) {
          file.close()
          unlinkSync(destPath)
          return reject(new Error(`Download failed: HTTP ${res.statusCode} ${res.statusMessage}`))
        }

        const total = parseInt(res.headers['content-length'], 10)
        let downloaded = 0
        let lastLog = 0

        res.on('data', (chunk) => {
          downloaded += chunk.length
          if (total) {
            const pct = ((downloaded / total) * 100).toFixed(1)
            const now = Date.now()
            if (now - lastLog > 1000) {
              process.stdout.write(
                `\r  ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB)`
              )
              lastLog = now
            }
          }
        })

        res.pipe(file)

        file.on('finish', () => {
          file.close()
          process.stdout.write('\r  ✓ Download complete\n')
          resolve()
        })
      })
      .on('error', (err) => {
        file.close()
        if (existsSync(destPath)) unlinkSync(destPath)
        reject(err)
      })
  })
}

// ---- extraction ----

function extractZip(zipPath, distDir) {
  console.log(`[download-electron] Extracting to ${distDir} ...`)

  if (process.platform === 'win32') {
    // PowerShell on Windows
    const result = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path "${zipPath}" -DestinationPath "${distDir}" -Force`
      ],
      { stdio: 'inherit', shell: true }
    )
    if (result.status !== 0) {
      throw new Error(`PowerShell Expand-Archive failed (exit code ${result.status})`)
    }
  } else {
    // macOS / Linux
    const result = spawnSync('unzip', ['-o', zipPath, '-d', distDir], { stdio: 'inherit' })
    if (result.status !== 0) {
      throw new Error(`unzip failed (exit code ${result.status})`)
    }
  }

  console.log('[download-electron] ✓ Extraction complete')
}

function writePathText(electronDir, relativeBinaryPath) {
  const pathTxt = join(electronDir, 'path.txt')
  // Write without trailing newline (matching Electron's own install.js behavior)
  writeFileSync(pathTxt, relativeBinaryPath)
  console.log(`[download-electron] ✓ Wrote ${pathTxt}`)
}

function writeVersionFile(distDir, version) {
  writeFileSync(join(distDir, 'version'), version)
  console.log(`[download-electron] ✓ Wrote dist/version`)
}

// ---- verification ----

function verifyBinary(electronDir, relativeBinaryPath) {
  const binaryPath = join(electronDir, 'dist', relativeBinaryPath)
  if (!existsSync(binaryPath)) {
    throw new Error(`Binary not found at ${binaryPath}`)
  }

  const stats = statSync(binaryPath)
  console.log(
    `[download-electron] ✓ Binary exists: ${binaryPath} (${(stats.size / 1024).toFixed(1)} KB)`
  )

  // Try to get version from the binary
  try {
    const out = execSync(`"${binaryPath}" --version`, { encoding: 'utf-8', timeout: 10000 })
    console.log(`[download-electron] ✓ ${out.trim()}`)
  } catch (e) {
    console.warn(`[download-electron] ⚠ Could not verify binary version: ${e.message}`)
  }
}

// ---- main ----

async function main() {
  console.log('[download-electron] ====================================')
  console.log('[download-electron]  Electron binary downloader')
  console.log('[download-electron] ====================================\n')

  // Resolve electron package dir
  const electronDir = resolveElectronDir()
  const version = readElectronVersion(electronDir)
  console.log(`[download-electron] Version: ${version}`)

  // Platform
  const { os, arch } = getPlatformArch()
  console.log(`[download-electron] Platform: ${os}-${arch}`)

  const relativeBinaryPath = getRelativeBinaryPath(os)
  console.log(`[download-electron] Binary path: ${relativeBinaryPath}`)

  // Target dir
  const distDir = join(electronDir, 'dist')
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true })
    console.log(`[download-electron] Created dist directory`)
  }

  // ---- check if already installed ----
  const existingVersionFile = join(distDir, 'version')
  if (existsSync(existingVersionFile)) {
    const existing = readFileSync(existingVersionFile, 'utf-8').trim()
    if (existing.replace(/^v/, '') === version) {
      const binaryCandidate = join(distDir, relativeBinaryPath)
      if (existsSync(binaryCandidate)) {
        console.log(`[download-electron] ✓ Electron ${version} already installed in dist/`)
        console.log(`[download-electron]   (delete dist/ and re-run to force re-download)\n`)
        return
      }
    }
  }

  // ---- download URL ----
  const mirror =
    process.env.ELECTRON_MIRROR || 'https://github.com/electron/electron/releases/download'
  const filename = `electron-v${version}-${os}-${arch}.zip`
  const downloadUrl = mirror.endsWith('/')
    ? `${mirror}v${version}/${filename}`
    : `${mirror}/v${version}/${filename}`

  // ---- download ----
  const zipPath = join(distDir, filename)
  try {
    await downloadFile(downloadUrl, zipPath)
  } catch (err) {
    console.error(`\n[download-electron] ✗ Download failed: ${err.message}`)
    console.error(`\n  Suggestions:`)
    console.error(`  1. Set a different mirror:`)
    console.error(
      `     ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node scripts/download-electron.mjs`
    )
    console.error(`  2. Or download manually from:`)
    console.error(`     ${downloadUrl}`)
    console.error(`     and extract to: ${distDir}`)
    process.exit(1)
  }

  // ---- extract ----
  try {
    extractZip(zipPath, distDir)
  } catch (err) {
    console.error(`[download-electron] ✗ Extraction failed: ${err.message}`)
    console.error(`   You can manually extract ${zipPath} to ${distDir}`)
    process.exit(1)
  }

  // ---- cleanup and post-extract tasks ----
  try {
    unlinkSync(zipPath)
    console.log('[download-electron] ✓ Removed temporary zip file')
  } catch {
    /* ok */
  }

  // Write path.txt
  writePathText(electronDir, relativeBinaryPath)

  // Move dist/version if the zip had one one level up (Electron sometimes ships it inside the zip)
  const extractedVersionFile = join(distDir, 'version')
  if (existsSync(extractedVersionFile)) {
    // already in dist/ — good
    const content = readFileSync(extractedVersionFile, 'utf-8').trim()
    console.log(`[download-electron] dist/version content: ${content}`)
  } else {
    writeVersionFile(distDir, version)
  }

  // Move LICENSE / LICENSES.chromium.html up if needed
  // (Electron.app puts them inside, but they're fine in dist/ too)

  console.log('')

  // ---- verify ----
  verifyBinary(electronDir, relativeBinaryPath)

  console.log('\n[download-electron] ====================================')
  console.log('[download-electron]  ✓ Done! Electron is ready to use.')
  console.log('[download-electron] ====================================')
}

main().catch((err) => {
  console.error(`\n[download-electron] ✗ Unhandled error:`, err)
  process.exit(1)
})
