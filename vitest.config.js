import { defineConfig } from 'vitest/config';
import webcontainerFilesPlugin from './.vite/plugins/webcontainer-files/index.js'
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    webcontainerFilesPlugin({ directory: './webcontainer-files' }),
    react(),
  ],
  test: {
    environment: 'node',
    include: [
      '**/*.test.js',
      'src/**/*.test.{ts,tsx}',
      '.vite/plugins/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    // Component tests need a DOM.
    environmentMatchGlobs: [
      ['src/**/*.test.tsx', 'jsdom'],
    ],
    transformMode: {
      web: [/\.[jt]sx?$/],
    },
    workers: {
      isolate: true
    }
  }
});
