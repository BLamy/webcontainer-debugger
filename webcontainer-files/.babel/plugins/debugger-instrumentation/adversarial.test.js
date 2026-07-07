// Adversarial & fuzz tests for the debugger-instrumentation plugin.
// These exercise hostile inputs: circular structures, BigInt, throwing
// getters, concise arrow bodies, dynamic titles, deferred test execution
// (real-vitest collection semantics), and a seeded random-program fuzzer.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { transformSync } from '@babel/core';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import debuggerInstrumentation from './index.js';

const require = createRequire(import.meta.url);

// Isolated output dir so this suite never races the sibling test file
// (both suites run in parallel vitest workers sharing one cwd).
const OUT_DIR = '.timetravel-adversarial';
const TT_DIR = () => path.join(process.cwd(), OUT_DIR);

function cleanTimetravel() {
  if (fs.existsSync(TT_DIR())) fs.rmSync(TT_DIR(), { recursive: true, force: true });
}

function loadAllSteps() {
  const out = [];
  const walk = d => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d)) {
      const full = path.join(d, entry);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.json')) {
        out.push({ file: full, data: JSON.parse(fs.readFileSync(full, 'utf8')) });
      }
    }
  };
  walk(TT_DIR());
  return out.sort((a, b) => a.data.stepNumber - b.data.stepNumber);
}

function transform(source, pluginOpts = {}) {
  return transformSync(source, {
    filename: 'fuzz-fixture.js',
    plugins: [[debuggerInstrumentation, { suiteName: 'FuzzSuite', outDir: OUT_DIR, ...pluginOpts }]],
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'script' },
  }).code;
}

/**
 * Execute transformed code with vitest-like deferred test semantics:
 * describe callbacks run at collection time, it/test bodies are queued
 * and run afterwards — exactly what real vitest does. Execution errors
 * are rethrown (instrumentation must never break user code).
 */
function runDeferred(source, pluginOpts = {}) {
  const code = transform(source, pluginOpts);
  const g = globalThis;
  const queue = [];
  g.it = g.test = (name, fn) => queue.push(fn);
  g.describe = (name, fn) => fn();
  new Function('require', code)(require);
  for (const fn of queue) fn();
}

/** Immediate execution (their original harness style). */
function runImmediate(source, pluginOpts = {}) {
  const code = transform(source, pluginOpts);
  const g = globalThis;
  g.it = g.test = (name, fn) => fn();
  g.describe = (name, fn) => fn();
  new Function('require', code)(require);
}

beforeEach(() => {
  cleanTimetravel();
  delete globalThis.__recordStep;
  delete globalThis.__resetStepCounter;
  delete globalThis.__testName;
  delete globalThis.__suiteStack;
  delete globalThis.__currentSuite;
  delete globalThis.it;
  delete globalThis.test;
  delete globalThis.describe;
});

afterEach(() => {
  cleanTimetravel();
});

describe('adversarial: hostile runtime values', () => {
  it('survives circular structures in captured vars', () => {
    expect(() =>
      runImmediate(`
        const a = { name: 'a' };
        a.self = a;
        const b = [a];
        b.push(b);
        const done = true;
      `)
    ).not.toThrow();
    const steps = loadAllSteps();
    expect(steps.length).toBeGreaterThan(0);
    const step = steps.find(s => s.data.vars.a && s.data.vars.a.self);
    expect(step.data.vars.a.self).toBe('[Circular]');
  });

  it('survives BigInt, Symbol and function values', () => {
    expect(() =>
      runImmediate(`
        const big = 10n ** 20n;
        const sym = Symbol('boom');
        const fn = function named() {};
        const done = true;
      `)
    ).not.toThrow();
    const last = loadAllSteps().at(-1).data;
    expect(last.vars.big).toBe('100000000000000000000n');
    expect(last.vars.fn).toBe('[Function]');
    expect(String(last.vars.sym)).toContain('boom');
  });

  it('survives objects whose getters throw during capture', () => {
    expect(() =>
      runImmediate(`
        const trap = {};
        Object.defineProperty(trap, 'boom', {
          enumerable: true,
          get() { throw new Error('gotcha'); },
        });
        const done = true;
      `)
    ).not.toThrow();
    expect(loadAllSteps().length).toBeGreaterThan(0);
  });

  it('does not break user code even if the .timetravel dir is unwritable', () => {
    // Simulate by pre-creating .timetravel as a FILE so mkdir fails.
    fs.writeFileSync(TT_DIR(), 'not a directory');
    try {
      expect(() => runImmediate('const ok = 1;')).not.toThrow();
    } finally {
      fs.rmSync(TT_DIR(), { force: true });
    }
  });
});

describe('adversarial: test-runner shapes', () => {
  it('attributes steps correctly under deferred (real vitest) execution', () => {
    runDeferred(`
      describe('Outer', () => {
        describe('Inner', () => {
          it('t1', () => { const v1 = 1; });
          it('t2', () => { const v2 = 2; });
        });
      });
    `);
    const t1 = path.join(TT_DIR(), 'Outer', 'Inner', 't1');
    const t2 = path.join(TT_DIR(), 'Outer', 'Inner', 't2');
    expect(fs.existsSync(t1)).toBe(true);
    expect(fs.existsSync(t2)).toBe(true);
    // every step in t1 belongs to t1 (no cross-test leakage)
    for (const f of fs.readdirSync(t1)) {
      const data = JSON.parse(fs.readFileSync(path.join(t1, f), 'utf8'));
      expect(data.test).toBe('t1');
      expect(data.suite).toBe('Outer/Inner');
    }
  });

  it('helper code called from a test is attributed to that test (deferred)', () => {
    runDeferred(`
      function helper(n) {
        const doubled = n * 2;
        return doubled;
      }
      describe('S', () => {
        it('uses helper', () => {
          const r = helper(21);
        });
      });
    `);
    const dir = path.join(TT_DIR(), 'S', 'uses_helper');
    expect(fs.existsSync(dir)).toBe(true);
    const steps = fs
      .readdirSync(dir)
      .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    expect(steps.some(s => 'doubled' in s.vars && s.vars.doubled === 42)).toBe(true);
  });

  it('pops the suite stack even for concise arrow describe bodies', () => {
    runImmediate(`
      describe('A', () => it('t', () => { const x = 1; }));
      const after = 1;
    `);
    // the trailing statement must NOT be attributed to suite A
    const steps = loadAllSteps();
    const trailing = steps.find(s => 'after' in s.data.vars && s.data.vars.after === 1);
    expect(trailing).toBeTruthy();
    expect(trailing.data.suite).not.toBe('A');
    expect(globalThis.__suiteStack).toEqual([]);
  });

  it('pops the suite stack when a describe body throws', () => {
    try {
      runImmediate(`
        describe('Bad', () => { throw new Error('collection error'); });
      `);
    } catch {
      /* expected */
    }
    expect(globalThis.__suiteStack).toEqual([]);
  });

  it('skips describe/it with dynamic (non-literal) titles without crashing', () => {
    expect(() =>
      runImmediate(`
        const name = 'dyn';
        describe(\`suite \${name}\`, () => {
          it(\`test \${name}\`, () => { const v = 1; });
        });
      `)
    ).not.toThrow();
  });

  it('handles unicode / emoji test titles', () => {
    runImmediate(`
      describe('Émojis 🚀', () => {
        it('does 💥 things', () => { const v = 1; });
      });
    `);
    const steps = loadAllSteps().filter(s => s.data.test === 'does 💥 things');
    expect(steps.length).toBeGreaterThan(0);
  });
});

describe('adversarial: language constructs', () => {
  const constructs = [
    ['classes with getters and static blocks',
      `class Vec {
        static origin = 0;
        #hidden = 1;
        get mag() { return 2; }
        add(n) { const r = n + this.#hidden; return r; }
      }
      const v = new Vec();
      const out = v.add(1);`],
    ['generator functions',
      `function* gen() { yield 1; const mid = 2; yield mid; }
      const arr = [...gen()];`],
    ['labeled statements with continue',
      `let total = 0;
      outer: for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (j > i) continue outer;
          total += 1;
        }
      }`],
    ['switch statements',
      `let mode = 2, label = '';
      switch (mode) {
        case 1: label = 'one'; break;
        case 2: label = 'two'; break;
        default: label = 'many';
      }`],
    ['try/catch/finally with rethrow swallowed',
      `let caught = false;
      try { throw new Error('x'); } catch (e) { caught = true; } finally { const f = 1; }`],
    ['nested destructuring with defaults',
      `const { a: { b = 5 } = {}, ...rest } = { a: {}, z: 9 };
      const done = b + rest.z;`],
    ['tagged templates and regex literals',
      `const tag = (s, ...v) => s.raw.join('|') + v.join(',');
      const s = tag\`a\${1}b\${2}\`;
      const re = /ab+c/gi.test('abbc');`],
    ['getters/setters on object literals',
      `const obj = { _v: 1, get v() { return this._v; }, set v(x) { this._v = x; } };
      obj.v = 3;
      const got = obj.v;`],
    ['do-while and comma expressions',
      `let n = 0, m = 0;
      do { n++, m += n; } while (n < 3);`],
    ['immediately-invoked async arrow',
      `(async () => { const inner = await Promise.resolve(7); })();
      const sync = 1;`],
  ];

  for (const [name, src] of constructs) {
    it(`instruments ${name} without crashing`, () => {
      expect(() => runImmediate(src)).not.toThrow();
      // every emitted step file must be valid JSON (loadAllSteps parses)
      expect(() => loadAllSteps()).not.toThrow();
    });
  }

  it('does not double-record statements wrapped from single-line ifs', () => {
    runImmediate(`
      let x = 0;
      if (x === 0) x = 1;
    `);
    const code = transform(`
      let x = 0;
      if (x === 0) x = 1;
    `);
    // the wrapped consequent should carry exactly one recorder for line 3
    const line3Recorders = [...code.matchAll(/__recordStep\("fuzz-fixture\.js", 3/g)];
    expect(line3Recorders.length).toBeLessThanOrEqual(1);
  });

  it('respects maxVars: 0 by emitting no steps', () => {
    runImmediate('const a = 1; const b = 2;', { maxVars: 0 });
    expect(loadAllSteps()).toHaveLength(0);
  });
});

describe('fuzz: seeded random program generation', () => {
  // deterministic PRNG (mulberry32)
  function prng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function genProgram(rand) {
    const pick = arr => arr[Math.floor(rand() * arr.length)];
    const id = i => `v${i}`;
    let counter = 0;
    const stmt = depth => {
      const choices = [
        () => `const ${id(counter++)} = ${Math.floor(rand() * 100)};`,
        () => `let ${id(counter++)} = "s${Math.floor(rand() * 10)}";`,
        () => `const ${id(counter++)} = [${Math.floor(rand() * 5)}, "x", null, undefined];`,
        () => `const ${id(counter++)} = { k: ${Math.floor(rand() * 9)}, n: { deep: true } };`,
        () => {
          const v = id(counter++);
          return `let ${v} = 0; if (${Math.floor(rand() * 2)}) ${v} = 1; else ${v} = 2;`;
        },
        () => {
          const v = id(counter++);
          return `let ${v} = 0; for (let i = 0; i < ${1 + Math.floor(rand() * 3)}; i++) { ${v} += i; }`;
        },
        () => {
          const f = `f${counter++}`;
          return `function ${f}(p) { const local = p * 2; return local; } const ${id(counter++)} = ${f}(${Math.floor(rand() * 10)});`;
        },
        () => {
          const v = id(counter++);
          return `const ${v} = (() => { try { throw new Error('e'); } catch (e) { return 'caught'; } })();`;
        },
        () => {
          const v = id(counter++);
          return `const ${v} = {}; ${v}.self = ${v};`;
        },
      ];
      let out = pick(choices)();
      if (depth > 0 && rand() < 0.3) {
        out += `\n{ ${stmt(depth - 1)} }`;
      }
      return out;
    };

    const bodyStmts = [];
    const n = 3 + Math.floor(rand() * 6);
    for (let i = 0; i < n; i++) bodyStmts.push(stmt(2));

    if (rand() < 0.5) {
      return `describe('Fuzz${Math.floor(rand() * 100)}', () => {
        it('fuzz test', () => {
          ${bodyStmts.join('\n')}
        });
      });`;
    }
    return bodyStmts.join('\n');
  }

  for (let seed = 1; seed <= 25; seed++) {
    it(`seed ${seed}: transform + execute cleanly, all steps valid JSON`, () => {
      const rand = prng(seed * 7919);
      const src = genProgram(rand);
      let code;
      expect(() => (code = transform(src)), `transform failed for:\n${src}`).not.toThrow();
      expect(() => runImmediate(src), `execution failed for:\n${src}`).not.toThrow();
      const steps = loadAllSteps();
      for (const s of steps) {
        expect(typeof s.data.stepNumber).toBe('number');
        expect(typeof s.data.line).toBe('number');
        expect(s.data.line).toBeGreaterThan(0);
        expect(typeof s.data.vars).toBe('object');
      }
    });
  }
});
