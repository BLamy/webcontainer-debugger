# WebContainer Debugger

A web-based debugging interface with an embedded code editor using WebContainer.

## Features

- In-browser code editor powered by CodeMirror
- WebContainer for running tests in the browser
- Time-travel debugging for JavaScript tests
- Step-by-step execution visualization

## How It Works

This project combines two powerful technologies to enable in-browser debugging:

### WebContainer Files Plugin

The `webcontainer-files.js` Vite plugin (located in `.vite/plugins/`) dynamically loads files from the `webcontainer-files` directory and makes them available to the WebContainer at runtime. This plugin:

- Recursively reads the `webcontainer-files` directory
- Builds a file tree structure compatible with WebContainer
- Exposes the files via a virtual module (`virtual:webcontainer-files`)
- Enables hot-reloading of WebContainer files during development

```javascript
// How the plugin is used in vite.config.js
import webcontainerFilesPlugin from './.vite/plugins/webcontainer-files'

export default defineConfig({
  // ...
  plugins: [webcontainerFilesPlugin()],
  // ...
});
```

### Time Travel Babel Plugin

The `babel-plugin-timeTravel.js` is a Babel plugin that runs inside the WebContainer to instrument JavaScript code for debugging. This plugin:

- Adds instrumentation points at key locations in the code
- Captures variable states at runtime
- Records execution steps with file, line number, and variable states
- Writes debug data to the `.timetravel` directory within the WebContainer
- Organizes debug data by test suite and test case

When a test runs inside the WebContainer, the plugin:

1. Captures the execution state at each instrumented line
2. Writes the state to JSON files in the `.timetravel` directory
3. The main application then reads these files to power the time-travel debugging UI

## Debug Architecture

The overall debugging architecture works as follows:

1. The application boots a WebContainer in the browser
2. Test files and the Babel plugin are loaded into the WebContainer
3. When tests run, the Babel plugin instruments the code and captures execution states
4. The debugger UI reads the captured states and provides a visual interface
5. The user can step forward/backward through code execution and inspect variables

This approach enables rich debugging features directly in the browser without any server-side components.

## GitHub Pages Deployment

This project is configured to automatically deploy to GitHub Pages when changes are pushed to the main branch.

### Automatic Deployment

The GitHub Actions workflow in `.github/workflows/deploy.yml` handles:

1. Building the project with Vite
2. Deploying the built files to GitHub Pages

### Manual Deployment

To manually deploy:

1. Build the project: `npm run build`
2. The build output will be in the `dist` directory
3. Deploy the `dist` directory to your preferred hosting service

### Setting Up GitHub Pages

1. Go to your repository settings
2. Navigate to Pages settings
3. Select "GitHub Actions" as the source
4. The site will be published at `https://[username].github.io/[repository-name]/`

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Building for Production

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```
