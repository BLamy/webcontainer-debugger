
# Creating a Vite Plugin for Dynamic File Bundling: The WebContainer Files Plugin

If you've ever needed to bundle and expose a directory of files in your web application, you're in for a treat. In this post, I'll explain how the `webcontainer-files` Vite plugin works, which allows you to dynamically bundle files from a directory and expose them as a JavaScript object at build time.

## What is the WebContainer Files Plugin?

The WebContainer Files plugin is a custom Vite plugin that creates a virtual module containing all files from a specific directory. This is particularly useful for applications that need to access file contents at runtime, such as in-browser development environments, WebContainer applications, or any scenario where you need to embed files in your JavaScript bundle.

## How It Works

Let's break down how this plugin works:

## Complete Implementation

Here's the complete plugin code:

```javascript
import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

export default function webcontainerFilesPlugin() {
  const virtualModuleId = 'virtual:webcontainer-files';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  return {
    name: 'webcontainer-files',
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        const rootDir = process.cwd();
        const webcontainerDir = resolve(rootDir, 'src/wmcp/webcontainer-files');
        const filesTree = {};

        console.log(`[webcontainer-files plugin] Loading files from: ${webcontainerDir}`);
        
        try {
          if (!existsSync(webcontainerDir)) {
            console.error(`[webcontainer-files plugin] Directory does not exist: ${webcontainerDir}`);
            return `export const files = {};`;
          }

          function readDirRecursive(dir, currentTree) {
            console.log(`[webcontainer-files plugin] Reading directory: ${dir}`);
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
      server.watcher.add(resolve(rootDir, 'src/wmcp/webcontainer-files/**/*'));
    }
  };
}
```

## Breaking It Down

### 1. Virtual Module Definition

```javascript
export default function webcontainerFilesPlugin() {
  const virtualModuleId = 'virtual:webcontainer-files';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;
  // ...
}
```

The plugin creates a virtual module with the ID `virtual:webcontainer-files`. In Vite, virtual modules are prefixed with `\0` when resolved to prevent other plugins from processing them.

### 2. Resolving the Virtual Module

```javascript
resolveId(id) {
  if (id === virtualModuleId) {
    return resolvedVirtualModuleId;
  }
}
```

This hook tells Vite how to resolve the virtual module ID when it's imported in your code.

### 3. Loading the Files

```javascript
load(id) {
  if (id === resolvedVirtualModuleId) {
    // ...loading logic...
  }
}
```

The `load` hook is where the magic happens. When Vite tries to load the virtual module, this code:

1. Defines the directory to read from (`src/wmcp/webcontainer-files`)
2. Creates an empty object to store the file tree
3. Recursively reads all files and directories

### 4. Building the File Tree

```javascript
function readDirRecursive(dir, currentTree) {
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
    }
  }
}
```

This recursive function:
- Lists all entries in a directory
- For each directory, creates a new node and recurses into it
- For each file, reads its contents and stores them in the tree

### 5. Exporting the File Tree

```javascript
return `export const files = ${JSON.stringify(filesTree, null, 2)};`;
```

The plugin generates JavaScript code that exports the file tree as a constant. This allows you to import it in your application.

### 6. Watching for Changes in Development Mode

```javascript
configureServer(server) {
  // Watch for changes in the webcontainer directory
  const rootDir = process.cwd();
  server.watcher.add(resolve(rootDir, 'src/wmcp/webcontainer-files/**/*'));
}
```

This tells Vite's development server to watch for changes in the files directory and refresh when needed.

## Using the Plugin in Your Vite Config

To use this plugin in a Vite project, you would add it to your `vite.config.js`:

```javascript
import { defineConfig } from 'vite';
import webcontainerFilesPlugin from './plugins/webcontainer-files';

export default defineConfig({
  plugins: [
    webcontainerFilesPlugin()
  ]
});
```

## Importing the Virtual Module in Your Code

You can now import the virtual module in your application code:

```javascript
import { files } from 'virtual:webcontainer-files';

console.log('Available files:', Object.keys(files));

// Access a specific file
if (files.package && files.package.file) {
  console.log('Package.json content:', files.package.file.contents);
}
```

## Practical Applications

This plugin is particularly useful for:

1. **WebContainer Applications**: Bundle files that will be available inside a WebContainer environment.
2. **Code Editors**: Pre-load example files or templates.
3. **Documentation Sites**: Embed code examples directly in your bundle.
4. **Static Content Management**: Bundle markdown files, configuration files, or other static content.

## Customizing the Plugin for Your Own Needs

You can easily customize this plugin for your own needs:

1. **Change the Source Directory**: Modify the `webcontainerDir` path.
2. **Transform File Contents**: Add processing for specific file types.
3. **Filter Files**: Add conditions to skip certain files or directories.
4. **Add Metadata**: Extend the file objects with additional information.

## Example Customization: Adding File Metadata

Here's how you could modify the plugin to include file metadata like size and modification time:

```javascript
// Create file node with metadata
const stats = statSync(fullPath);
currentTree[entry.name] = {
  file: {
    contents,
    metadata: {
      size: stats.size,
      modified: stats.mtime.toISOString()
    }
  }
};
```

## Conclusion

The WebContainer Files plugin demonstrates the power of Vite's plugin system. By creating a virtual module that bundles file contents at build time, you can easily embed a directory of files in your JavaScript application.

This pattern can be adapted for many different use cases, from embedding templates to creating in-browser development environments. The key insight is using Vite's virtual modules to transform a directory of files into a JavaScript object at build time.

Happy coding, and I hope this inspires you to create your own custom Vite plugins!