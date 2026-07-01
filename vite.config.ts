import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standard SPA build (deployed to Vercel). Unlike the local single-file editor,
// this app talks to Supabase and is served as normal static assets.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
  },
})
