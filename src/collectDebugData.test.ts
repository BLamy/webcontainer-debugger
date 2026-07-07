// Unit + integration tests for collectDebugData: the reader must match the
// exact on-disk shape the Babel plugin's runtime stub writes.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectDebugData, countTests, type FsLike } from './collectDebugData';

/** Adapter exposing node fs with the same surface as WebContainer's fs. */
function nodeFsAdapter(root: string): FsLike {
  return {
    async readdir(p: string, _opts: { withFileTypes: true }) {
      return fs
        .readdirSync(path.join(root, p), { withFileTypes: true })
        .map((d) => ({ name: d.name, isDirectory: () => d.isDirectory() }));
    },
    async readFile(p: string, _enc: 'utf-8') {
      return fs.readFileSync(path.join(root, p), 'utf-8');
    },
  };
}

function makeTree(spec: Record<string, object>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-'));
  for (const [rel, data] of Object.entries(spec)) {
    const full = path.join(root, '.timetravel', rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(data));
  }
  return root;
}

const step = (n: number, over: object = {}) => ({
  stepNumber: n,
  file: '/home/project/utils.js',
  line: n,
  vars: { n },
  suite: 'S',
  test: 't',
  ...over,
});

describe('collectDebugData', () => {
  it('collects nested suite/test/step structure', async () => {
    const root = makeTree({
      'Suite/Sub/my_test/1.json': step(1, { suite: 'Suite/Sub', test: 'my test' }),
      'Suite/Sub/my_test/2.json': step(2, { suite: 'Suite/Sub', test: 'my test' }),
    });
    const data = await collectDebugData(nodeFsAdapter(root));
    expect(Object.keys(data)).toEqual(['Suite/Sub']);
    expect(data['Suite/Sub']['my test'].map((s) => s.stepNumber)).toEqual([1, 2]);
    expect(countTests(data)).toBe(1);
  });

  it('sorts steps numerically, not lexicographically', async () => {
    const spec: Record<string, object> = {};
    for (const n of [1, 2, 10, 11, 3, 20]) {
      spec[`S/t/${n}.json`] = step(n, { test: 't' });
    }
    const data = await collectDebugData(nodeFsAdapter(makeTree(spec)));
    expect(data['S']['t'].map((s) => s.stepNumber)).toEqual([1, 2, 3, 10, 11, 20]);
  });

  it('skips top-level DefaultSuite and UnknownTest noise buckets', async () => {
    const root = makeTree({
      'DefaultSuite/UnknownTest/1.json': step(1, { suite: 'DefaultSuite', test: 'UnknownTest' }),
      'UnknownTest/1.json': step(1, { suite: '', test: 'UnknownTest' }),
      'Real/t/1.json': step(1, { suite: 'Real', test: 't' }),
    });
    const data = await collectDebugData(nodeFsAdapter(root));
    expect(Object.keys(data)).toEqual(['Real']);
  });

  it('tolerates corrupt step files without dropping the test', async () => {
    const root = makeTree({
      'S/t/1.json': step(1, { test: 't' }),
      'S/t/3.json': step(3, { test: 't' }),
    });
    fs.writeFileSync(path.join(root, '.timetravel', 'S', 't', '2.json'), '{not json');
    const data = await collectDebugData(nodeFsAdapter(root));
    expect(data['S']['t'].map((s) => s.stepNumber)).toEqual([1, 3]);
  });

  it('returns empty data when the directory is missing', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-'));
    const data = await collectDebugData(nodeFsAdapter(root));
    expect(data).toEqual({});
    expect(countTests(data)).toBe(0);
  });

  it('uses the human-readable test title from step data', async () => {
    const root = makeTree({
      'S/weird_name_1_2/1.json': step(1, { suite: 'S', test: 'weird name: 1/2' }),
    });
    const data = await collectDebugData(nodeFsAdapter(root));
    expect(Object.keys(data['S'])).toEqual(['weird name: 1/2']);
  });
});

describe('collectDebugData ⇄ instrumentation plugin integration', () => {
  it('reads the exact structure the plugin runtime writes (end-to-end)', async () => {
    const { transformSync } = await import('@babel/core');
    const { createRequire } = await import('module');
    const { default: plugin } = await import(
      '../webcontainer-files/.babel/plugins/debugger-instrumentation/index.js'
    );
    const require = createRequire(import.meta.url);

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
    const g = globalThis as any;
    const saved = {
      __recordStep: g.__recordStep,
      __resetStepCounter: g.__resetStepCounter,
      __testName: g.__testName,
      __suiteStack: g.__suiteStack,
      __currentSuite: g.__currentSuite,
    };
    try {
      delete g.__recordStep;
      delete g.__resetStepCounter;
      delete g.__testName;
      delete g.__suiteStack;
      delete g.__currentSuite;

      const src = `
        describe('Time Travel Utilities', () => {
          describe('calculateDeloreanSpeed', () => {
            it('adds speed', () => {
              const speed = 35 + 10;
            });
          });
        });
      `;
      const code = transformSync(src, {
        filename: 'utils.test.js',
        // absolute outDir: vitest workers can't chdir
        plugins: [[plugin, { outDir: path.join(workDir, '.timetravel') }]],
        babelrc: false,
        configFile: false,
        parserOpts: { sourceType: 'script' },
      })!.code!;

      // vitest-like deferred execution
      const queue: Array<() => void> = [];
      g.describe = (_: string, fn: () => void) => fn();
      g.it = g.test = (_: string, fn: () => void) => queue.push(fn);
      new Function('require', code)(require);
      for (const fn of queue) fn();

      const data = await collectDebugData(nodeFsAdapter(workDir));
      const suite = data['Time_Travel_Utilities/calculateDeloreanSpeed'];
      expect(suite).toBeTruthy();
      const steps = suite['adds speed'];
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.some((s) => s.vars?.speed === 45)).toBe(true);
      // steps arrive sorted
      const nums = steps.map((s) => s.stepNumber);
      expect(nums).toEqual([...nums].sort((a, b) => a - b));
    } finally {
      Object.assign(g, saved);
      delete g.describe;
      delete g.it;
      delete g.test;
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
});
