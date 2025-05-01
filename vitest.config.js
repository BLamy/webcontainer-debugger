import { defineConfig } from 'vitest/config';
import webcontainerFilesPlugin from './.vite/plugins/webcontainer-files/index.js'
import expectSoft from './webcontainer-files/.babel/plugins/expect-soft/index.js';
import { babel } from '@rollup/plugin-babel';

export default defineConfig({
  plugins: [
    webcontainerFilesPlugin({ directory: './webcontainer-files' }),
    babel({
      babelrc: false,
      configFile: false,
      // files to run through Babel
      extensions: ['.test.js', '.test.jsx', '.test.ts', '.test.tsx'],
      plugins: [expectSoft],
    }),
  ],
  test: {
    environment: 'node',
    include: [
      '**/*.test.js',       
      '.vite/plugins/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    transformMode: {
      web: [/\.[jt]sx?$/],
    },
    workers: {
      isolate: true
    }
  }
});