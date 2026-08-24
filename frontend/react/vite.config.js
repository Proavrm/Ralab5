import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const apiProxyTarget = process.env.RALAB_API_PROXY_TARGET || 'http://127.0.0.1:8000'

function manualChunks(id) {
  if (!id.includes('node_modules')) return undefined

  // Libs volumineuses → chunks séparés (meilleur cache + 1er load plus léger)
  if (id.includes('recharts') || id.includes('/d3-') || id.includes('\\d3-')) {
    return 'vendor-charts'
  }
  if (id.includes('pptxgenjs')) return 'vendor-pptx'
  if (id.includes('lucide-react')) return 'vendor-icons'
  if (id.includes('@tanstack')) return 'vendor-query'
  if (id.includes('react-router')) return 'vendor-router'
  if (
    id.includes('html-to-image')
    || id.includes('jsbarcode')
    || id.includes('qrcode')
    || id.includes('react-easy-crop')
    || id.includes('react-image-crop')
  ) {
    return 'vendor-media'
  }
  if (
    id.includes(`${path.sep}react${path.sep}`)
    || id.includes(`${path.sep}react-dom${path.sep}`)
    || id.includes(`${path.sep}scheduler${path.sep}`)
  ) {
    return 'vendor-react'
  }

  return 'vendor'
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    port: 5173,
    watch: {
      usePolling: true,
      interval: 1000,
    },
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
