import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'
import { env } from 'process'

function resolveBackendTarget(): string {
  const vitePort = parseInt(env.DEV_SERVER_PORT || '5174')

  if (env.VITE_ORCHESTRATOR_URL) return env.VITE_ORCHESTRATOR_URL

  if (env.ASPNETCORE_HTTPS_PORT) {
    const port = parseInt(env.ASPNETCORE_HTTPS_PORT)
    if (port && port !== vitePort) return `https://localhost:${port}`
  }

  const lsPath = path.join(__dirname, '..', 'Fabrik3D.Server', 'Properties', 'launchSettings.json')
  if (fs.existsSync(lsPath)) {
    try {
      const s = JSON.parse(fs.readFileSync(lsPath, 'utf-8'))
      const iisPort: number | undefined = s?.iisSettings?.iisExpress?.sslPort
      if (iisPort && iisPort > 0 && iisPort !== vitePort) return `https://localhost:${iisPort}`
      const kUrl: string | undefined = s?.profiles?.https?.applicationUrl
      if (kUrl) { const u = kUrl.split(';')[0]!; if (!u.includes(`:${vitePort}`)) return u }
    } catch { /* ignore */ }
  }

  return 'https://localhost:7249'
}

const target = resolveBackendTarget()

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: parseInt(env.DEV_SERVER_PORT || '5174'),
    proxy: {
      '/api': { target, secure: false, changeOrigin: true },
      '/hubs': { target, secure: false, ws: true, changeOrigin: true },
    },
  },
})
