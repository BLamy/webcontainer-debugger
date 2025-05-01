import { defineConfig } from 'vitest/config';
import webcontainerFilesPlugin from './.vite/plugins/webcontainer-files'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['**/*.test.js'],
    transformMode: {
      web: [/\.[jt]sx?$/],
    },
    plugins: [
      [webcontainerFilesPlugin()]
    ]
  }
});