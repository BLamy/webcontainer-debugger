// DebuggerPanel.js
import { Decoration } from "@codemirror/view";

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
    this.container.innerHTML = `
      <div class="debugger-panel">
        <div class="debugger-header">
          <h3>Time Travel Debugger</h3>
          <div class="step-counter">Step ${this.currentStep + 1} of ${this.steps.length}</div>
        </div>
        <div class="debugger-controls">
          <button class="btn-first" title="First Step">⏮</button>
          <button class="btn-prev" title="Previous Step">◀</button>
          <button class="btn-next" title="Next Step">▶</button>
          <button class="btn-last" title="Last Step">⏭</button>
        </div>
        <div class="timeline">
          <div class="timeline-track"></div>
        </div>
        <div class="code-location">
          <div class="file"></div>
          <div class="line"></div>
        </div>
        <div class="variables-panel"></div>
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
    this.updateCodeLocation();

    const step = this.steps[this.currentStep];
    if (step && this.onStepChange) {
      // Ensure file path is properly normalized
      let relativePath = step.file || '';
      
      // Normalize the path - strip leading slashes, handle empty paths
      relativePath = relativePath.trim();
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }
      
      // Ensure line is a valid number
      const lineNumber = step.line ? parseInt(step.line, 10) : 1;
      
      // Log the callback call for debugging
      console.log(`[DebuggerPanel] Calling onStepChange with file='${relativePath}', line=${lineNumber}`);
      
      // Call the callback with normalized path and line number
      this.onStepChange(relativePath, lineNumber);
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

  updateCodeLocation() {
    const step = this.steps[this.currentStep];
    if (!step) return;
    
    this.container.querySelector('.file').textContent = `File: ${step.file}`;
    this.container.querySelector('.line').textContent = `Line: ${step.line}`;
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

// Add styles for the debugger UI
const style = document.createElement('style');
style.textContent = `
  .debugger-panel {
    font-family: system-ui, sans-serif;
    background: #1e1e1e;
    color: #e0e0e0;
    border-radius: 4px;
    padding: 1rem;
    margin-top: 1rem;
  }
  
  .debugger-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  
  .debugger-controls {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  
  .debugger-controls button {
    background: #333;
    color: white;
    border: none;
    border-radius: 4px;
    width: 2rem;
    height: 2rem;
    cursor: pointer;
    font-size: 1rem;
  }
  
  .debugger-controls button:hover {
    background: #444;
  }
  
  .timeline {
    height: 2rem;
    display: flex;
    align-items: center;
    margin-bottom: 1rem;
  }
  
  .timeline-track {
    width: 100%;
    height: 4px;
    background: #333;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .timeline-point {
    width: 12px;
    height: 12px;
    background: #555;
    border-radius: 50%;
    cursor: pointer;
  }
  
  .timeline-point.active {
    background: #61afef;
    transform: scale(1.2);
  }
  
  .code-location {
    font-family: monospace;
    background: #252525;
    padding: 0.5rem;
    border-radius: 4px;
    margin-bottom: 1rem;
  }
  
  .variables-panel {
    font-family: monospace;
    max-height: 300px;
    overflow-y: auto;
  }
  
  .variable {
    padding: 0.5rem;
    border-bottom: 1px solid #333;
    display: flex;
    justify-content: space-between;
  }
  
  .variable.changed {
    background: rgba(97, 175, 239, 0.1);
    border-left: 3px solid #61afef;
  }
  
  .var-name {
    font-weight: bold;
    margin-right: 1rem;
  }
  
  .undefined { color: #888; }
  .null { color: #888; }
  .boolean { color: #d19a66; }
  .number { color: #d19a66; }
  .string { color: #98c379; }
  .object { color: #61afef; }
`;
document.head.appendChild(style);