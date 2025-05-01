import { defineConfig } from 'vite';
import webcontainerFilesPlugin from './.vite/plugins/webcontainer-files'

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  plugins: [webcontainerFilesPlugin()]
});