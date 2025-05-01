import { describe, it, expect } from 'vitest';
import { transformSync } from '@babel/core';
import expectSoft from './index.js';

// Helper function to transform code with the plugin
function transform(source) {
  const { code } = transformSync(source, {
    plugins: [expectSoft],
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'script' }
  });
  return code;
}

describe('babel-plugin-vitest-soft-expect', () => {
  it('transforms expect() to expect.soft()', () => {
    const source = 'expect(value).toBe(42);';
    const result = transform(source);
    expect(result).toContain('expect.soft(value)');
    expect(result).not.toContain('expect(value)');
  });

  it('preserves expect() when a "hard" comment is present', () => {
    const source = '// hard\nexpect(value).toBe(42);';
    const result = transform(source);
    expect(result).toContain('expect(value)');
    expect(result).not.toContain('expect.soft(value)');
  });

  it('handles multiple expect calls in the same file', () => {
    const source = `
      expect(a).toBe(1);
      // hard
      expect(b).toBe(2);
      expect(c).toBe(3);
    `;
    const result = transform(source);
    expect(result).toContain('expect.soft(a)');
    expect(result).toContain('expect(b)');
    expect(result).toContain('expect.soft(c)');
  });

  it('does not transform member expressions like expect.anything()', () => {
    const source = 'expect.anything();';
    const result = transform(source);
    expect(result).toBe('expect.anything();');
  });

  it('does not transform calls to functions named differently', () => {
    const source = 'notExpect(value);';
    const result = transform(source);
    expect(result).toBe('notExpect(value);');
  });

  it('handles nested expect calls properly', () => {
    const source = 'expect(expect(value).toBe(true)).not.toThrow();';
    const result = transform(source);
    // Outer expect should be transformed
    expect(result).toMatch(/expect\.soft\(.*\)\.not\.toThrow\(\);/);
    // Inner expect should also be transformed
    expect(result).toMatch(/expect\.soft\(value\)\.toBe\(true\)/);
  });

  it('transforms expect in arrow functions', () => {
    const source = '() => { expect(value).toBe(true); }';
    const result = transform(source);
    expect(result).toContain('expect.soft(value)');
  });
  
  it('transforms expect in function declarations', () => {
    const source = 'function test() { expect(value).toBe(true); }';
    const result = transform(source);
    expect(result).toContain('expect.soft(value)');
  });
}); 