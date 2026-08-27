// vite config
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'esnext'
  },
  server: {
    // Forward API calls to the local server.ts process during `vite dev`.
    proxy: {
      '/config': `http://localhost:${process.env.PORT || 3000}`,
      '/zoomtoken': `http://localhost:${process.env.PORT || 3000}`
    }
  }
})