import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

// Accept options object, provide default
export default function webcontainerFilesPlugin(options = {}) {
  // Determine the virtual module ID from options or default
  const virtualModuleId = options.moduleId || 'virtual:webcontainer-files';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  // Determine the target directory from options or default
  const targetDirectory = options.directory || './webcontainer-files'; 

  return {
    name: 'webcontainer-files',
    enforce: 'pre', // Make sure it runs before other plugins
    
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        const rootDir = process.cwd();
        console.log(`[webcontainer-files plugin] Root directory: ${rootDir}`);
        // Resolve the target directory relative to rootDir
        const webcontainerDir = resolve(rootDir, targetDirectory); 
        const filesTree = {};

        console.log(`[webcontainer-files plugin] Loading files from: ${webcontainerDir}`);
        
        try {
          if (!existsSync(webcontainerDir)) {
            console.error(`[webcontainer-files plugin] Directory does not exist: ${webcontainerDir}`);
            return `export const files = {};`;
          }

          function readDirRecursive(dir, currentTree) {
            console.log(`[webcontainer-files plugin] Reading directory: ${dir}`);
            try {
              const entries = readdirSync(dir, { withFileTypes: true });
              
              for (const entry of entries) {
                const fullPath = join(dir, entry.name);
                
                if (entry.isDirectory()) {
                  // Create directory node
                  currentTree[entry.name] = { directory: {} };
                  // Continue recursion with the directory's contents
                  readDirRecursive(fullPath, currentTree[entry.name].directory);
                } else {
                  // Create file node
                  const contents = readFileSync(fullPath, 'utf-8');
                  currentTree[entry.name] = {
                    file: {
                      contents
                    }
                  };
                  console.log(`[webcontainer-files plugin] Added file: ${entry.name}`);
                }
              }
            } catch (err) {
              console.error(`[webcontainer-files plugin] Error reading directory ${dir}:`, err);
            }
          }

          readDirRecursive(webcontainerDir, filesTree);
          
          console.log(`[webcontainer-files plugin] Generated filesTree with ${Object.keys(filesTree).length} entries`);
          return `export const files = ${JSON.stringify(filesTree, null, 2)};`;
        } catch (error) {
          console.error(`[webcontainer-files plugin] Error loading files:`, error);
          return `export const files = {}; // Error: ${error.message}`;
        }
      }
    },
    configureServer(server) {
      // Watch for changes in the webcontainer directory
      const rootDir = process.cwd();
      const watchedDir = resolve(rootDir, targetDirectory);
      server.watcher.add(watchedDir);

      // Invalidate the virtual module (and reload) when files change,
      // otherwise the generated tree goes stale after the first load.
      const invalidate = (file) => {
        if (!file.startsWith(watchedDir)) return;
        const mod = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        }
      };
      server.watcher.on('add', invalidate);
      server.watcher.on('change', invalidate);
      server.watcher.on('unlink', invalidate);
    }
  };
}
