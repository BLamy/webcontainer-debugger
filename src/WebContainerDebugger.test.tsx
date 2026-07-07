// Component tests for the debugger UI pieces.
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// vitest globals are disabled, so RTL's automatic cleanup doesn't hook in.
afterEach(cleanup);
import {
  DebuggerPanel,
  TestList,
  formatVal,
  getFileContents,
  resolveEditorFile,
} from './WebContainerDebugger';
import type { DebugStep, TestSuiteData } from './collectDebugData';

const mkSteps = (n: number, file = '/home/project/utils.js'): DebugStep[] =>
  Array.from({ length: n }, (_, i) => ({
    stepNumber: i + 1,
    file,
    line: i + 1,
    vars: { i },
  }));

describe('DebuggerPanel', () => {
  it('renders step counter and navigates', () => {
    const onStepSelect = vi.fn();
    render(<DebuggerPanel steps={mkSteps(3)} onStepSelect={onStepSelect} />);
    expect(screen.getByText('Step 1/3')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(screen.getByText('Step 2/3')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Last step'));
    expect(screen.getByText('Step 3/3')).toBeTruthy();
    // next at the end must not overflow
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(screen.getByText('Step 3/3')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Previous step'));
    expect(screen.getByText('Step 2/3')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('First step'));
    expect(screen.getByText('Step 1/3')).toBeTruthy();
    expect(onStepSelect).toHaveBeenCalled();
  });

  it('resets to step 1 when a different test is selected', () => {
    const onStepSelect = vi.fn();
    const { rerender } = render(
      <DebuggerPanel steps={mkSteps(5)} onStepSelect={onStepSelect} />
    );
    fireEvent.click(screen.getByLabelText('Last step'));
    expect(screen.getByText('Step 5/5')).toBeTruthy();

    // switching to a shorter test previously left idx=4 → "Step 5/2" and
    // an undefined step
    rerender(<DebuggerPanel steps={mkSteps(2)} onStepSelect={onStepSelect} />);
    expect(screen.getByText('Step 1/2')).toBeTruthy();
    const lastSelected = onStepSelect.mock.calls.at(-1)![0];
    expect(lastSelected).toBeTruthy();
    expect(lastSelected.stepNumber).toBe(1);
  });

  it('handles an empty steps array without crashing', () => {
    const onStepSelect = vi.fn();
    render(<DebuggerPanel steps={[]} onStepSelect={onStepSelect} />);
    expect(screen.getByText('No steps')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Next step'));
    fireEvent.click(screen.getByLabelText('Last step'));
    expect(onStepSelect).not.toHaveBeenCalled();
  });

  it('marks changed variables between steps', () => {
    const steps: DebugStep[] = [
      { stepNumber: 1, file: 'f', line: 1, vars: { a: 1, b: 'x' } },
      { stepNumber: 2, file: 'f', line: 2, vars: { a: 2, b: 'x' } },
    ];
    const { container } = render(
      <DebuggerPanel steps={steps} onStepSelect={() => {}} />
    );
    fireEvent.click(screen.getByLabelText('Next step'));
    const changed = container.querySelectorAll('.variable.changed');
    expect(changed).toHaveLength(1);
    expect(changed[0].textContent).toContain('a');
  });
});

describe('TestList', () => {
  const suites: TestSuiteData = {
    'Suite/Sub': {
      'first test': mkSteps(4),
      'second test': mkSteps(2),
    },
    Other: { solo: mkSteps(1) },
  };

  it('renders suites with their tests and step counts', () => {
    render(<TestList suites={suites} onSelect={() => {}} />);
    expect(screen.getByText('Suite › Sub')).toBeTruthy();
    expect(screen.getByText('first test')).toBeTruthy();
    expect(screen.getByText('4 steps')).toBeTruthy();
    expect(screen.getByText('solo')).toBeTruthy();
  });

  it('passes the actual steps array (not suite objects) to onSelect', () => {
    const onSelect = vi.fn();
    render(<TestList suites={suites} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('first test'));
    const arg = onSelect.mock.calls[0][0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg).toHaveLength(4);
    // each element must be a step (has file/line), not a nested array
    expect(typeof arg[0].file).toBe('string');
    expect(typeof arg[0].line).toBe('number');
  });

  it('shows an empty state without data', () => {
    render(<TestList suites={{}} onSelect={() => {}} />);
    expect(screen.getByText('No tests with debug data.')).toBeTruthy();
  });
});

describe('formatVal', () => {
  const text = (node: React.ReactElement) => {
    const { container } = render(node);
    return container.textContent;
  };

  it('formats primitives', () => {
    expect(text(formatVal(undefined))).toBe('undefined');
    expect(text(formatVal(null))).toBe('null');
    expect(text(formatVal(true))).toBe('true');
    expect(text(formatVal(42))).toBe('42');
    expect(text(formatVal('hi'))).toBe('"hi"');
    expect(text(formatVal({ a: 1 }))).toBe('{"a":1}');
  });

  it('does not crash on circular objects', () => {
    const c: any = {};
    c.self = c;
    expect(text(formatVal(c))).toBe('[Unserializable]');
  });

  it('does not crash on NaN/Infinity/BigInt', () => {
    expect(text(formatVal(NaN))).toBe('NaN');
    expect(text(formatVal(Infinity))).toBe('Infinity');
    expect(() => text(formatVal(BigInt(9)))).not.toThrow();
  });
});

describe('getFileContents', () => {
  const tree = {
    'utils.js': { file: { contents: 'const a = 1;' } },
    sub: {
      directory: {
        'inner.js': { file: { contents: 'inner' } },
      },
    },
  };

  it('reads top-level and nested files', () => {
    expect(getFileContents(tree, 'utils.js')).toBe('const a = 1;');
    expect(getFileContents(tree, 'sub/inner.js')).toBe('inner');
  });

  it('returns empty string for missing paths instead of throwing', () => {
    expect(getFileContents(tree, 'nope.js')).toBe('');
    expect(getFileContents(tree, 'sub/nope.js')).toBe('');
    expect(getFileContents(tree, 'utils.js/extra')).toBe('const a = 1;');
    expect(getFileContents(tree, '')).toBe('');
    expect(getFileContents(tree, '/')).toBe('');
  });
});

describe('resolveEditorFile', () => {
  const available = ['utils.js', 'utils.test.js'];

  it('maps absolute container paths to editor files', () => {
    expect(resolveEditorFile('/home/projects/utils.js', available)).toBe('utils.js');
    expect(resolveEditorFile('/home/projects/utils.test.js', available)).toBe(
      'utils.test.js'
    );
    expect(resolveEditorFile('utils.js', available)).toBe('utils.js');
  });

  it('prefers the longest (most specific) match', () => {
    // "…/utils.test.js" ends with both names' suffixes; must pick utils.test.js
    expect(resolveEditorFile('/x/utils.test.js', available)).toBe('utils.test.js');
  });

  it('does not match partial basenames', () => {
    expect(resolveEditorFile('/x/myutils.js', available)).toBeNull();
  });

  it('returns null for unknown or empty files', () => {
    expect(resolveEditorFile('/x/vitest.config.js', available)).toBeNull();
    expect(resolveEditorFile('', available)).toBeNull();
  });
});
