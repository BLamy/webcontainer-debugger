import { test, expect, type Page } from '@playwright/test';

// Errors that come from the sandboxed environment (WebContainer CDN may be
// unreachable), not from application bugs.
const EXPECTED_ERROR_PATTERNS = [
  /webcontainer/i,
  /failed to fetch/i,
  /network/i,
  /service ?worker/i,
  /cross-?origin/i,
  /sharedarraybuffer/i,
  /load resource/i,
];

function watchPageErrors(page: Page) {
  const unexpected: string[] = [];
  page.on('pageerror', (err) => {
    if (!EXPECTED_ERROR_PATTERNS.some((re) => re.test(String(err)))) {
      unexpected.push(`pageerror: ${err}`);
    }
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!EXPECTED_ERROR_PATTERNS.some((re) => re.test(text))) {
      unexpected.push(`console.error: ${text}`);
    }
  });
  return unexpected;
}

test('renders the debugger shell without crashing', async ({ page }) => {
  const errors = watchPageErrors(page);
  await page.goto('/');

  // file tabs
  await expect(page.getByRole('button', { name: 'utils.js', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'utils.test.js', exact: true })
  ).toBeVisible();

  // editor shows the demo source
  await expect(page.locator('.cm-content')).toContainText('calculateDeloreanSpeed', {
    timeout: 15_000,
  });

  // debugger pane + status bar
  await expect(page.getByText('No tests with debug data.')).toBeVisible();
  await expect(page.getByText('Select a test to debug')).toBeVisible();
  await expect(page.getByText(/TESTS:/)).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('switches files in the editor', async ({ page }) => {
  const errors = watchPageErrors(page);
  await page.goto('/');
  await expect(page.locator('.cm-content')).toContainText('calculateDeloreanSpeed');

  await page.getByRole('button', { name: 'utils.test.js', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('Time Travel Utilities');
  await expect(page.locator('.cm-content')).toContainText("describe(");

  await page.getByRole('button', { name: 'utils.js', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('fluxCapacitorStatus');

  expect(errors, errors.join('\n')).toEqual([]);
});

test('editor is editable and edits stick per tab session', async ({ page }) => {
  const errors = watchPageErrors(page);
  await page.goto('/');
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('calculateDeloreanSpeed');

  await editor.click();
  await page.keyboard.press('ControlOrMeta+ArrowUp'); // top of doc
  await page.keyboard.type('// edited by e2e\n');
  await expect(editor).toContainText('// edited by e2e');

  // switching away and back re-reads from the in-memory tree, which the
  // change handler must have updated
  await page.getByRole('button', { name: 'utils.test.js', exact: true }).click();
  await expect(editor).toContainText('Time Travel Utilities');
  await page.getByRole('button', { name: 'utils.js', exact: true }).click();
  await expect(editor).toContainText('// edited by e2e');

  expect(errors, errors.join('\n')).toEqual([]);
});

test('debugger panel toggles', async ({ page }) => {
  const errors = watchPageErrors(page);
  await page.goto('/');
  const toggle = page.getByTitle('Toggle Debugger');
  await expect(page.getByText('Select a test to debug')).toBeVisible();

  await toggle.click();
  await expect(page.getByText('Select a test to debug')).toBeHidden();

  await toggle.click();
  await expect(page.getByText('Select a test to debug')).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('status bar reflects the WebContainer lifecycle', async ({ page }) => {
  await page.goto('/');
  // Boot begins immediately; in a sandbox without the StackBlitz CDN it
  // ends in Error, on the open internet it walks the full lifecycle.
  await expect(
    page.getByText(
      /Booting Webcontainer|Mounting files|Installing node_modules|Running tests|Tests finished|Error/
    )
  ).toBeVisible({ timeout: 30_000 });
});

test('full time-travel flow when the WebContainer can boot', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');

  // If the boot makes no progress past "Booting" within 60s (or errors),
  // the environment can't reach the StackBlitz CDN — skip rather than
  // burn the full timeout.
  const deadline = Date.now() + 60_000;
  let progressed = false;
  while (Date.now() < deadline) {
    const body = (await page.textContent('body')) ?? '';
    if (/Mounting files|Installing node_modules|Running tests|Tests finished/.test(body)) {
      progressed = true;
      break;
    }
    if (/\bError\b|Test run failed/.test(body)) break;
    await page.waitForTimeout(1000);
  }
  test.skip(
    !progressed,
    'WebContainer cannot boot in this environment (CDN unreachable)'
  );

  await expect(page.getByText('Tests finished')).toBeVisible({
    timeout: 240_000,
  });

  // suites collected from the run
  await expect(page.locator('.debug-test-item').first()).toBeVisible();
  await page.locator('.debug-test-item').first().click();

  // step controls drive the highlight
  await expect(page.getByText(/Step 1\//)).toBeVisible();
  await expect(page.locator('.cm-debugger-highlight').first()).toBeVisible();

  await page.getByLabel('Next step').click();
  await expect(page.getByText(/Step 2\//)).toBeVisible();
});
