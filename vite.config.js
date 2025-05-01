import { defineConfig } from 'vite';
import webcontainerFilesPlugin from './.vite/plugins/webcontainer-files'
import tailwindcssPlugin from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
  // Base path for GitHub Pages
  // Use '/' for a custom domain or the repo name for default GitHub Pages URL (e.g., '/repo-name/')
  base: './',
  
  // Configure the build output
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  
  // Plugin configuration if needed
  plugins: [webcontainerFilesPlugin()],
  
  // Customize server if needed
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcssPlugin,
        autoprefixer,
      ],
    },
  },
});