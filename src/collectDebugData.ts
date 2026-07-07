// Reads the .timetravel tree produced by the debugger-instrumentation
// Babel plugin and turns it into UI-consumable data.
//
// On-disk shape (written by the plugin's runtime stub):
//   .timetravel/<suite>/<...nested suites>/<test>/<stepNumber>.json
// A "test" is a leaf directory containing <N>.json step files.

export interface DebugStep {
  stepNumber: number;
  file: string;
  line: number;
  vars?: Record<string, unknown>;
  suite?: string;
  test?: string;
}

export interface TestSuiteData {
  [suitePath: string]: {
    [testName: string]: DebugStep[];
  };
}

export interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

/** Minimal fs surface shared by WebContainer's fs and an adapter over node:fs. */
export interface FsLike {
  readdir(
    path: string,
    options: { withFileTypes: true }
  ): Promise<DirEntry[]>;
  readFile(path: string, encoding: "utf-8"): Promise<string>;
}

const SKIPPED_SUITES = new Set(["DefaultSuite", "UnknownTest"]);

async function collectTest(
  fs: FsLike,
  dirPath: string,
  entries: DirEntry[]
): Promise<DebugStep[]> {
  const steps: DebugStep[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() || !entry.name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(`${dirPath}/${entry.name}`, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.line === "number") steps.push(parsed);
    } catch {
      // A single corrupt step file must not hide the rest of the test.
    }
  }
  steps.sort((a, b) => (a.stepNumber ?? 0) - (b.stepNumber ?? 0));
  return steps;
}

async function walk(
  fs: FsLike,
  dirPath: string,
  suitePath: string,
  collected: TestSuiteData
): Promise<void> {
  let entries: DirEntry[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  const subDirs = entries.filter((e) => e.isDirectory());
  const jsonFiles = entries.filter(
    (e) => !e.isDirectory() && e.name.endsWith(".json")
  );

  // A leaf directory containing step files is a test.
  if (jsonFiles.length > 0 && suitePath) {
    const lastSlash = suitePath.lastIndexOf("/");
    const suite = lastSlash === -1 ? "" : suitePath.slice(0, lastSlash);
    const testName = lastSlash === -1 ? suitePath : suitePath.slice(lastSlash + 1);
    const steps = await collectTest(fs, dirPath, entries);
    if (steps.length > 0) {
      const suiteKey = steps[0].suite || suite || "(top level)";
      // Prefer the human-readable test title recorded in the step data
      // over the sanitized directory name.
      const displayName = steps[0].test || testName;
      (collected[suiteKey] ??= {})[displayName] = steps;
    }
  }

  for (const dir of subDirs) {
    const nextSuite = suitePath ? `${suitePath}/${dir.name}` : dir.name;
    // Skip noise buckets produced for steps recorded outside any test.
    if (!suitePath && SKIPPED_SUITES.has(dir.name)) continue;
    await walk(fs, `${dirPath}/${dir.name}`, nextSuite, collected);
  }
}

/** Collect all suites/tests/steps under `root` (default "/.timetravel"). */
export async function collectDebugData(
  fs: FsLike,
  root = "/.timetravel"
): Promise<TestSuiteData> {
  const collected: TestSuiteData = {};
  await walk(fs, root, "", collected);
  return collected;
}

/** Total number of tests across all suites. */
export function countTests(data: TestSuiteData): number {
  return Object.values(data).reduce(
    (n, tests) => n + Object.keys(tests).length,
    0
  );
}
