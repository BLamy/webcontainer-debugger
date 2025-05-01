# WebContainer API Starter

WebContainer API is a browser-based runtime for executing Node.js applications and operating system commands. It enables you to build applications that previously required a server running.

WebContainer API is perfect for building interactive coding experiences. Among its most common use cases are production-grade IDEs, programming tutorials, or employee onboarding platforms.

## How To

For an up-to-date documentation, please refer to [our documentation](https://webcontainers.io).

## Cross-Origin Isolation

WebContainer _requires_ [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) to function. In turn, this requires your website to be [cross-origin isolated](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements). Among other things, the root document must be served with:

```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

You can check [our article](https://blog.stackblitz.com/posts/cross-browser-with-coop-coep/) on the subject and our [docs on browser support](https://developer.stackblitz.com/docs/platform/browser-support) for more details.

## Serve over HTTPS

Please note that your deployed page must be served over HTTPS. This is not necessary when developing locally, as `localhost` is exempt from some browser restrictions, but there is no way around it once you deploy to production.

## Demo

Check [the WebContainer API demo app](webcontainer.new).

Here's an example `main.ts` file:

```ts
import { WebContainer } from "@webcontainer/api";

const files: FileSystemTree = {
  "index.js": {
    file: {
      contents: "",
    },
  },
};

let webcontainer: WebContainer;

// add a textarea (the editor) and an iframe (a preview window) to the document
document.querySelector("#app").innerHTML = `
  <div class="container">
    <div class="editor">
      <textarea>I am a textarea</textarea>
    </div>
    <div class="preview">
      <iframe></iframe>
    </div>
  </div>
`;

// the editor
const textarea = document.querySelector("textarea");

// the preview window
const iframe = document.querySelector("iframe");

window.addEventListener("load", async () => {
  textarea.value = files["index.js"].file.contents;

  textarea.addEventListener("input", (event) => {
    const content = event.currentTarget.value;
    webcontainer.fs.writeFile("/index.js", content);
  });

  // call only once
  webcontainer = await WebContainer.boot();

  await webcontainer.mount(files);

  const exitCode = await installDependencies();

  if (exitCode !== 0) {
    throw new Error("Installation failed");
  }

  startDevServer();
});

async function installDependencies() {
  // install dependencies
  const installProcess = await webcontainer.spawn("npm", ["install"]);

  installProcess.output.pipeTo(
    new WritableStream({
      write(data) {
        console.log(data);
      },
    })
  );

  // wait for install command to exit
  return installProcess.exit;
}

async function startDevServer() {
  // run `npm run start` to start the express app
  await webcontainer.spawn("npm", ["run", "start"]);

  // wait for `server-ready` event
  webcontainer.on("server-ready", (port, url) => {
    iframe.src = url;
  });
}

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

# License

Copyright 2023 StackBlitz, Inc.
