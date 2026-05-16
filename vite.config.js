import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/arcgis-proxy': {
        target: 'https://gis9.smartgeoapps.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/arcgis-proxy/, '')
      }
    }
  }
})
