import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'

export default defineConfig({
  main: {
    build: {
      // Don't wipe out/main/ — app-runner.js is placed there by a separate build step
      emptyOutDir: false
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          'browser-preload': resolve('src/preload/browser-preload.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js'
        },
        external: ['electron']
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/renderer/src/paraglide'
      }),
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss()
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          toolbar: resolve('src/renderer/toolbar.html')
        }
      }
    }
  }
})
