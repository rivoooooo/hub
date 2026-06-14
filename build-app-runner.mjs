/**
 * Build the app-runner entry point as a standalone CJS file.
 *
 * Uses tsc (TypeScript compiler) to produce a clean CJS output that works
 * when loaded by Electron as an entry point.  We compile to a temporary
 * directory to avoid interfering with the main process index.js output,
 * then copy the result to out/main/app-runner.js.
 */
import { execSync } from 'child_process'
import { copyFileSync, rmSync, existsSync, mkdirSync, readdirSync } from 'fs'
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

  const builtDir = resolve(TMP, 'src/app-runner')
  if (!existsSync(builtDir)) {
    throw new Error(`Expected built directory not found: ${builtDir}`)
  }
  for (const file of readdirSync(builtDir)) {
    if (file.endsWith('.js')) {
      copyFileSync(resolve(builtDir, file), resolve(ROOT, 'out/main', file))
    }
  }
  console.log(`✓ app-runner built → ${DST}`)
} finally {
  rmSync(TMP, { recursive: true, force: true })
}
