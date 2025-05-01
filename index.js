import './index.css'
import { WebContainer } from '@webcontainer/api';
import { files } from 'virtual:webcontainer-files';

// CodeMirror Imports - Corrected
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';
import { basicSetup } from 'codemirror'; // basicSetup is often pulled from the main 'codemirror' package or composed manually
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';

export class DebuggerPanel {
  constructor(container, debugSteps, onStepChangeCallback) {
    this.container = container;
    this.steps = debugSteps || []; // Use passed steps, default to empty array
    this.currentStep = 0;
    this.onStepChange = onStepChangeCallback; // Store the callback
    if (this.steps.length > 0) {
       this.render();
       this.setupListeners();
       this.updateDisplay(); // Initial display update including callback trigger
    } else {
       this.container.innerHTML = '<p>No debug steps available for this test.</p>';
    }
  }

  render() {
    this.container.innerHTML = /* html */ `
    <div class="wallaby-debugger flex flex-col h-full w-full overflow-hidden bg-[#252526] text-[#e0e0e0]">
      <div class="debugger-controls flex items-center gap-2 px-3 py-2 bg-[#2d2d2d] border-b border-[#333]">
        <button class="btn-first w-7 h-7 flex items-center justify-center rounded-sm bg-[#3c3c3c] hover:bg-[#4c4c4c]" title="First Step">⏮️</button>
        <button class="btn-prev  w-7 h-7 flex items-center justify-center rounded-sm bg-[#3c3c3c] hover:bg-[#4c4c4c]" title="Previous Step">◀️</button>
        <div class="step-counter flex-1 text-center text-xs text-[#cccccc]">Step ${this.currentStep + 1} of ${this.steps.length}</div>
        <button class="btn-next  w-7 h-7 flex items-center justify-center rounded-sm bg-[#3c3c3c] hover:bg-[#4c4c4c]" title="Next Step">▶️</button>
        <button class="btn-last  w-7 h-7 flex items-center justify-center rounded-sm bg-[#3c3c3c] hover:bg-[#4c4c4c]" title="Last Step">⏭️</button>
      </div>
  
      <div class="timeline h-[30px] flex items-center px-3 bg-[#2a2a2a]">
        <div class="timeline-track w-full h-1 bg-[#3c3c3c] relative flex items-center justify-between"></div>
      </div>
  
      <div class="variables-panel flex-1 overflow-y-auto pb-3"></div>
    </div>
  `;
  }

  setupListeners() {
    this.container.querySelector('.btn-first').addEventListener('click', () => this.goToStep(0));
    this.container.querySelector('.btn-prev').addEventListener('click', () => this.goToStep(this.currentStep - 1));
    this.container.querySelector('.btn-next').addEventListener('click', () => this.goToStep(this.currentStep + 1));
    this.container.querySelector('.btn-last').addEventListener('click', () => this.goToStep(this.steps.length - 1));
  }

  goToStep(step) {
    if (step >= 0 && step < this.steps.length && step !== this.currentStep) {
      console.log(`[DebuggerPanel] Moving from step ${this.currentStep} to step ${step}`);
      this.currentStep = step;
      
      // Update UI immediately for responsiveness
      this.container.querySelector('.step-counter').textContent = 
        `Step ${this.currentStep + 1} of ${this.steps.length}`;
      
      // Update timeline points to reflect the new active step
      const timelinePoints = this.container.querySelectorAll('.timeline-point');
      timelinePoints.forEach((point, index) => {
        if (index === this.currentStep) {
          point.classList.add('active');
        } else {
          point.classList.remove('active');
        }
      });
      
      // Perform the full update
      this.updateDisplay();
    }
  }

  updateDisplay() {
    this.container.querySelector('.step-counter').textContent = `Step ${this.currentStep + 1} of ${this.steps.length}`;
    this.updateTimeline();
    this.updateVariables();

    const step = this.steps[this.currentStep];
    if (step && this.onStepChange) {
      // Ensure file path is properly normalized
      let relativePath = step.file || '';
      
      // Normalize the path - strip leading slashes, handle empty paths
      relativePath = relativePath.trim();
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }
      
      // If the file path doesn't include extension, try to add .js
      if (relativePath && !relativePath.includes('.')) {
        relativePath = `${relativePath}.js`;
      }
      
      // Ensure line is a valid number (default to line 0 if not provided)
      const lineNumber = step.line ? parseInt(step.line, 10) : 0;
      
      // Log the callback call for debugging
      console.log(`[DebuggerPanel] Calling onStepChange with file='${relativePath}', line=${lineNumber}`);
      
      // Call the callback with normalized path and line number
      this.onStepChange(relativePath, lineNumber);
      
      // Update status bar position
      this.updateStatusPosition(relativePath, lineNumber);
    }
  }

  updateTimeline() {
    const track = this.container.querySelector('.timeline-track');
    track.innerHTML = '';
    
    this.steps.forEach((step, index) => {
      const point = document.createElement('div');
      point.className = 'timeline-point';
      if (index === this.currentStep) {
        point.className += ' active';
      }
      point.addEventListener('click', () => this.goToStep(index));
      point.setAttribute('title', `Step ${index + 1}`);
      track.appendChild(point);
    });
  }

  updateVariables() {
    const panel = this.container.querySelector('.variables-panel');
    panel.innerHTML = '';
    
    const step = this.steps[this.currentStep];
    if (!step || !step.vars) return;
    
    // Compare with previous step to highlight changes
    const prevStep = this.currentStep > 0 ? this.steps[this.currentStep - 1] : null;
    
    Object.entries(step.vars).forEach(([name, value]) => {
      const varEl = document.createElement('div');
      varEl.className = 'variable';
      
      // Check if value changed from previous step
      let changed = false;
      if (prevStep && prevStep.vars) {
        const prevValue = prevStep.vars[name];
        changed = JSON.stringify(prevValue) !== JSON.stringify(value);
      }
      
      if (changed) {
        varEl.className += ' changed';
      }
      
      varEl.innerHTML = `
        <span class="var-name">${name}</span>
        <span class="var-value">${this.formatValue(value)}</span>
      `;
      
      panel.appendChild(varEl);
    });
  }

  updateStatusPosition(file, line) {
    const statusPosition = document.getElementById('status-position');
    if (statusPosition) {
      statusPosition.textContent = `${file}:${line}`;
    }
  }

  formatValue(value) {
    if (value === undefined) return '<span class="undefined">undefined</span>';
    if (value === null) return '<span class="null">null</span>';
    
    if (typeof value === 'object') {
      try {
        return `<span class="object">${JSON.stringify(value)}</span>`;
      } catch (e) {
        return '<span class="object">[Object]</span>';
      }
    }
    
    if (typeof value === 'boolean') {
      return `<span class="boolean">${value}</span>`;
    }
    
    if (typeof value === 'number') {
      return `<span class="number">${value}</span>`;
    }
    
    if (typeof value === 'string') {
      return `<span class="string">"${value}"</span>`;
    }
    
    return String(value);
  }
}

/** @type {import('@webcontainer/api').WebContainer}  */
let webcontainerInstance;
/** @type {EditorView} */
let editorView;
let currentFile = 'utils.js';

// CodeMirror state field and effects for highlights
const clearHighlightEffect = StateEffect.define();
const addHighlightEffect = StateEffect.define();

// Highlight state field with proper clearing support
const highlightField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    
    for (let e of tr.effects) {
      if (e.is(clearHighlightEffect)) {
        // Completely clear decorations when clear effect is applied
        decorations = Decoration.none;
      } else if (e.is(addHighlightEffect)) {
        decorations = e.value;
      }
    }
    
    return decorations;
  },
  provide: f => EditorView.decorations.from(f)
});

// Function to clear the highlight - completely remove the effect
function clearEditorHighlight() {
  console.log('[Highlight] Clearing highlight');
  if (editorView) {
    try {
      // Use dedicated clear effect instead of empty decoration
      editorView.dispatch({
        effects: clearHighlightEffect.of(null)
      });
      console.log('[Highlight] Highlight cleared via effect');
    } catch (error) {
      console.error('[Highlight] Error clearing highlight:', error);
    }
  }
}

// Function to update editor highlight and status bar
async function updateEditorHighlight(file, line) {
  console.log(`[Highlight] Request to highlight: File='${file}', Line=${line}`);
  
  // Update status bar
  updateStatusPosition(file, line);
  
  if (!editorView) {
      console.warn('[Highlight] EditorView not ready.');
      return;
  }

  // Normalize file path - strip leading slashes and handle common path issues
  let normalizedFile = file.trim();
  if (normalizedFile.startsWith('/')) {
    normalizedFile = normalizedFile.substring(1);
  }
  
  console.log(`[Highlight] Normalized file path: '${normalizedFile}'`);

  const lineNumber = parseInt(line, 10);
  clearEditorHighlight();

  try {
    // Check if we need to switch files
    if (normalizedFile !== currentFile) {
      console.log(`[Highlight] File changed. Current: '${currentFile}', Target: '${normalizedFile}'. Attempting switch...`);
      
      // First try exact match
      let tabButton = document.querySelector(`.tab[data-file="${normalizedFile}"]`);
      
      // If not found, try case-insensitive match and basename matching as fallbacks
      if (!tabButton) {
        console.log(`[Highlight] Tab not found by exact match. Trying alternatives...`);
        const allTabs = document.querySelectorAll('.tab');
        for (const tab of allTabs) {
          const tabFile = tab.dataset.file;
          // Try basename match (ignoring directory parts)
          const normalizedBasename = normalizedFile.split('/').pop();
          const tabBasename = tabFile.split('/').pop();
          
          if (tabFile.toLowerCase() === normalizedFile.toLowerCase() || 
              tabBasename === normalizedBasename) {
            tabButton = tab;
            console.log(`[Highlight] Found tab through alternative match: '${tabFile}'`);
            break;
          }
        }
      }
      
      if (tabButton) {
        console.log(`[Highlight] Found tab for '${normalizedFile}'. Simulating click.`);
        // Directly update active tab styling
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tabButton.classList.add('active');
        
        // Update currentFile before reading the file
        currentFile = tabButton.dataset.file;
        
        try {
          // Read the file content directly instead of relying on click handler
          console.log(`[Highlight] Reading file '/${currentFile}'...`);
          const newContent = await webcontainerInstance.fs.readFile('/' + currentFile, 'utf-8');
          console.log(`[Highlight] Read success. Updating editor content.`);
          
          // Update content with clear effects
          editorView.dispatch({
            changes: { from: 0, to: editorView.state.doc.length, insert: newContent },
            effects: clearHighlightEffect.of(null)
          });
          console.log(`[Highlight] Content updated for ${currentFile}.`);
          
          // Small delay to ensure content is loaded before highlighting
          await new Promise(r => setTimeout(r, 50));
        } catch (fileErr) {
          console.error(`[Highlight] Failed to read file '${currentFile}':`, fileErr);
          editorView.dispatch({
            changes: { from: 0, to: editorView.state.doc.length, insert: `// Error loading ${currentFile}` },
            effects: clearHighlightEffect.of(null)
          });
        }
      } else {
        console.warn(`[Highlight] Tab for file '${normalizedFile}' not found. Attempting direct load.`);
        try {
          // Try with and without leading slash
          let content;
          try {
            content = await webcontainerInstance.fs.readFile('/' + normalizedFile, 'utf-8');
          } catch (err) {
            console.log(`[Highlight] Failed with leading slash, trying without...`);
            content = await webcontainerInstance.fs.readFile(normalizedFile, 'utf-8');
          }
          
          console.log(`[Highlight] Successfully read '${normalizedFile}' directly.`);
          currentFile = normalizedFile; // Update current file tracking
          
          // Clear previous highlights and update content
          clearEditorHighlight();
          editorView.dispatch({
            changes: { from: 0, to: editorView.state.doc.length, insert: content }
          });
          
          console.log(`[Highlight] Dispatched content change for '${normalizedFile}'.`);
          await new Promise(resolve => setTimeout(resolve, 100)); // Longer wait for rendering
        } catch (readErr) {
          console.error(`[Highlight] Failed to read file '${normalizedFile}' directly:`, readErr);
          clearEditorHighlight();
          return;
        }
      }
    } else {
      console.log(`[Highlight] File '${normalizedFile}' is already current.`);
    }

    // --- Highlighting Logic --- 
    console.log(`[Highlight] Proceeding to highlight line ${lineNumber} in current file.`);
    
    // Ensure highlights are cleared before adding new one
    clearEditorHighlight();
    
    // Small delay to ensure the clear takes effect
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const editorState = editorView.state;
    if (lineNumber > editorState.doc.lines) {
      console.warn(`[Highlight] Line number ${lineNumber} is out of bounds (Total Lines: ${editorState.doc.lines}).`);
      return;
    }
    
    // Get the line info and create the decoration
    const lineInfo = editorState.doc.line(lineNumber+1);
    const linePos = lineInfo.from;
    console.log(`[Highlight] Line ${lineNumber} starts at position ${linePos}.`);

    // Create a range decoration for more precise highlighting
    const highlightDecoration = Decoration.mark({
      attributes: { class: "cm-debugger-highlight" }
    });
    
    // Create decorations set with the line range
    const decorations = Decoration.set([
      highlightDecoration.range(linePos, lineInfo.to)
    ]);

    // Apply the highlight decoration
    editorView.dispatch({
      effects: addHighlightEffect.of(decorations),
      selection: { anchor: linePos },
      scrollIntoView: true
    });
    
    console.log(`[Highlight] Highlight applied to line ${lineNumber+1}.`);
    
    // Force another scroll after a delay to ensure visibility
    setTimeout(() => {
      editorView.dispatch({ scrollIntoView: true });
    }, 50);
    
  } catch (error) {
    console.error('[Highlight] Error during updateEditorHighlight:', error);
    clearEditorHighlight();
  }
}

document.querySelector('#app').innerHTML = /* html */ `
  <div class="flex flex-col h-screen w-full font-sans text-[#e0e0e0] bg-[#1e1e1e]">
    <!-- main split -->
    <div class="flex flex-1 overflow-hidden min-h-0">
      <!-- editor pane -->
      <div class="flex flex-col flex-1 min-w-[300px] overflow-hidden">
        <!-- header -->
        <div class="flex justify-between shrink-0 bg-[#252526] border-b border-[#333]">
          <div class="flex bg-[#252526]">
            <button class="tab px-4 py-2 text-sm text-[#cccccc]" data-file="utils.js">utils.js</button>
            <button class="tab px-4 py-2 text-sm text-[#cccccc]" data-file="utils.test.js">utils.test.js</button>
          </div>
          <div class="flex items-center pr-2">
            <button title="Toggle Debugger"
                    class="toggle-debugger w-7 h-7 flex items-center justify-center rounded-sm bg-[#3c3c3c] text-[#cccccc] hover:bg-[#4c4c4c] text-base">🐞</button>
          </div>
        </div>

        <!-- codemirror host -->
        <div class="relative flex-1 overflow-hidden bg-[#1e1e1e]">
          <div id="editor" class="absolute inset-0"></div>
        </div>
      </div>

      <!-- debugger pane -->
      <div id="debugger-section"
           class="flex flex-col w-[400px] border-l border-[#333] bg-[#252526] overflow-hidden">
        <!-- tabs -->
        <div class="flex bg-[#333] border-b border-[#444]">
          <button class="debugger-tab px-4 py-2 text-xs text-[#cccccc]" data-tab="debugger">DEBUGGER</button>
          <button class="debugger-tab px-4 py-2 text-xs text-[#cccccc]" data-tab="logs">LOGS</button>
        </div>

        <!-- debugger content -->
        <div class="debugger-tab-content flex flex-col flex-1 overflow-auto active" data-content="debugger">
          <div class="flex flex-col h-full">
            <!-- test list -->
            <div class="h-[300px] overflow-auto border-b border-[#333]">
              <div class="test-list-container h-[calc(100%-30px)] overflow-y-auto"></div>
            </div>
            <!-- debugger panel -->
            <div id="debugger-container" class="flex-1 overflow-auto relative w-full h-full">
              <div class="text-[#888] text-sm">Select a test to debug</div>
            </div>
          </div>
        </div>

        <!-- logs content -->
        <div class="debugger-tab-content flex-1 overflow-auto" data-content="logs">
          <div class="test-output flex flex-col flex-1"></div>
        </div>
      </div>
    </div>

    <!-- status bar -->
    <div class="flex justify-between items-center bg-[#007acc] text-white px-[10px] text-[12px] h-[22px] px-2">
      <div class="flex items-center gap-2">
        <span class="status-dot w-[8px] h-[8px] rounded-full bg-[#3BB446] mr-[6px]"></span>
        <span class="status-text">Ready</span>
      </div>
      <div id="status-position" class="text-center opacity-80"></div>
      <div class="flex gap-[10px] ">
        <span class="stats-item">TESTS: <span class="stats-passing">0</span>/<span class="stats-total">8</span></span>
        <span class="stats-time opacity-80">Last Run: --ms</span>
      </div>
    </div>
  </div>
`;
// Get elements
// const textareaEl = document.querySelector('textarea'); // No longer needed
const editorEl = document.getElementById('editor');
const testOutputEl = document.querySelector('.test-output');
const tabButtons = document.querySelectorAll('.tab');

// Function to create or update CodeMirror editor
function setupEditor(initialContent) {
  const state = EditorState.create({
    doc: initialContent,
    extensions: [
      basicSetup, // Includes line numbers, gutters, folding, etc.
      javascript(),
      oneDark, // Theme
      EditorView.lineWrapping,
      highlightField, // Use our custom field for debugger-driven highlighting
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          handleEditorChange(update.state.doc.toString());
        }
      })
    ]
  });

  if (editorView) {
    editorView.setState(state);
  } else {
    editorView = new EditorView({
      state,
      parent: editorEl
    });
  }
}

// Handle tab switching
tabButtons.forEach(tab => {
  const clickHandler = async () => { // Define the async handler
    document.querySelector('.tab.active').classList.remove('active');
    tab.classList.add('active');
    const newFile = tab.dataset.file;
    console.log(`[TabClick] Tab clicked: Target='${newFile}', Current='${currentFile}'`);

    if (newFile !== currentFile) {
        console.log(`[TabClick] Switching to file: ${newFile}`);
        
        // Clear highlights before changing file
        clearEditorHighlight();
        
        currentFile = newFile;
        try {
            console.log(`[TabClick] Reading file '/${currentFile}'...`);
            const newContent = await webcontainerInstance.fs.readFile('/' + currentFile, 'utf-8');
            console.log(`[TabClick] Read success. Dispatching content change.`);
            
            // Update content with clear effects
            editorView.dispatch({
                changes: { from: 0, to: editorView.state.doc.length, insert: newContent },
                effects: clearHighlightEffect.of(null) // Ensure highlight is cleared with content change
            });
            console.log(`[TabClick] Content dispatched for ${currentFile}.`);
        } catch (error) {
             console.error(`[TabClick] Failed to read file '${currentFile}':`, error);
             editorView.dispatch({
                changes: { from: 0, to: editorView.state.doc.length, insert: `// Error loading ${currentFile}` },
                effects: clearHighlightEffect.of(null)
             });
        }
    } else {
        console.log(`[TabClick] Clicked active tab '${currentFile}'. Clearing highlight.`);
        clearEditorHighlight();
    }
  };

  // Store the promise on the element for the highlight function to await
  tab.addEventListener('click', () => {
      tab.__clickHandlerPromise = clickHandler(); 
  });
});

// Function to handle editor changes
function handleEditorChange(newContent) {
  files[currentFile].file.contents = newContent;
  if (webcontainerInstance) {
    // Debounce or throttle this if needed for performance
    webcontainerInstance.fs.writeFile('/' + currentFile, newContent);
  }
}

// Function to update status indicator
function updateStatusIndicator(status, color = '#3BB446') {
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  const statusBar = document.querySelector('.status-bar');
  
  if (statusDot && statusText) {
    statusDot.style.backgroundColor = color;
    statusText.textContent = status;
  }
  
  // Update status bar color based on status type
  if (statusBar) {
    if (color === '#F14C4C') { // Error/Failure
      statusBar.style.backgroundColor = '#6F1717';
    } else if (color === '#E0AF0B') { // In progress/warning
      statusBar.style.backgroundColor = '#664D03';
    } else { // Success/normal
      statusBar.style.backgroundColor = '#007acc'; // Default blue
    }
  }
}

// Initialize editor on load
window.addEventListener('load', async () => {
  // Update status to initializing
  updateStatusIndicator('Initializing...', '#E0AF0B');
  
  // Setup editor with initial content *before* booting WebContainer
  setupEditor(files['utils.js'].file.contents);

  // Boot WebContainer
  updateStatusIndicator('Booting WebContainer...', '#E0AF0B');
  webcontainerInstance = await WebContainer.boot();
  await webcontainerInstance.mount(files);
  window.webcontainerInstance = webcontainerInstance;
  
  // Install dependencies
  updateStatusIndicator('Installing dependencies...', '#E0AF0B');
  testOutputEl.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <div class="loading-message">Installing dependencies...</div>
    </div>
  `;
  const installProcess = await webcontainerInstance.spawn('npm', ['install']);
  
  installProcess.output.pipeTo(new WritableStream({
    write(data) {
      console.log(data);
    }
  }));
  
  // Wait for install to complete
  const exitCode = await installProcess.exit;
  
  if (exitCode !== 0) {
    updateStatusIndicator('Installation failed', '#F14C4C');
    testOutputEl.textContent = 'Failed to install dependencies.';
    return;
  }
  
  // Run tests and collect debug steps
  await runTestsAndInitDebugger();
  
  // Update status to ready when everything is complete
  updateStatusIndicator('Ready', '#3BB446');
});

async function runTestsAndInitDebugger() {
  updateStatusIndicator('Running tests...', '#E0AF0B');
  testOutputEl.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <div class="loading-message">Running tests...</div>
    </div>
  `;

  try {
    // Run the test runner script
    const testProcess = await webcontainerInstance.spawn('npm', ['test', '--', 'utils.test.js']);

    let output = '';
    let testStartTime = Date.now();

    // Capture output
    testProcess.output.pipeTo(new WritableStream({
      write(data) {
        output += data;
        console.log(data); // Keep logging raw output
      }
    }));

    // Wait for the test process to complete
    const exitCode = await testProcess.exit;
    const testRunTime = Date.now() - testStartTime;
    
    // Update the stats time display
    document.querySelector('.stats-time').textContent = `Last Run: ${testRunTime} MS`;

    // Check test status
    let testStatus = 'Tests completed';
    let statusColor = '#3BB446';
    
    if (exitCode !== 0) {
      testStatus = 'Tests failed';
      statusColor = '#F14C4C';
    }
    
    updateStatusIndicator(testStatus, statusColor);

    // After the test process completes, check for files created by the babel plugin
    console.log('Checking for debug files created by babel-plugin-timeTravel...');

    // Define the time travel path
    const timeTravelDir = '/.timetravel';
   try {
    const timetravelContent = await webcontainerInstance.fs.readdir(timeTravelDir, { withFileTypes: true });
    const testSuitesData = await Promise.all(timetravelContent.filter(entry => !['DefaultSuite', 'UnknownTest'].includes(entry.name)).map( async (entry) => {
      const suiteName = entry.name;
      const suitePath = `${timeTravelDir}/${suiteName}`;
      const suiteContent = await webcontainerInstance.fs.readdir(suitePath, { withFileTypes: true });
      const testFiles = await Promise.all(suiteContent.filter(entry => entry.isFile() && entry.name.endsWith('.json')).map(async (file) => {
        const filePath = `${suitePath}/${file.name}`;
        const fileContent = await webcontainerInstance.fs.readFile(filePath, 'utf-8');
        return JSON.parse(fileContent);
      }));
      return {
        [suiteName]: testFiles
      }
    }));

    displayTestResults(output, testSuitesData);
    } catch (error) {
        if (error.code !== 'ENOENT') { // Ignore if .timetravel doesn't exist
            console.error('Error reading time travel directory:', error);
        } else {
            console.log('Time travel directory not found:', timeTravelDir);
        }
        // Display original output if reading fails or dir not found
        testOutputEl.innerHTML = formatTestOutput(output);
        // Ensure debugger container is cleared if there's an error loading data
        const debuggerContainer = document.getElementById('debugger-container');
        debuggerContainer.innerHTML = '';
    }
  } catch (e) {
    testOutputEl.textContent = `Error running tests: ${e.message}`;
    console.error('Error running tests:', e);
     // Ensure debugger container is cleared on error
     const debuggerContainer = document.getElementById('debugger-container');
     debuggerContainer.innerHTML = '';
  }
}

// Set up debugger tab functionality and toggle after DOM is loaded
window.addEventListener('load', function() {
  // Set up debugger toggle
  const toggleButton = document.querySelector('.toggle-debugger');
  const debuggerSection = document.getElementById('debugger-section');
  
  // Show debugger by default
  debuggerSection.classList.remove('hidden');
  toggleButton.classList.add('active');
  
  toggleButton.addEventListener('click', () => {
    const isVisible = !debuggerSection.classList.contains('hidden');
    if (isVisible) {
      debuggerSection.classList.add('hidden');
      toggleButton.classList.remove('active');
    } else {
      debuggerSection.classList.remove('hidden');
      toggleButton.classList.add('active');
    }
  });
  
  // Set up tab switching
  const debuggerTabs = document.querySelectorAll('.debugger-tab');
  debuggerTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      debuggerTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show corresponding content
      const tabName = tab.dataset.tab;
      const tabContents = document.querySelectorAll('.debugger-tab-content');
      tabContents.forEach(content => {
        content.classList.remove('active');
      });
      document.querySelector(`.debugger-tab-content[data-content="${tabName}"]`).classList.add('active');
    });
  });
});

// Function to display test results and the clickable test list
function displayTestResults(rawOutput, testSuitesData) {
  // Update logs tab content
  const outputEl = document.querySelector('.test-output');
  outputEl.innerHTML = `
    <input type="text" class="filter-input" placeholder="Filter (e.g. text @failed @todo @skipped @time>10)">
    ${formatTestOutput(rawOutput)}
  `;
  
  // Update test list for debugger
  const testListContainer = document.querySelector('.test-list-container');
  let testListHtml = '';

  const hasTestData = testSuitesData && 
                     Object.keys(testSuitesData).length > 0 && 
                     Object.values(testSuitesData).some(suite => Object.keys(suite).length > 0);

  // Count passing and failing tests from the output
  let passingTests = 0;
  let failingTests = 0;
  let totalTests = 0;
  
  // Parse test results from the raw output
  const testLines = rawOutput.split('\n');
  for (const line of testLines) {
    if (line.includes('✓')) {
      passingTests++;
      totalTests++;
    } else if (line.includes('✗')) {
      failingTests++;
      totalTests++;
    }
  }

  if (!hasTestData) {
    testListHtml = `
      <div class="no-data-message" style="padding: 20px;">
        <div class="no-data-icon">ⓘ</div>
        <div>No debug data found. Time travel debugging might not be enabled.</div>
      </div>
    `;
  } else {
    testListHtml = '<ul class="test-suite-list">';
    for (const suiteName in testSuitesData) {
      const tests = testSuitesData[suiteName];
      const hasTests = Object.keys(tests).length > 0;
      
      testListHtml += `<li class="test-suite">
        <div class="suite-header">
          <span class="status-indicator status-pass"></span>
          <span class="suite-name">${suiteName}</span>
        </div>
        <ul class="test-list">`;
      
      if (!hasTests) {
         testListHtml += '<li class="no-tests-message">No tests with debug data in this suite.</li>';
      } else {
        for (const testName in tests) {
          const stepFiles = tests[testName];
          
          // Check if test name appears in a failing test line
          const isFailing = testLines.some(line => 
            line.includes('✗') && line.toLowerCase().includes(testName.toLowerCase())
          );
          
          const statusClass = isFailing ? 'status-fail' : 'status-pass';
          const statusSymbol = isFailing ? '✗' : '✓';
          const statusColor = isFailing ? '#F14C4C' : '#3BB446';
          
          testListHtml += `
            <li class="debug-test-item ${isFailing ? 'failing' : ''}" data-suite="${suiteName}" data-test="${testName}" data-steps='${JSON.stringify(stepFiles)}'>
              <span class="test-status" style="color: ${statusColor}">${statusSymbol}</span>
              <span class="test-name">${testName}</span>
              <span class="test-steps">${stepFiles.length} steps</span>
            </li>`;
        }
      }
      testListHtml += '</ul></li>';
    }
    testListHtml += '</ul>';
  }
  
  testListContainer.innerHTML = testListHtml;

  // Add click listeners to test items
  addTestClickListeners();
  
  // Update test stats in status bar
  if (totalTests === 0 && hasTestData) {
    // If we couldn't parse test results but we have debug data, estimate from the debug data
    totalTests = Object.values(testSuitesData)
      .flatMap(suite => Object.keys(suite))
      .length;
    passingTests = totalTests; // Assume all passing until we have better data
  }
  
  document.querySelector('.stats-total').textContent = totalTests;
  document.querySelector('.stats-passing').textContent = passingTests;
  
  // Update the status indicator based on test results
  if (failingTests > 0) {
    updateStatusIndicator(`${failingTests} tests failed`, '#F14C4C');
  } else if (passingTests > 0) {
    updateStatusIndicator(`All ${passingTests} tests passed`, '#3BB446');
  } else {
    updateStatusIndicator('Tests completed', '#3BB446');
  }
}

// Function to add click listeners to the test items
function addTestClickListeners() {
  const testItems = document.querySelectorAll('.debug-test-item');
  const debuggerContainer = document.getElementById('debugger-container');

  testItems.forEach(item => {
    item.addEventListener('click', async (event) => {
      console.log('Clicked test item:', event.target.closest('.debug-test-item'));
      const clickedItem = event.target.closest('.debug-test-item');
      const stepPaths = JSON.parse(clickedItem.dataset.steps);
      const suiteName = clickedItem.dataset.suite;
      const testName = clickedItem.dataset.test;

      console.log(`Loading steps for ${suiteName} -> ${testName}:`, stepPaths);

      // Clear any existing highlights in the editor
      clearEditorHighlight();
      
      // Clear previous debugger instance and content
      debuggerContainer.innerHTML = `
        <div class="loading-container">
          <div class="loading-spinner"></div>
          <div class="loading-message">Loading debug data...</div>
        </div>
      `;

      // Highlight the clicked item
      document.querySelectorAll('.debug-test-item').forEach(el => {
        el.classList.remove('selected');
      });
      clickedItem.classList.add('selected');

      try {
        // Rename stepPaths to stepDataArray for clarity
        const stepDataArray = stepPaths; 

        if (!stepDataArray || stepDataArray.length === 0) {
          debuggerContainer.innerHTML = /* html */ `
            <div class="no-data">
              <div class="no-data-message">
                <div class="no-data-icon">ⓘ</div>
                <div>No debug data available for this test</div>
              </div>
            </div>
          `;
          return;
        }

        // The step data is already parsed from the data attribute.
        // No need to read files here. The array *is* the data.
        const debugSteps = stepDataArray; 
        console.log(`Using pre-loaded ${debugSteps.length} debug steps:`, debugSteps);

        if (debugSteps.length > 0) {
          // Expose debug steps globally for easier debugging if needed
          window.__debugSteps = debugSteps;

          // Clear loading message and initialize the debugger panel
          debuggerContainer.innerHTML = ''; // Clear 'Loading...'
          const debuggerPanel = new DebuggerPanel(debuggerContainer, debugSteps, updateEditorHighlight);
          
          // Update status bar with current file and line
          if (debugSteps[0].file && debugSteps[0].line) {
            updateStatusPosition(debugSteps[0].file, debugSteps[0].line);
          }
        } else {
          debuggerContainer.innerHTML = `
            <div class="no-data">
              <div class="no-data-message">
                <div class="no-data-icon">ⓘ</div>
                <div>No valid debug steps found for this test</div>
              </div>
            </div>
          `;
        }
      } catch (error) {
        console.error('Error loading debug steps:', error);
        debuggerContainer.innerHTML = `
          <div class="error">
            <div class="error-message">
              <div class="error-icon">⚠</div>
              <div>Failed to load debug data: ${error.message}</div>
            </div>
          </div>
        `;
      }
    });
  });
}

// Function to update the status position display
function updateStatusPosition(file, line) {
  const statusPosition = document.getElementById('status-position');
  if (statusPosition) {
    statusPosition.textContent = `${file}:${line}`;
  }
}

function formatTestOutput(output) {
  // Extract and format test results
  let formatted = '<pre class="test-results">';
  
  // Remove ANSI color codes and process output
  output = output.replace(/\u001b\[\d+m/g, '');
  
  // Look for test results
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.includes('✓') || line.includes('✗')) {
      // Highlight passed/failed tests
      if (line.includes('✓')) {
        formatted += `<span class="test-pass">${line}</span>\n`;
      } else {
        formatted += `<span class="test-fail">${line}</span>\n`;
      }
    } else if (line.includes('Test Files')) {
      formatted += `<span class="test-summary">${line}</span>\n`;
    } else {
      formatted += line + '\n';
    }
  }
  
  formatted += '</pre>';
  return formatted;
}
