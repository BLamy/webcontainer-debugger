// Full-app integration test: renders WebContainerDebugger against a mocked
// WebContainer (in-memory fs + spawn), exercising the post-boot flow the
// real container would drive: run tests → collect .timetravel → select a
// test → step through it.
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import WebContainerDebugger from './WebContainerDebugger';
import { WebContainerContext } from './WebContainerProvider';

afterEach(cleanup);

type Tree = { [path: string]: string };

/** Minimal WebContainer stand-in backed by a flat path→contents map. */
function mockWebContainer(tree: Tree) {
  const dirSet = new Set<string>();
  for (const p of Object.keys(tree)) {
    const parts = p.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      dirSet.add('/' + parts.slice(0, i).join('/'));
    }
  }
  return {
    spawn: vi.fn(async () => ({ exit: Promise.resolve(0) })),
    fs: {
      writeFile: vi.fn(async () => {}),
      readFile: vi.fn(async (path: string) => {
        if (!(path in tree)) throw new Error('ENOENT: ' + path);
        return tree[path];
      }),
      readdir: vi.fn(async (path: string) => {
        const norm = path.replace(/\/+$/, '') || '/';
        if (!dirSet.has(norm) && norm !== '/') throw new Error('ENOENT: ' + norm);
        const children = new Map<string, boolean>();
        for (const p of Object.keys(tree)) {
          if (!p.startsWith(norm + '/')) continue;
          const rest = p.slice(norm.length + 1);
          const head = rest.split('/')[0];
          children.set(head, rest.includes('/'));
        }
        for (const d of dirSet) {
          if (!d.startsWith(norm + '/')) continue;
          const rest = d.slice(norm.length + 1);
          const head = rest.split('/')[0];
          if (!children.has(head)) children.set(head, true);
        }
        return [...children.entries()].map(([name, isDir]) => ({
          name,
          isDirectory: () => isDir,
        }));
      }),
    },
  };
}

const step = (n: number, line: number, vars: object, file = '/home/projects/utils.js') =>
  JSON.stringify({
    stepNumber: n,
    file,
    line,
    vars,
    suite: 'Time_Travel_Utilities/calculateDeloreanSpeed',
    test: 'correctly adds acceleration',
  });

function renderApp(tree: Tree) {
  const wc = mockWebContainer(tree);
  const utils = render(
    <WebContainerContext.Provider
      value={{ webContainer: wc as any, status: 'ready' }}
    >
      <WebContainerDebugger />
    </WebContainerContext.Provider>
  );
  return { wc, ...utils };
}

describe('WebContainerDebugger app integration (mocked container)', () => {
  it('runs tests, collects debug data, and steps through a test', async () => {
    const tree: Tree = {
      '/.timetravel/Time_Travel_Utilities/calculateDeloreanSpeed/correctly_adds/1.json':
        step(1, 1, {}),
      '/.timetravel/Time_Travel_Utilities/calculateDeloreanSpeed/correctly_adds/2.json':
        step(2, 2, { deloreanSpeed: 45 }),
    };
    const { wc } = renderApp(tree);

    // npm test spawned in the container
    await waitFor(() => expect(wc.spawn).toHaveBeenCalledWith('npm', ['test']));

    // suite + test appear
    await waitFor(() =>
      expect(screen.getByText('correctly adds acceleration')).toBeTruthy()
    );
    expect(screen.getByText(/Time_Travel_Utilities/)).toBeTruthy();
    expect(screen.getByText('2 steps')).toBeTruthy();
    expect(screen.getByText('Tests finished')).toBeTruthy();
    // stats count the tests
    expect(screen.getByText(/TESTS:/).textContent).toContain('1/1');

    // select the test and step
    fireEvent.click(screen.getByText('correctly adds acceleration'));
    await waitFor(() => expect(screen.getByText('Step 1/2')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('Next step'));
    await waitFor(() => expect(screen.getByText('Step 2/2')).toBeTruthy());
    // vars for step 2 rendered (scoped: the editor source also contains
    // the same identifier)
    const varsPanel = document.querySelector('.variables-panel') as HTMLElement;
    expect(within(varsPanel).getByText('deloreanSpeed')).toBeTruthy();
    expect(within(varsPanel).getByText('45')).toBeTruthy();
  });

  it('shows empty state when the container produced no debug data', async () => {
    const { wc } = renderApp({});
    await waitFor(() => expect(wc.spawn).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Tests finished')).toBeTruthy());
    expect(screen.getByText('No tests with debug data.')).toBeTruthy();
    expect(screen.getByText(/TESTS:/).textContent).toContain('0/0');
  });

  it('reports a failed test run instead of pretending success', async () => {
    const wc = mockWebContainer({});
    wc.spawn.mockRejectedValueOnce(new Error('spawn failed'));
    render(
      <WebContainerContext.Provider
        value={{ webContainer: wc as any, status: 'ready' }}
      >
        <WebContainerDebugger />
      </WebContainerContext.Provider>
    );
    await waitFor(() => expect(screen.getByText('Test run failed')).toBeTruthy());
  });

  it('steps in helper files switch the editor tab', async () => {
    const tree: Tree = {
      '/.timetravel/S/t/1.json': step(1, 12, { x: 1 }, '/home/projects/utils.test.js'),
      '/.timetravel/S/t/2.json': step(2, 2, { y: 2 }, '/home/projects/utils.js'),
    };
    renderApp(tree);
    await waitFor(() =>
      expect(screen.getByText('correctly adds acceleration')).toBeTruthy()
    );
    fireEvent.click(screen.getByText('correctly adds acceleration'));
    await waitFor(() => expect(screen.getByText('Step 1/2')).toBeTruthy());

    // step 1 is in utils.test.js → that tab becomes active
    const testTab = screen.getByRole('button', { name: 'utils.test.js' });
    await waitFor(() => expect(testTab.className).toContain('bg-[#1e1e1e]'));

    fireEvent.click(screen.getByLabelText('Next step'));
    const utilsTab = screen.getByRole('button', { name: 'utils.js' });
    await waitFor(() => expect(utilsTab.className).toContain('bg-[#1e1e1e]'));
  });
});
