import { defineConfig } from 'vitest/config';
import { babel } from '@rollup/plugin-babel';
import timeTravelPlugin from './babel-plugin-timeTravel.js';

export default defineConfig({
  plugins: [
    babel({
      babelrc: false,
      configFile: false,
      // files to run through Babel
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      plugins: [[timeTravelPlugin, { maxVars: 150 }]],
    }),
  ],

  test: {
    environment: 'jsdom',
    include: ['**/*.test.js'],
  }
});
