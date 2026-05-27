import { resolve } from 'path'
import { defineConfig, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load .env.local into process.env so we can forward to builds
  const env = loadEnv(mode, process.cwd(), '')

  const builtInDefine = {
    'process.env.BUILT_IN_PROVIDER': JSON.stringify(env.BUILT_IN_PROVIDER || ''),
    'process.env.BUILT_IN_MODEL': JSON.stringify(env.BUILT_IN_MODEL || ''),
    'process.env.BUILT_IN_API_KEY': JSON.stringify(env.BUILT_IN_API_KEY || ''),
    'process.env.BUILT_IN_BASE_URL': JSON.stringify(env.BUILT_IN_BASE_URL || ''),
    'process.env.BUILT_IN_MAX_TOKENS': JSON.stringify(env.BUILT_IN_MAX_TOKENS || '4096'),
    'process.env.BUILT_IN_FORCE': JSON.stringify(env.BUILT_IN_FORCE || 'false')
  }

  return {
    main: {
      resolve: {
        alias: {
          '@shared': resolve('src/shared')
        }
      },
      define: builtInDefine,
      build: {
        rollupOptions: {
          external: ['electron', 'better-sqlite3']
        }
      }
    },
    preload: {
      resolve: {
        alias: {
          '@shared': resolve('src/shared')
        }
      }
    },
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@shared': resolve('src/shared')
        }
      },
      plugins: [react()]
    }
  }
})
