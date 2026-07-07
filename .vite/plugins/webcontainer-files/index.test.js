// Tests for the webcontainer-files Vite plugin (virtual module generation).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import webcontainerFilesPlugin from './index.js';

const VIRTUAL_ID = 'virtual:webcontainer-files';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcf-plugin-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function loadFiles(plugin) {
  const code = plugin.load(RESOLVED_ID);
  // evaluate the generated ES module source
  return new Function(`${code.replace(/^export\s+/, '')}; return files;`)();
}

describe('webcontainer-files vite plugin', () => {
  it('resolves only its virtual module id', () => {
    const plugin = webcontainerFilesPlugin({ directory: tmpDir });
    expect(plugin.resolveId(VIRTUAL_ID)).toBe(RESOLVED_ID);
    expect(plugin.resolveId('virtual:other')).toBeUndefined();
    expect(plugin.load('some-other-id')).toBeUndefined();
  });

  it('returns an empty tree for an empty directory', () => {
    const plugin = webcontainerFilesPlugin({ directory: tmpDir });
    expect(loadFiles(plugin)).toEqual({});
  });

  it('returns an empty tree for a missing directory', () => {
    const plugin = webcontainerFilesPlugin({
      directory: path.join(tmpDir, 'does-not-exist'),
    });
    expect(loadFiles(plugin)).toEqual({});
  });

  it('builds nested directory/file structure', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.js'), 'const a = 1;');
    fs.mkdirSync(path.join(tmpDir, 'sub', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'sub', 'b.js'), 'const b = 2;');
    fs.writeFileSync(path.join(tmpDir, 'sub', 'deep', 'c.txt'), 'hello');

    const files = loadFiles(webcontainerFilesPlugin({ directory: tmpDir }));
    expect(files['a.js'].file.contents).toBe('const a = 1;');
    expect(files.sub.directory['b.js'].file.contents).toBe('const b = 2;');
    expect(files.sub.directory.deep.directory['c.txt'].file.contents).toBe('hello');
  });

  it('safely encodes hostile file contents', () => {
    const hostile = [
      'const s = `back\\`tick ${injection}`;',
      'const t = "</script><script>alert(1)</script>";',
      "const u = 'null byte: \\u0000 and unicode: \\u2028\\u2029 😀';",
      'export const files = {}; // attempt to shadow',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, 'hostile.js'), hostile);

    const files = loadFiles(webcontainerFilesPlugin({ directory: tmpDir }));
    expect(files['hostile.js'].file.contents).toBe(hostile);
  });

  it('includes dotfiles and dot-directories', () => {
    fs.mkdirSync(path.join(tmpDir, '.babel'));
    fs.writeFileSync(path.join(tmpDir, '.babel', 'plugin.js'), 'x');
    fs.writeFileSync(path.join(tmpDir, '.npmrc'), 'registry=https://example.com');

    const files = loadFiles(webcontainerFilesPlugin({ directory: tmpDir }));
    expect(files['.babel'].directory['plugin.js'].file.contents).toBe('x');
    expect(files['.npmrc'].file.contents).toContain('registry=');
  });

  it('supports a custom virtual module id', () => {
    const plugin = webcontainerFilesPlugin({
      directory: tmpDir,
      moduleId: 'virtual:custom-files',
    });
    expect(plugin.resolveId('virtual:custom-files')).toBe('\0virtual:custom-files');
    expect(plugin.resolveId(VIRTUAL_ID)).toBeUndefined();
  });
});
