import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import webcontainerFilesPlugin from './index';

// Create a temp test directory to simulate webcontainer-files
const tempDir = join(process.cwd(), 'test-webcontainer-files');
const originalCwd = process.cwd();

// Mock files structure for testing
const mockFiles = {
  'package.json': '{"name": "test-package", "version": "1.0.0"}',
  'README.md': '# Test README',
  'nested/file.js': 'console.log("Hello from nested file");',
  'nested/deeper/test.txt': 'This is a test file in a deeper directory'
};

// Helper to create mock file structure
function createMockFileStructure() {
  // Create root directory
  const filesDir = join(tempDir, 'webcontainer-files'); // Target subdirectory
  if (!existsSync(filesDir)) {
    mkdirSync(filesDir, { recursive: true }); // Create subdirectory too
  }
  
  // Create nested directories and files within the subdirectory
  Object.entries(mockFiles).forEach(([path, content]) => {
    const fullPath = join(filesDir, path); // Use filesDir as base
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
    
    // Check dirPath against filesDir, not tempDir
    if (dirPath !== filesDir && !existsSync(dirPath)) { 
      mkdirSync(dirPath, { recursive: true });
    }
    
    writeFileSync(fullPath, content);
  });
}

// Clean up helper
function cleanupMockFileStructure() {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('webcontainer-files plugin', () => {
  let plugin: ReturnType<typeof webcontainerFilesPlugin>;
  let consoleSpy: any;
  
  beforeEach(() => {
    // Spy on console messages
    consoleSpy = vi.spyOn(console, 'log');
    consoleSpy.mockImplementation(() => {});
    
    // Spy on console errors
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Create mock file structure
    createMockFileStructure();
    
    // Set up the plugin
    plugin = webcontainerFilesPlugin();
    
    // Mock process.cwd() to return our test directory
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
  });
  
  afterEach(() => {
    // Clean up mocks
    vi.restoreAllMocks();
    
    // Clean up file structure
    cleanupMockFileStructure();
  });
  
  it('should have the correct name', () => {
    expect(plugin.name).toBe('webcontainer-files');
  });
  
  it('should resolve virtual module ID', () => {
    const resolvedId = plugin.resolveId?.('virtual:webcontainer-files');
    expect(resolvedId).toBe('\0virtual:webcontainer-files');
    
    const otherResolvedId = plugin.resolveId?.('other-module');
    expect(otherResolvedId).toBeUndefined();
  });
  
  it('should load files from webcontainer directory', () => {
    // Call the load method with the virtual module ID
    const result = plugin.load?.('\0virtual:webcontainer-files');
    
    // Check that result is a string
    expect(typeof result).toBe('string');
    
    // Check that it exports 'files'
    expect(result).toContain('export const files =');
    
    // Parse the output to check structure
    const startIndex = (result as string).indexOf('{');
    const endIndex = (result as string).lastIndexOf('}') + 1;
    const filesObject = JSON.parse((result as string).substring(startIndex, endIndex));
    
    // Verify structure matches our mock files
    expect(filesObject).toHaveProperty('package.json');
    expect(filesObject['package.json']).toHaveProperty('file.contents');
    expect(filesObject['package.json'].file.contents).toBe('{"name": "test-package", "version": "1.0.0"}');
    
    expect(filesObject).toHaveProperty('README.md');
    expect(filesObject['README.md']).toHaveProperty('file.contents');
    expect(filesObject['README.md'].file.contents).toBe('# Test README');
    
    expect(filesObject).toHaveProperty('nested.directory');
    expect(filesObject.nested.directory).toHaveProperty('file.js');
    expect(filesObject.nested.directory['file.js']).toHaveProperty('file.contents');
    expect(filesObject.nested.directory['file.js'].file.contents).toBe('console.log("Hello from nested file");');
    
    expect(filesObject.nested.directory).toHaveProperty('deeper.directory');
    expect(filesObject.nested.directory.deeper.directory).toHaveProperty('test.txt');
    expect(filesObject.nested.directory.deeper.directory['test.txt']).toHaveProperty('file.contents');
    expect(filesObject.nested.directory.deeper.directory['test.txt'].file.contents).toBe('This is a test file in a deeper directory');
  });
  
  it('should handle non-existent directory gracefully', () => {
    // Clean up before test to ensure directory doesn't exist
    cleanupMockFileStructure();
    
    // Call the load method
    const result = plugin.load?.('\0virtual:webcontainer-files');
    
    // Should export empty object
    expect(result).toBe('export const files = {};');
    
    // Should log error
    expect(console.error).toHaveBeenCalled();
  });
  
  it('should add watcher in dev mode', () => {
    const mockServer = {
      watcher: {
        add: vi.fn(),
        on: vi.fn()
      },
      moduleGraph: {
        getModuleById: vi.fn(),
        invalidateModule: vi.fn()
      },
      ws: { send: vi.fn() }
    };

    // Call configureServer
    plugin.configureServer?.(mockServer as any);

    // Check that watcher.add was called with the webcontainer directory
    expect(mockServer.watcher.add).toHaveBeenCalledWith(expect.stringContaining('webcontainer-files'));
    // Watches for file changes to invalidate the virtual module
    expect(mockServer.watcher.on).toHaveBeenCalledWith('add', expect.any(Function));
    expect(mockServer.watcher.on).toHaveBeenCalledWith('change', expect.any(Function));
    expect(mockServer.watcher.on).toHaveBeenCalledWith('unlink', expect.any(Function));
  });

  it('invalidates the virtual module when a watched file changes', () => {
    const fakeModule = { id: '\0virtual:webcontainer-files' };
    const handlers: Record<string, (file: string) => void> = {};
    const mockServer = {
      watcher: {
        add: vi.fn(),
        on: vi.fn((event: string, cb: (file: string) => void) => {
          handlers[event] = cb;
        })
      },
      moduleGraph: {
        getModuleById: vi.fn().mockReturnValue(fakeModule),
        invalidateModule: vi.fn()
      },
      ws: { send: vi.fn() }
    };

    plugin.configureServer?.(mockServer as any);

    // change inside the watched dir → invalidate + reload
    handlers.change(join(tempDir, 'webcontainer-files', 'utils.js'));
    expect(mockServer.moduleGraph.invalidateModule).toHaveBeenCalledWith(fakeModule);
    expect(mockServer.ws.send).toHaveBeenCalledWith({ type: 'full-reload' });

    // change outside the watched dir → ignored
    mockServer.moduleGraph.invalidateModule.mockClear();
    handlers.change(join(tempDir, 'elsewhere', 'other.js'));
    expect(mockServer.moduleGraph.invalidateModule).not.toHaveBeenCalled();
  });
  
  // New test for custom directory option
  it('should load files from custom directory specified in options', () => {
    const customDirName = 'custom-mock-files';
    const customDirPath = join(tempDir, customDirName);
    const customFilePath = join(customDirPath, 'custom.txt');
    const customFileContent = 'Hello from custom directory';

    // Create custom directory and file
    mkdirSync(customDirPath, { recursive: true });
    writeFileSync(customFilePath, customFileContent);

    // Instantiate plugin with custom directory option
    const customPlugin = webcontainerFilesPlugin({ directory: customDirName });

    // Load the virtual module using the custom plugin instance
    // Note: process.cwd() is already mocked to tempDir in beforeEach
    const result = customPlugin.load?.('\0virtual:webcontainer-files');

    // Parse the output
    expect(typeof result).toBe('string');
    const startIndex = (result as string).indexOf('{');
    const endIndex = (result as string).lastIndexOf('}') + 1;
    const filesObject = JSON.parse((result as string).substring(startIndex, endIndex));

    // Verify the custom file is loaded
    expect(filesObject).toHaveProperty('custom.txt');
    expect(filesObject['custom.txt']).toHaveProperty('file.contents');
    expect(filesObject['custom.txt'].file.contents).toBe(customFileContent);

    // Verify files from the default mock structure are NOT loaded
    expect(filesObject).not.toHaveProperty('package.json');

    // Clean up the custom directory
    if (existsSync(customDirPath)) {
      rmSync(customDirPath, { recursive: true, force: true });
    }
  });
  
  // New test for custom module ID
  it('should handle custom virtual module ID specified in options', () => {
    const customId = 'virtual:my-custom-files';
    const resolvedCustomId = '\0' + customId;

    // Instantiate plugin with custom module ID
    const customPlugin = webcontainerFilesPlugin({ moduleId: customId });

    // Check resolveId
    expect(customPlugin.resolveId?.(customId)).toBe(resolvedCustomId);
    // Check that the default ID is not resolved by this instance
    expect(customPlugin.resolveId?.('virtual:webcontainer-files')).toBeUndefined();
    // Check that other IDs are not resolved
    expect(customPlugin.resolveId?.('another-module')).toBeUndefined();

    // Check load (using the resolved custom ID)
    // process.cwd() is mocked to tempDir in beforeEach, 
    // and createMockFileStructure creates ./webcontainer-files inside tempDir
    // So, we expect the default directory content even with a custom module ID
    const result = customPlugin.load?.(resolvedCustomId);
    expect(typeof result).toBe('string');
    expect(result).toContain('export const files = {'); // Basic check for non-empty object
    expect(result).toContain('package.json'); // Check for one of the default files

    // Check that loading the default ID returns nothing for this instance
    expect(customPlugin.load?.('\0virtual:webcontainer-files')).toBeUndefined();
  });
});
