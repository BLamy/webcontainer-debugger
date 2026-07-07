// Adversarial tests for the expect → expect.soft transform.
import { describe, it, expect } from 'vitest';
import { transformSync } from '@babel/core';
import expectSoft from './index.js';

function transform(source, parserOpts = {}) {
  const { code } = transformSync(source, {
    plugins: [expectSoft],
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'script', ...parserOpts },
  });
  return code;
}

describe('expect-soft adversarial', () => {
  it('honours a block /* hard */ comment', () => {
    const result = transform('/* hard */\nexpect(value).toBe(42);');
    expect(result).toContain('expect(value)');
    expect(result).not.toContain('expect.soft');
  });

  it('ignores comments that merely contain the word hard', () => {
    const result = transform('// this test is hard\nexpect(value).toBe(42);');
    expect(result).toContain('expect.soft(value)');
  });

  it('leaves an already-soft call unchanged (idempotent)', () => {
    const source = 'expect.soft(value).toBe(42);';
    expect(transform(source)).toBe(source);
    // double-transform must also be stable
    expect(transform(transform('expect(v).toBe(1);'))).toBe(
      transform('expect(v).toBe(1);')
    );
  });

  it('does not rewrite optional-call expect?.()', () => {
    const source = 'expect?.(value);';
    expect(() => transform(source)).not.toThrow();
    expect(transform(source)).not.toContain('soft');
  });

  it('does not rewrite a bare expect reference passed as a value', () => {
    const source = 'const e = expect; run(expect);';
    expect(transform(source)).not.toContain('soft');
  });

  it('transforms expect inside async/await statements', () => {
    const result = transform(
      'async function t() { await expect(promise).resolves.toBe(1); }'
    );
    expect(result).toContain('expect.soft(promise)');
  });

  it('hard escape applies to the whole statement, including chained calls', () => {
    const result = transform(
      ['// hard', 'expect(a).toBe(1);', 'expect(b).toBe(2);'].join('\n')
    );
    expect(result).toContain('expect(a)');
    expect(result).toContain('expect.soft(b)');
  });

  it('handles expect calls in return positions and arrow bodies', () => {
    const result = transform('const f = () => expect(v).toBe(1);');
    expect(result).toContain('expect.soft(v)');
  });

  it('handles a variable declaration statement with hard comment', () => {
    const result = transform('// hard\nconst assertion = expect(v).toBe(1);');
    expect(result).toContain('expect(v)');
    expect(result).not.toContain('expect.soft');
  });

  it('survives module syntax with imports', () => {
    const result = transform(
      "import { expect } from 'vitest';\nexpect(1).toBe(1);",
      { sourceType: 'module' }
    );
    expect(result).toContain('expect.soft(1)');
  });
});
