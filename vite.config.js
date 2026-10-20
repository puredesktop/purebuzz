import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

const port = Number(process.env.PURESCIENCE_APP_DEV_PORT) || 5390

export default defineConfig({
  plugins: [react()],
  server: { host: 'localhost', port, strictPort: true },
})
