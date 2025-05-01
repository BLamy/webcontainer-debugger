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
