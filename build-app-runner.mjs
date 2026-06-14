/**
 * Build the app-runner entry point as a standalone CJS file.
 *
 * Uses tsc (TypeScript compiler) to produce a clean CJS output that works
 * when loaded by Electron as an entry point.  We compile to a temporary
 * directory to avoid interfering with the main process index.js output,
 * then copy the result to out/main/app-runner.js.
 */
import { execSync } from 'child_process'
import { copyFileSync, rmSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = process.cwd()
const TMP = resolve(ROOT, 'out/.tmp-app-runner')
const SRC = 'src/app-runner/index.ts'
const DST = resolve(ROOT, 'out/main/app-runner.js')

try {
  mkdirSync(TMP, { recursive: true })
  execSync(
    `npx tsc ${SRC} --rootDir . --outDir ${TMP} --module commonjs --target ES2022 --skipLibCheck --esModuleInterop`,
    { stdio: 'pipe', cwd: ROOT }
  )

  const built = resolve(TMP, 'src/app-runner/index.js')
  if (!existsSync(built)) {
    throw new Error(`Expected built file not found: ${built}`)
  }
  copyFileSync(built, DST)
  console.log(`✓ app-runner built → ${DST}`)
} finally {
  rmSync(TMP, { recursive: true, force: true })
}
