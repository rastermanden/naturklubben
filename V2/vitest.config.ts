import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'

const WASM_VIRTUAL_PREFIX = 'virtual:wasm-module:'

function wasmModulePlugin(): Plugin {
  return {
    name: 'wasm-module',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!source.endsWith('.wasm')) return null
      const resolved = importer
        ? path.resolve(path.dirname(importer), source)
        : path.resolve(source)
      return `${WASM_VIRTUAL_PREFIX}${Buffer.from(resolved).toString('base64url')}`
    },
    load(id) {
      if (!id.startsWith(WASM_VIRTUAL_PREFIX)) return null
      const encoded = id.slice(WASM_VIRTUAL_PREFIX.length)
      const filePath = Buffer.from(encoded, 'base64url').toString('utf8')
      const base64 = readFileSync(filePath).toString('base64')
      return `const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0));
export default new WebAssembly.Module(bytes);`
    },
  }
}

export default defineConfig({
  plugins: [wasmModulePlugin()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'convex/**/*.test.ts'],
    server: {
      deps: {
        inline: ['password-hash-wasm', '@convex-dev/auth'],
      },
    },
  },
})
