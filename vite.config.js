import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server runs inside Express (server/server.js --dev), so /api/* and
// the app share one origin and no proxy is needed.
export default defineConfig({
  plugins: [react()],
  // three.js + drei live in the lazily loaded RoomScene chunk (~1 MB).
  build: { chunkSizeWarningLimit: 1400 },
})
