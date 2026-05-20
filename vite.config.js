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
        secure: false,
        rewrite: (path) => path.replace(/^\/arcgis-proxy/, ''),
        headers: {
          'Origin': 'http://localhost:5173',
          'Referer': 'https://gis9.smartgeoapps.com/'
        }
      },
      '/arcgis-proxy-gis12': {
        target: 'https://gis12.smartgeoapps.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/arcgis-proxy-gis12/, ''),
        headers: {
          'Origin': 'http://localhost:5173',
          'Referer': 'https://gis12.smartgeoapps.com/'
        }
      }
    }
  }
})
