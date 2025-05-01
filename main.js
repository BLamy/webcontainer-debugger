import './style.css'
import { WebContainer } from '@webcontainer/api';
import { DebuggerPanel } from './DebuggerPanel.js';
import { files } from 'virtual:webcontainer-files';

// CodeMirror Imports - Corrected
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration } from '@codemirror/view';
import { basicSetup } from 'codemirror'; // basicSetup is often pulled from the main 'codemirror' package or composed manually
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';

/** @type {import('@webcontainer/api').WebContainer}  */
let webcontainerInstance;
/** @type {EditorView} */
let editorView;
let currentHighlightMarker = null;
let currentFile = 'utils.js';
let currentHighlightDecoration = Decoration.none;

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

// Function to update editor file and highlight line
async function updateEditorHighlight(file, line) {
  console.log(`[Highlight] Request to highlight: File='${file}', Line=${line}`);
  if (!editorView) {
      console.warn('[Highlight] EditorView not ready.');
      return;
  }

  // Normalize file path - strip leading slashes and handle common path issues
  let normalizedFile = file.trim();
  if (normalizedFile.startsWith('/')) {
    normalizedFile = normalizedFile.substring(1);
  }
  // Handle any other necessary path normalization here
  
  console.log(`[Highlight] Normalized file path: '${normalizedFile}'`);

  const lineNumber = parseInt(line, 10);
  // if (isNaN(lineNumber) || lineNumber < 1) {
  //     console.warn(`[Highlight] Invalid line number: ${line}. Clearing highlight.`);
      clearEditorHighlight();
  //     return;
  // }

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
        // Create a Promise that will resolve when the file is loaded
        const fileLoadPromise = new Promise(resolve => {
          const listener = async () => {
            try {
              if (tabButton.__clickHandlerPromise) {
                await tabButton.__clickHandlerPromise;
              }
              // Wait a bit more for rendering
              await new Promise(r => setTimeout(r, 100));
              resolve();
            } catch (err) {
              console.error(`[Highlight] Error in tab click handler:`, err);
              resolve(); // Resolve anyway to prevent hanging
            }
          };
          
          tabButton.addEventListener('click', listener, { once: true });
          tabButton.click();
        });
        
        // Wait for file loading to complete
        await fileLoadPromise;
        console.log(`[Highlight] File '${normalizedFile}' should now be loaded.`);
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
    
    console.log(`[Highlight] Highlight applied to line ${lineNumber}.`);
    
    // Force another scroll after a delay to ensure visibility
    setTimeout(() => {
      editorView.dispatch({ scrollIntoView: true });
    }, 50);
    
  } catch (error) {
    console.error('[Highlight] Error during updateEditorHighlight:', error);
    clearEditorHighlight();
  }
}

// Create placeholder HTML
document.querySelector('#app').innerHTML = `
  <div class="container">
    <div class="editor">
      <div class="tabs">
        <button class="tab active" data-file="utils.js">utils.js</button>
        <button class="tab" data-file="utils.test.js">utils.test.js</button>
      </div>
      <div class="editor-container">
        <div id="editor"></div>
      </div>
    </div>
    <div class="results">
      <h3>Test Results</h3>
      <div class="test-output">Running tests...</div>
      <div id="debugger-container"></div>
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

// Initialize editor on load
window.addEventListener('load', async () => {
  // Setup editor with initial content *before* booting WebContainer
  setupEditor(files['utils.js'].file.contents);

  // Boot WebContainer
  webcontainerInstance = await WebContainer.boot();
  await webcontainerInstance.mount(files);
  window.webcontainerInstance = webcontainerInstance;
  // Install dependencies
  testOutputEl.textContent = 'Installing dependencies...';
  const installProcess = await webcontainerInstance.spawn('npm', ['install']);
  
  installProcess.output.pipeTo(new WritableStream({
    write(data) {
      console.log(data);
    }
  }));
  
  // Wait for install to complete
  const exitCode = await installProcess.exit;
  
  if (exitCode !== 0) {
    testOutputEl.textContent = 'Failed to install dependencies.';
    return;
  }
  
  // Run tests and collect debug steps
  await runTestsAndInitDebugger();
});

async function runTestsAndInitDebugger() {
  testOutputEl.textContent = 'Running tests...';

  try {
    // Run the test runner script
    const testProcess = await webcontainerInstance.spawn('node', ['test-runner.js']);

    let output = '';
    // let debugSteps = null; // We'll get steps dynamically now

    // Capture output
    testProcess.output.pipeTo(new WritableStream({
      write(data) {
        output += data;
        console.log(data); // Keep logging raw output
      }
    }));

    // Wait for the test process to complete
    const exitCode = await testProcess.exit;

    // After the test process completes, check for files created by the babel plugin
    console.log('Checking for debug files created by babel-plugin-timeTravel...');

    const timeTravelDir = '/.timetravel';
    let testSuitesData = {};

    try {
        const suiteDirs = await webcontainerInstance.fs.readdir(timeTravelDir, { withFileTypes: true });

        for (const suiteDir of suiteDirs) {
            if (suiteDir.isDirectory()) {
                const suitePath = `${timeTravelDir}/${suiteDir.name}`;
                const suiteName = suiteDir.name;
                testSuitesData[suiteName] = {};

                try {
                    const testDirs = await webcontainerInstance.fs.readdir(suitePath, { withFileTypes: true });
                    for (const testDir of testDirs) {
                        if (testDir.isDirectory()) {
                            const testPath = `${suitePath}/${testDir.name}`;
                            const testName = testDir.name;
                            try {
                                const stepFiles = await webcontainerInstance.fs.readdir(testPath);
                                const jsonStepFiles = stepFiles
                                    .filter(file => file.endsWith('.json') && !isNaN(parseInt(file.split('.')[0], 10))) // Ensure it's a numbered JSON
                                    .map(file => ({ path: `${testPath}/${file}`, name: file }))
                                    .sort((a, b) => {
                                        const numA = parseInt(a.name.match(/(\d+)\.json$/)[1], 10);
                                        const numB = parseInt(b.name.match(/(\d+)\.json$/)[1], 10);
                                        return numA - numB;
                                    })
                                    .map(file => file.path); // Only store paths

                                if (jsonStepFiles.length > 0) {
                                  testSuitesData[suiteName][testName] = jsonStepFiles;
                                } else {
                                  console.warn(`No JSON step files found in ${testPath}`);
                                }
                            } catch (readErr) {
                                console.error(`Error reading test directory ${testPath}:`, readErr);
                            }
                        }
                    }
                } catch (suiteReadErr) {
                    console.error(`Error reading suite directory ${suitePath}:`, suiteReadErr)
                }
            }
        }
        console.log('Test Suites Data:', testSuitesData);

        // Pass testSuitesData to the display function
        displayTestResults(output, testSuitesData); // Use the new display function

    } catch (error) {
        if (error.code !== 'ENOENT') { // Ignore if .timetravel doesn't exist
          console.error('Error reading time travel directory:', error);
        } else {
          console.log('Time travel directory /.timetravel not found.');
        }
        // Display original output if reading fails or dir not found
        testOutputEl.innerHTML = formatTestOutput(output);
         // Ensure debugger container is cleared if there's an error loading data
         const debuggerContainer = document.getElementById('debugger-container');
         debuggerContainer.innerHTML = '';
    }

    // Remove the old DebuggerPanel initialization here
    // // Set up the debugger if we have debug steps
    // if (debugSteps && Array.isArray(debugSteps)) {
    //   // Expose debug steps globally for debugging
    //   window.__debugSteps = debugSteps;
    //
    //   // Initialize the debugger panel
    //   const debuggerContainer = document.getElementById('debugger-container');
    //   const debuggerPanel = new DebuggerPanel(debuggerContainer);
    // } else {
    //   console.error('No debug steps found in test output.');
    // }
  } catch (e) {
    testOutputEl.textContent = `Error running tests: ${e.message}`;
    console.error('Error running tests:', e);
     // Ensure debugger container is cleared on error
     const debuggerContainer = document.getElementById('debugger-container');
     debuggerContainer.innerHTML = '';
  }
}

// Function to display test results and the clickable test list
function displayTestResults(rawOutput, testSuitesData) {
  let html = formatTestOutput(rawOutput); // Format the raw console output first

  html += '<div class="debug-test-list"><h4>Debuggable Tests:</h4>';

  if (Object.keys(testSuitesData).length === 0) {
    html += '<p>No debug data found.</p>';
  } else {
    html += '<ul>';
    for (const suiteName in testSuitesData) {
      html += `<li><strong>${suiteName}</strong><ul>`;
      const tests = testSuitesData[suiteName];
      if (Object.keys(tests).length === 0) {
         html += '<li>No tests with debug data in this suite.</li>';
      } else {
        for (const testName in tests) {
          const stepFiles = tests[testName];
          // Add data attributes for suite, test, and the paths string
          html += `<li class="debug-test-item" data-suite="${suiteName}" data-test="${testName}" data-steps='${JSON.stringify(stepFiles)}'>${testName} (${stepFiles.length} steps)</li>`;
        }
      }
      html += '</ul></li>';
    }
    html += '</ul>';
  }
  html += '</div>';

  testOutputEl.innerHTML = html;

  // Add click listeners after rendering the list
  addTestClickListeners();
}

// Function to add click listeners to the test items
function addTestClickListeners() {
  const testItems = document.querySelectorAll('.debug-test-item');
  const debuggerContainer = document.getElementById('debugger-container');

  testItems.forEach(item => {
    item.addEventListener('click', async (event) => {
      console.log('Clicked test item:', event.target);
      const stepPaths = JSON.parse(event.target.dataset.steps);
      const suiteName = event.target.dataset.suite;
      const testName = event.target.dataset.test;

      console.log(`Loading steps for ${suiteName} -> ${testName}:`, stepPaths);

      // Clear any existing highlights in the editor
      clearEditorHighlight();
      
      // Clear previous debugger instance and content
      debuggerContainer.innerHTML = 'Loading debug data...';

      try {
        const debugSteps = [];
        for (const path of stepPaths) {
          try {
            const content = await webcontainerInstance.fs.readFile(path, 'utf-8');
            debugSteps.push(JSON.parse(content));
          } catch (readError) {
             console.error(`Failed to read or parse step file ${path}:`, readError);
             // Optionally inform the user about the problematic file
             debuggerContainer.innerHTML = `<p style="color: red;">Error loading step: ${path}. Check console.</p>`;
             return; // Stop processing if a step fails
          }
        }

        console.log('Loaded debug steps:', debugSteps);

        if (debugSteps.length > 0) {
           // Expose debug steps globally for easier debugging if needed
           window.__debugSteps = debugSteps;

           // Clear loading message and initialize the debugger panel
           debuggerContainer.innerHTML = ''; // Clear 'Loading...'
           const debuggerPanel = new DebuggerPanel(debuggerContainer, debugSteps, updateEditorHighlight);
        } else {
          debuggerContainer.innerHTML = '<p>No valid debug steps found for this test.</p>';
        }
      } catch (error) {
        console.error('Error loading debug steps:', error);
        debuggerContainer.innerHTML = '<p style="color: red;">Failed to load debug data. See console for details.</p>';
      }
    });
  });
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

// Add CSS for the highlight
const styleElement = document.createElement('style');
styleElement.textContent = `
.cm-debugger-highlight {
  background-color: rgba(255, 165, 0, 0.3) !important;
  text-decoration: none !important;
  border-bottom: 2px solid orange !important;
  padding-bottom: 1px;
}

/* Add a left border to the line containing the highlight */
.cm-line:has(.cm-debugger-highlight) {
  background-color: rgba(255, 235, 59, 0.15) !important;
  border-left: 4px solid orange !important;
  padding-left: 4px;
}
`;
document.head.appendChild(styleElement);