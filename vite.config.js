import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'framer-motion': path.resolve(__dirname, 'node_modules/framer-motion/dist/cjs/index.js'),
    },
  },
  build: {
    sourcemap: true,
    minify:false,
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
})
