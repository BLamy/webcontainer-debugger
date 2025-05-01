import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { transformSync } from '@babel/core';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import debuggerInstrumentation from './index.js'; // Assuming index.js is the updated plugin

const require = createRequire(import.meta.url);

/** wipe the plugin's output directory */
function cleanTimetravel() {
  const dir = path.join(process.cwd(), '.timetravel');
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function loadAllSteps() {
  const dir = path.join(process.cwd(), '.timetravel');
  const out = [];
  const walk = d => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d)) {
      const full = path.join(d, entry);
      const stat = fs.statSync(full);
      stat.isDirectory()
        ? walk(full)
        : entry.endsWith('.json') &&
          out.push({ file: full, data: JSON.parse(fs.readFileSync(full, 'utf8')) });
    }
  };
  walk(dir);
  // Sort steps globally by stepNumber just in case, though resetting should handle per-test order
  return out.sort((a, b) => a.data.stepNumber - b.data.stepNumber);
}

/** compile `source` with the plugin and execute it in-process - UPDATED */
function run(source, pluginOpts = {}) {
  const { code } = transformSync(source, {
    filename: 'fixture.js', // Consistent filename helps debugging
    plugins: [[debuggerInstrumentation, { suiteName: 'Edge Suite', ...pluginOpts }]],
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'script' } // Use 'script' if not using import/export in test source
  });

  // Ensure globalThis exists if in a weird environment
  const globalScope = (typeof globalThis !== 'undefined' ? globalThis : global);

  // Vitest-style globals with reset logic
  globalScope.it = globalScope.test = (n, fn) => {
    // --- Call the reset function before each test ---
    if (typeof globalScope.__resetStepCounter === 'function') {
      globalScope.__resetStepCounter();
      // console.log(`[Test Runner] Called __resetStepCounter for test: ${n}`); // Debug log
    } else {
      // console.log(`[Test Runner] __resetStepCounter not found for test: ${n}`); // Debug log
    }
    // Set test name context BEFORE running the test function
    globalScope.__testName = n;
    try {
      fn(); // Execute the actual test function
    } finally {
      // Clean up test name after execution (optional, depends if beforeEach handles it)
      // delete globalScope.__testName;
    }
  };
  globalScope.describe = (n, fn) => {
    // Describe just executes the callback, suite path managed by plugin visitors
    fn();
  };

  // Execute the transformed code in the global scope
  // Pass require and globalScope itself if needed within the executed code
  try {
      new Function('require', 'globalThis', code)(require, globalScope);
  } catch(execError) {
      console.error("Error executing transformed code:", execError);
      // Optional: throw execError; // Rethrow if you want the test run to fail hard here
  }
}

/* -------------------------------------------------- *
 * tests                                              *
 * -------------------------------------------------- */

// --- UPDATED beforeEach ---
beforeEach(() => {
  cleanTimetravel();
  // Ensure global state is clean before each run call
  delete globalThis.__recordStep;
  delete globalThis.__resetStepCounter; // <-- Make sure to delete the reset function too
  delete globalThis.__testName;
  delete globalThis.__suiteStack;
  delete globalThis.__pushSuite;
  delete globalThis.__popSuite;
  delete globalThis.__currentSuite;
  // Delete any other globals your plugin might implicitly create or rely on
});

afterEach(() => {
  cleanTimetravel();
});

describe('debuggerInstrumentation Babel plugin (real FS)', () => {
  it('injects the runtime stub and logs a basic step', () => {
    run('const a = 1;');
    expect(typeof globalThis.__recordStep).toBe('function');
    expect(typeof globalThis.__resetStepCounter).toBe('function');
    const steps = loadAllSteps();
    expect(steps).toHaveLength(1);
    const step = steps[0].data;
    expect(step.vars).toMatchObject({ a: 1 });
    expect(step.line).toBe(1);
    expect(step.stepNumber).toBe(1);
  });

  it('honours maxVars and caps captured vars', () => {
    run('const a=1,b=2,c=3,d=4;', { maxVars: 2 });

    const [step] = loadAllSteps().map(s => s.data);
    expect(Object.keys(step.vars).length).toBeLessThanOrEqual(2);
  });

  it('does not captures arguments on classic function entry', () => {
    run(`
      function foo(x, y) { return x + y; }
      foo(4, 5);
    `);

    expect(loadAllSteps().some(s => 'arguments' in s.data.vars)).toBe(false);
  });

  it('instruments arrow functions with implicit returns', () => {
    run(`
      const add = (m, n) => m + n;
      add(2, 3);
    `);

    const fnStep = loadAllSteps().find(s => 'm' in s.data.vars && 'n' in s.data.vars);
    expect(fnStep?.data.vars).toMatchObject({ m: 2, n: 3 });
  });

  it('wraps single-line if-statements so they still get instrumented', () => {
    run(`
      let x = 0;
      if (x === 0) x = 1;
    `);

    expect(loadAllSteps().length).toBeGreaterThanOrEqual(2);
  });

  it('sanitises funky suite/test names in generated paths', () => {
    run(
      `
        test('weird test name: 1/2', () => { const v = 42; });
      `,
      { suiteName: 'My Suite/Weird:Name.v1' }
    );

    const suiteDir = path.join(process.cwd(), '.timetravel', 'My_Suite_Weird_Name_v1');
    expect(fs.existsSync(suiteDir)).toBe(true);

    const steps = loadAllSteps();
    const hit = steps.find(s => s.data.test === 'weird test name: 1/2');
    expect(hit).toBeTruthy();
  });

  const steps = () => loadAllSteps().map(s => s.data);

  it('increments stepNumber sequentially across many steps', () => {
    run(`
      let sum = 0;
      for (let i = 0; i < 5; i++) sum += i;
    `);

    const nums = steps().map(s => s.stepNumber);
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });

  it('instruments async / await functions correctly', async () => {
    run(`
      async function fetcher() {
        const val = await Promise.resolve(99);
        return val;
      }
      fetcher();
    `);

    await new Promise(r => setTimeout(r, 10));

    const asyncStep = steps().find(s => 'val' in s.vars);
    expect(asyncStep?.vars.val).toBe(99);
  });

  it('captures loop-scoped variables on each iteration', () => {
    run(`
      for (let j = 0; j < 3; j++) {
        const squared = j * j;
      }
    `);

    const loopSteps = steps().filter(s => 'j' in s.vars && 'squared' in s.vars);
    expect(loopSteps).toHaveLength(3);
  });

  it('handles destructuring without TDZ errors', () => {
    run(`const { a, b: renamed } = { a: 7, b: 9 };`);

    const step = steps().find(s => 'a' in s.vars && 'renamed' in s.vars);
    expect(step?.vars).toMatchObject({ a: 7, renamed: 9 });
  });
  
  it('should step through test and implementation', () => {
    run(
      `function add(a, b) {      // Line 1
        const total = a + b;    // Line 2
        return total;           // Line 3
      }                         // Line 4
      function subtract(a, b) {  // Line 5
        const result = a - b;   // Line 6
        return result;          // Line 7
      }                         // Line 8
      describe('Math', () => {    // Line 9
        describe('add', () => {   // Line 10
          it('adds numbers', () => { // Line 11
            const x = add(1, 1); // Line 12 <<< Expect Step 1 (after this line)
            if (x !== 2) {       // Line 13 <<< Expect Step 5 (after this line)
              throw new Error('x is not 2'); // Line 14
            }                     // Line 15
          });                     // Line 16
        });                       // Line 17
        describe('subtract', () => { // Line 18
          it('subtracts numbers', () => { // Line 19
            const y = subtract(5, 3); // Line 20
            if (y !== 2) {            // Line 21
              throw new Error('y is not 2'); // Line 22
            }// Line 23
          });                     
        });                       
      });`,                       // Line 24
      { suiteName: 'RootSuite' }
    );

    // Test the add function steps
    const addDir = path.join(process.cwd(), '.timetravel',  'Math', 'add', 'adds_numbers');
    expect(fs.existsSync(addDir), `Test output dir should exist: ${addDir}`).toBe(true);
    let addFiles = [];
    try { addFiles = fs.readdirSync(addDir).filter(f => f.endsWith('.json')).sort((a, b) => parseInt(a.split('.')[0]) - parseInt(b.split('.')[0])); }
    catch (readDirError) { throw new Error(`Failed to read directory ${addDir}: ${readDirError}`); }

    console.log('Recorded add step files:', addFiles.map(f => [f, fs.readFileSync(path.join(addDir, f), 'utf8')]));

    // --- EXPECTATIONS BASED ON RESET COUNTER AND WORKING Function visitor ---
    expect(addFiles.length).toBe(5);

    // Step 1: Before (const x = add(1, 1);)
    const step1 = JSON.parse(fs.readFileSync(path.join(addDir, addFiles[0]), 'utf8'));
    expect(step1.line).toBe(11);
    expect(step1.stepNumber).toBe(1);
    expect(step1.vars).toMatchObject({});
    
    // Test the subtract function steps
    const subtractDir = path.join(process.cwd(), '.timetravel', 'Math', 'subtract', 'subtracts_numbers');
    expect(fs.existsSync(subtractDir), `Test output dir should exist: ${subtractDir}`).toBe(true);
    let subtractFiles = [];
    try { subtractFiles = fs.readdirSync(subtractDir).filter(f => f.endsWith('.json')).sort((a, b) => parseInt(a.split('.')[0]) - parseInt(b.split('.')[0])); }
    catch (readDirError) { throw new Error(`Failed to read directory ${subtractDir}: ${readDirError}`); }

    console.log('Recorded subtract step files:', subtractFiles.map(f => [f, fs.readFileSync(path.join(subtractDir, f), 'utf8')]));

    // Verify subtract function steps
    expect(subtractFiles.length).toBe(5);
    
    // Step 1: Before (const y = subtract(5, 3);)
    const subtractStep1 = JSON.parse(fs.readFileSync(path.join(subtractDir, subtractFiles[0]), 'utf8'));
    expect(subtractStep1.line).toBe(19);
    expect(subtractStep1.stepNumber).toBe(1);
    expect(subtractStep1.vars).toMatchObject({});
    
    // Step 2: Function entry `subtract` (Line 5)
    const subtractStep2 = JSON.parse(fs.readFileSync(path.join(subtractDir, subtractFiles[1]), 'utf8'));
    expect(subtractStep2.line).toBe(5);
    expect(subtractStep2.stepNumber).toBe(2);
    expect(subtractStep2.vars).toMatchObject({ a: 5, b: 3 });
    expect(subtractStep2.vars.result).toBeUndefined();
    
    // Step 3: AFTER line 6 (const result = a - b;)
    const subtractStep3 = JSON.parse(fs.readFileSync(path.join(subtractDir, subtractFiles[2]), 'utf8'));
    expect(subtractStep3.line).toBe(6);
    expect(subtractStep3.stepNumber).toBe(3);
    expect(subtractStep3.vars).toMatchObject({ a: 5, b: 3, result: 2 });
    
    // Step 4: AFTER line 19 (const y = subtract(5, 3);)
    const subtractStep4 = JSON.parse(fs.readFileSync(path.join(subtractDir, subtractFiles[3]), 'utf8'));
    expect(subtractStep4.line).toBe(20);
    expect(subtractStep4.stepNumber).toBe(4);
    expect(subtractStep4.vars).toMatchObject({ y: 2 });
    
    // Step 5: AFTER line 20 (if (y !== 2))
    const subtractStep5 = JSON.parse(fs.readFileSync(path.join(subtractDir, subtractFiles[4]), 'utf8'));
    expect(subtractStep5.line).toBe(21);
    expect(subtractStep5.stepNumber).toBe(5);
    expect(subtractStep5.vars).toMatchObject({ y: 2 });

    // Step 2: Function entry `add` (Line 1)
    const step2 = JSON.parse(fs.readFileSync(path.join(addDir, addFiles[1]), 'utf8'));
    expect(step2.line).toBe(1);
    expect(step2.stepNumber).toBe(2);
    expect(step2.vars).toMatchObject({ a: 1, b: 1 });
    expect(step2.vars.total).toBeUndefined();

    // Step 3: AFTER line 2 (const total = a + b;)
    const step3 = JSON.parse(fs.readFileSync(path.join(addDir, addFiles[2]), 'utf8'));
    expect(step3.line).toBe(2);
    expect(step3.stepNumber).toBe(3);
    expect(step3.vars).toMatchObject({ a: 1, b: 1, total: 2 });


    // Step 5: AFTER line 9 (if (x !== 2))
    const step5 = JSON.parse(fs.readFileSync(path.join(addDir, addFiles[3]), 'utf8'));
    expect(step5.line).toBe(8);
    expect(step5.stepNumber).toBe(4);
    expect(step5.vars).toMatchObject({ x: 2 });

    // Step 6: After (throw new Error('x is not 2');)
    const step6 = JSON.parse(fs.readFileSync(path.join(addDir, addFiles[4]), 'utf8'));
    expect(step6.line).toBe(9);
    expect(step6.stepNumber).toBe(5);
    expect(step6.vars).toMatchObject({ x: 2 });

});
});