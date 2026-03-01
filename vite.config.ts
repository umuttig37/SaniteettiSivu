import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = env.API_PORT || '8787'

  return {
    plugins: [react()],
    server: {
      allowedHosts: true,
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
  }
})
